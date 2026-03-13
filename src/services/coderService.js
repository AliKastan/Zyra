const { callClaude } = require('../providers/anthropicProvider');
const { callOpenAI } = require('../providers/openaiProvider');
const {
  buildCoderPrompt,
  buildCoderRetryPrompt,
  buildAutoFixPrompt,
} = require('../generators/promptBuilder');
const { validateGeneratedCode, applyQuickFixes } = require('../utils/codeValidator');
const {
  buildContentExtractionPrompt,
  detectStyleTag,
  generateFromTemplate,
  TEMPLATE_TYPES,
} = require('../generators/templateSystem');
const { generateFallback } = require('../generators/fallbackGenerator');
const { safeJsonParse } = require('../utils/safeJsonParse');
const { withTimeout } = require('../utils/withTimeout');
const { env } = require('../config/env');
const limits = require('../config/limits');
const logger = require('../utils/logger');

// Error type constants
const ERROR_TYPES = {
  PARSE:   'parse_error',
  TIMEOUT: 'timeout_error',
  API:     'api_error',
  SCHEMA:  'schema_error',
};

// ── Template-hybrid path ───────────────────────────────────────────────────────

/**
 * Template-hybrid generation for simple landing pages / portfolios / generic sites.
 *
 * Makes ONE tiny API call (~80 system + ~50 user = ~130 prompt tokens) to extract
 * content variables, then injects them into a pre-written professional template.
 *
 * Total cost: ~350-600 tokens vs 12,000-18,000 for full generation (~96% cheaper).
 *
 * @param {string} userPrompt
 * @param {string} appType
 * @param {object} costTracker - optional cost tracking instance
 * @returns {Promise<{projectName, files, _template: true}>}
 */
async function runTemplateCoder(userPrompt, appType, costTracker) {
  const modelName = env.DEFAULT_CODER_MODEL;
  const styleTag  = detectStyleTag(userPrompt);

  logger.info(`coderService: template-hybrid — appType="${appType}" style="${styleTag}" model="${modelName}"`);

  const { system, user } = buildContentExtractionPrompt(userPrompt);

  let raw;
  try {
    const call = modelName === 'openai'
      ? callOpenAI(system, user, { maxTokens: limits.CONTENT_EXTRACTION_TOKENS })
      : callClaude(system, user, { maxTokens: limits.CONTENT_EXTRACTION_TOKENS });

    raw = await withTimeout(call, 30_000, 'ContentExtract');
  } catch (err) {
    logger.warn(`coderService: template content extraction failed (${err.message}), using defaults`);
    // If model call fails, still produce a result using defaults — no exception thrown
    const result = generateFromTemplate({}, styleTag, userPrompt);
    if (costTracker) costTracker.record('content-extract(fallback)', system, user, '');
    return result;
  }

  if (costTracker) costTracker.record('content-extract', system, user, raw);

  const { success, data } = safeJsonParse(raw);
  const contentVars = success && data ? data : {};
  const result = generateFromTemplate(contentVars, styleTag, userPrompt);
  logger.info(`coderService: template-hybrid complete — ${result.files.length} files, style=${styleTag}`);
  return result;
}

// ── Full generation path ───────────────────────────────────────────────────────

/**
 * Full code generation with retry logic and final fallback.
 *
 * @param {string} userPrompt
 * @param {object} plan
 * @param {string} mode - 'fast' | 'balanced' | 'quality'
 * @param {Function} [onRetry]  - callback(attempt, reason) for status logging
 * @param {object}  [costTracker]
 * @returns {Promise<{projectName, files, _fallback?}>}
 */
async function runFullCoder(userPrompt, plan, mode = 'balanced', onRetry, costTracker, fullstack = false) {
  const modelName  = env.DEFAULT_CODER_MODEL;
  const maxFiles   = limits.MODE_MAX_FILES[mode] || 20;
  const maxTokens  = limits.MODE_TOKENS[mode]?.coder || 12000;
  const maxRetries = limits.CODER_MAX_RETRIES || 2;

  logger.info(`coderService: full-gen model="${modelName}" mode="${mode}" maxTokens=${maxTokens}`);

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      logger.warn(`coderService: retry ${attempt}/${maxRetries} (${lastError?.message})`);
      if (typeof onRetry === 'function') onRetry(attempt, lastError?.message);
    }

    const { system, user } = attempt === 0
      ? buildCoderPrompt(userPrompt, plan, mode, { fullstack })
      : buildCoderRetryPrompt(userPrompt, plan, mode, attempt);

    // Reduce output budget on retries (simpler output expected)
    const attemptTokens = attempt === 0 ? maxTokens : Math.max(6000, Math.round(maxTokens * 0.65));

    let raw;
    try {
      const call = modelName === 'openai'
        ? callOpenAI(system, user, { maxTokens: attemptTokens })
        : callClaude(system, user, { maxTokens: attemptTokens });

      raw = await withTimeout(call, limits.CODER_TIMEOUT_MS, `Coder(${attempt + 1})`);
    } catch (err) {
      const isTimeout = err.message?.includes('timed out') || err.message?.includes('Coder');
      lastError = Object.assign(new Error(`Code generation failed: ${err.message}`), {
        errorType: isTimeout ? ERROR_TYPES.TIMEOUT : ERROR_TYPES.API,
      });
      logger.error(`coderService: API/timeout on attempt ${attempt}`, { error: err.message });
      if (isTimeout) break;
      continue;
    }

    if (costTracker) costTracker.record(attempt === 0 ? 'coder' : `coder-retry-${attempt}`, system, user, raw);

    logger.debug(`coderService: raw response length=${raw.length} tail="${raw.slice(-100)}"`);

    const { success, data, error, tier } = safeJsonParse(raw);
    if (!success) {
      lastError = Object.assign(new Error(`Coder returned invalid JSON: ${error}`), {
        errorType: ERROR_TYPES.PARSE,
      });
      logger.warn(`coderService: parse failed on attempt ${attempt} tier=${tier}`, { parseError: error });
      continue;
    }

    logger.debug(`coderService: parsed via tier ${tier}`);

    const validated = validateAndRepairOutput(data, userPrompt);
    if (!validated) {
      lastError = Object.assign(new Error('Coder response missing required "files" array'), {
        errorType: ERROR_TYPES.SCHEMA,
      });
      logger.warn(`coderService: schema invalid on attempt ${attempt}`);
      continue;
    }

    const result = enforceOutputLimits(validated, maxFiles);
    logger.info(`coderService: full-gen success on attempt ${attempt} — ${result.files.length} files`);
    return result;
  }

  // All retries exhausted — use template/fallback
  logger.warn(`coderService: all attempts failed — using fallback`, { lastError: lastError?.message });
  return generateFallback(userPrompt, plan);
}

// ── Public entry point ─────────────────────────────────────────────────────────

/**
 * Main code generation entry point.
 * Routes to template-hybrid or full generation based on complexity + mode.
 *
 * Routing:
 *   simple + (fast | balanced) + TEMPLATE_TYPES  → template-hybrid (cheap)
 *   everything else                               → full generation
 *
 * @param {string} userPrompt
 * @param {object} plan       - from plannerService
 * @param {string} mode
 * @param {Function} [onRetry]
 * @param {object}  [costTracker]
 * @param {object}  [complexity]  - from classifyComplexity
 */
async function runCoder(userPrompt, plan, mode, onRetry, costTracker, complexity) {
  const appType = complexity?.appType || plan?._appType || 'generic';
  const level   = complexity?.level || 'simple';

  // Detect if this app needs backend (auth, persistence, multi-user)
  const needsBackend = /\b(save|store|login|sign.?up|sign.?in|auth|user|account|database|todo|task|note|post|comment|cart|order|profile|message|chat|feed|bookmark|follow|like|vote|review|rating)\b/i.test(userPrompt);

  // Template-hybrid path: for marketing/landing page types OR prompts that
  // clearly ask for a website/page (not a functional app with custom logic).
  const isWebsitePrompt = /website|web site|landing|homepage|home page|page for|site for/i.test(userPrompt);
  const useTemplate = (
    (TEMPLATE_TYPES.has(appType) || (appType === 'generic' && isWebsitePrompt)) &&
    level === 'simple' &&
    mode !== 'quality' &&
    !needsBackend
  );

  if (useTemplate) {
    logger.info(`coderService: routing to template-hybrid (appType=${appType} level=${level} mode=${mode})`);
    return runTemplateCoder(userPrompt, appType, costTracker);
  }

  let result = await runFullCoder(userPrompt, plan, mode, onRetry, costTracker, needsBackend);
  if (needsBackend) result._needsBackend = true;

  // ── Post-generation code validation + multi-round auto-fix ────────────────
  // Skip for fallback/template output (already known-good)
  if (!result._fallback && !result._template) {
    const MAX_AI_FIX_ROUNDS = limits.AUTOFIX_MAX_ROUNDS || 2;
    let files     = result.files;
    let autoFixed = false;

    // Round 0: quick fixes — const→let via regex (no API call, instant)
    const initialErrors = validateGeneratedCode(files);
    if (initialErrors.length > 0) {
      logger.info(`coderService: validation found ${initialErrors.length} issue(s)`);
      initialErrors.forEach((e) => logger.debug(`  [${e.type}] ${e.file}: ${e.message}`));

      const quickFixed = applyQuickFixes(files, initialErrors);
      if (quickFixed !== files) {
        files     = quickFixed;
        autoFixed = true;
        logger.info('coderService: quick-fix applied (const→let)');
      }

      // Rounds 1…MAX_AI_FIX_ROUNDS: AI-powered fix for remaining issues
      for (let round = 0; round < MAX_AI_FIX_ROUNDS; round++) {
        const errors = validateGeneratedCode(files);
        if (errors.length === 0) break; // clean

        logger.info(`coderService: AI auto-fix round ${round + 1}/${MAX_AI_FIX_ROUNDS} — ${errors.length} issue(s)`);
        errors.forEach((e) => logger.debug(`  [${e.type}] ${e.file}: ${e.message}`));

        if (round === 0 && typeof onRetry === 'function') onRetry('autofix', 'Polishing code...');

        try {
          const fixed = await runAutoFix(userPrompt, files, errors, mode, costTracker);
          if (fixed) {
            files     = fixed;
            autoFixed = true;
          } else {
            break; // AI returned nothing useful
          }
        } catch (fixErr) {
          logger.warn(`coderService: auto-fix round ${round + 1} failed (non-fatal): ${fixErr.message}`);
          break;
        }
      }
    }

    if (autoFixed) result = { ...result, files, _autoFixed: true };
  }

  return result;
}

// ── Auto-fix ───────────────────────────────────────────────────────────────────

/**
 * Sends files + validation errors back to the AI for targeted fixing.
 * Returns fixed files array or null if the attempt failed.
 */
async function runAutoFix(userPrompt, files, errors, mode, costTracker) {
  const modelName = env.DEFAULT_CODER_MODEL;
  // Cap at 8000 tokens (enough for a targeted fix) but respect mode budget if lower
  const maxTokens = Math.min(8000, limits.MODE_TOKENS[mode]?.coder || 8000);

  const { system, user } = buildAutoFixPrompt(userPrompt, files, errors);

  let raw;
  try {
    const call = modelName === 'openai'
      ? callOpenAI(system, user, { maxTokens })
      : callClaude(system, user, { maxTokens });
    raw = await withTimeout(call, limits.AUTOFIX_TIMEOUT_MS || 60_000, 'AutoFix');
  } catch (err) {
    throw new Error(`Auto-fix model call failed: ${err.message}`);
  }

  if (costTracker) costTracker.record('coder-autofix', system, user, raw);

  const { success, data } = safeJsonParse(raw);
  if (!success || !data) return null;

  // Accept either { files: [...] } or raw array
  const fixedFiles = Array.isArray(data) ? data : (data.files || null);
  if (!Array.isArray(fixedFiles) || fixedFiles.length === 0) return null;

  // Validate structure and merge: use fixed version for known files, keep originals for others
  const fixedMap = new Map();
  for (const f of fixedFiles) {
    if (f && typeof f.path === 'string' && typeof f.content === 'string') {
      fixedMap.set(f.path, f.content);
    }
  }
  if (fixedMap.size === 0) return null;

  return files.map((f) =>
    fixedMap.has(f.path) ? { ...f, content: fixedMap.get(f.path) } : f,
  );
}

// ── Runtime error catcher injection ───────────────────────────────────────────

/**
 * Injects a minimal error-reporting script into every HTML file.
 * The script catches JS errors and sends them to the parent window via postMessage,
 * allowing the Zyra studio to detect and auto-fix runtime errors silently.
 *
 * Injected after <head> (or before first script / at file start as fallback).
 */
const RUNTIME_ERROR_CATCHER = `<script data-zyra="monitor">(function(){var p=window.parent;if(!p||p===window)return;function s(d){try{p.postMessage(d,'*');}catch(_){}}window.addEventListener('error',function(e){s({type:'ZYRA_RUNTIME_ERROR',error:{message:e.message||'Script error',source:e.filename||'',line:e.lineno||0,col:e.colno||0,stack:e.error&&e.error.stack||''}});});window.addEventListener('unhandledrejection',function(e){var r=e.reason;s({type:'ZYRA_RUNTIME_ERROR',error:{message:r&&r.message||String(r)||'Unhandled rejection',stack:r&&r.stack||''}});});}());</script>`;

function injectRuntimeErrorCatcher(files) {
  return files.map((f) => {
    if (!f.path.endsWith('.html')) return f;
    let content = f.content || '';

    if (content.includes('data-zyra="monitor"')) return f; // already injected

    // Inject as early as possible — right after <head> open tag
    if (/<head(\s[^>]*)?\s*>/i.test(content)) {
      content = content.replace(/(<head(\s[^>]*)?\s*>)/i, `$1\n${RUNTIME_ERROR_CATCHER}`);
    } else if (content.includes('<body')) {
      content = content.replace('<body', `${RUNTIME_ERROR_CATCHER}\n<body`);
    } else {
      content = RUNTIME_ERROR_CATCHER + '\n' + content;
    }

    return { ...f, content };
  });
}

// ── Backend SDK injection ───────────────────────────────────────────────────────

/**
 * Injects the ZyraApp SDK script tag into all HTML files and replaces
 * the __ZYRA_PROJECT_ID__ placeholder with the real project slug.
 *
 * @param {Array<{path: string, content: string}>} files
 * @param {string} projectSlug
 * @returns {Array<{path: string, content: string}>}
 */
function injectBackendSDK(files, projectSlug) {
  return files.map((f) => {
    if (!f.path.endsWith('.html')) return f;
    let content = f.content;
    // Inject SDK script tag if not already present
    if (!content.includes('/zyra-sdk.js')) {
      content = content.replace(/(<head[^>]*>)/i, '$1\n  <script src="/zyra-sdk.js"></script>');
    }
    // Replace placeholder with real project ID
    content = content.replace(/__ZYRA_PROJECT_ID__/g, projectSlug);
    return { ...f, content };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function validateAndRepairOutput(data, userPrompt) {
  if (!data || typeof data !== 'object') return null;

  if (!Array.isArray(data.files) || data.files.length === 0) {
    const nested = data.output || data.result || data.code || data.project;
    if (nested && Array.isArray(nested.files) && nested.files.length > 0) {
      data = nested;
    } else {
      return null;
    }
  }

  if (!data.projectName || typeof data.projectName !== 'string') {
    const { slugify } = require('../utils/slugify');
    data = { ...data, projectName: slugify(userPrompt) || 'generated-app' };
  }

  const validFiles = data.files
    .filter((f) => f && typeof f.path === 'string' && f.path.trim())
    .map((f) => ({
      ...f,
      path:    f.path.trim(),
      content: typeof f.content === 'string' ? f.content : String(f.content || ''),
    }));

  if (validFiles.length === 0) return null;
  return { ...data, files: validFiles };
}

function enforceOutputLimits(data, maxFiles) {
  let { files } = data;

  if (files.length > maxFiles) {
    logger.warn(`coderService: capping ${files.length}→${maxFiles} files`);
    files = files.slice(0, maxFiles);
  }

  files = files.map((f) => {
    const content = f.content || '';
    const bytes   = Buffer.byteLength(content, 'utf8');
    if (bytes > limits.MAX_FILE_SIZE_BYTES) {
      logger.warn(`coderService: truncating "${f.path}" (${bytes} bytes)`);
      return { ...f, content: content.slice(0, limits.MAX_FILE_SIZE_BYTES), _truncated: true };
    }
    return f;
  });

  let totalBytes = 0;
  for (const f of files) totalBytes += Buffer.byteLength(f.content || '', 'utf8');
  logger.info(`coderService: finalized ${files.length} files, ~${Math.round(totalBytes / 1024)}KB`);

  return { ...data, files };
}

module.exports = { runCoder, injectBackendSDK, injectRuntimeErrorCatcher };
