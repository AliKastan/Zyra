const { callClaude, callClaudeStream, HAIKU_MODEL, SONNET_MODEL } = require('../providers/anthropicProvider');
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
const { parseFileDelimited } = require('../utils/parseFileDelimited');
const { safeJsonParse } = require('../utils/safeJsonParse');
const { slugify } = require('../utils/slugify');
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
  // Template extraction is a tiny structured call — always use Haiku (cheapest)
  const claudeModel = HAIKU_MODEL;
  const styleTag  = detectStyleTag(userPrompt);

  logger.info(`coderService: template-hybrid — appType="${appType}" style="${styleTag}" model="${modelName}"`);

  const { system, user } = buildContentExtractionPrompt(userPrompt);

  let raw;
  try {
    const call = modelName === 'openai'
      ? callOpenAI(system, user, { maxTokens: limits.CONTENT_EXTRACTION_TOKENS })
      : callClaude(system, user, { maxTokens: limits.CONTENT_EXTRACTION_TOKENS, model: claudeModel });

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
 * Builds a chunk handler for streaming coder output.
 * Scans accumulated text for ---FILE:--- / ---END FILE--- delimiters
 * and calls onProgress({ filesComplete, currentFile, filesTotal }) when state changes.
 */
function makeStreamProgressTracker(plan, onProgress) {
  if (!onProgress) return null;
  const filesTotal      = plan?.files?.length || 0;
  let lastEndCount      = 0;
  let lastCurrentFile   = null;

  return (_delta, fullText) => {
    // Count completed files
    const endCount = (fullText.match(/---END FILE---/gi) || []).length;

    // Find the last FILE: header that does NOT yet have an END FILE after it
    const fileHeaders = [...fullText.matchAll(/---FILE:\s*([^\n\r-]+?)\s*---/gi)];
    const currentFile = fileHeaders.length > endCount
      ? fileHeaders[fileHeaders.length - 1][1].trim()
      : null;

    if (endCount !== lastEndCount || currentFile !== lastCurrentFile) {
      lastEndCount    = endCount;
      lastCurrentFile = currentFile;
      onProgress({ filesComplete: endCount, currentFile, filesTotal });
    }
  };
}

/**
 * Full code generation with streaming + retry logic and final fallback.
 *
 * @param {string}   userPrompt
 * @param {object}   plan
 * @param {string}   mode       - 'fast' | 'balanced' | 'quality'
 * @param {Function} [onRetry]  - callback(attempt, reason)
 * @param {object}   [costTracker]
 * @param {Function} [onProgress] - callback({ filesComplete, currentFile, filesTotal })
 * @returns {Promise<{projectName, files, _fallback?}>}
 */
async function runFullCoder(userPrompt, plan, mode = 'balanced', onRetry, costTracker, onProgress) {
  const modelName   = env.DEFAULT_CODER_MODEL;
  // Model tiering:
  //   fast     → Haiku  (ultra-cheap, simple 2-6 file apps)
  //   balanced → Sonnet (real SaaS quality; 14K budget = ~55% cheaper than old 32K)
  //   quality  → Sonnet (maximum quality, 28K budget)
  const claudeModel = mode === 'fast' ? HAIKU_MODEL : SONNET_MODEL;
  const maxFiles    = limits.MODE_MAX_FILES[mode] || 20;
  const maxTokens   = limits.MODE_TOKENS[mode]?.coder || 16000;
  const maxRetries  = limits.CODER_MAX_RETRIES || 2;
  const useStream   = modelName !== 'openai'; // streaming only for Anthropic

  logger.info(`coderService: full-gen model="${modelName}" claude="${claudeModel}" mode="${mode}" maxTokens=${maxTokens} stream=${useStream}`);

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      logger.warn(`coderService: retry ${attempt}/${maxRetries} (${lastError?.message})`);
      if (typeof onRetry === 'function') onRetry(attempt, lastError?.message);
    }

    const saasIntent = plan?._saasIntent || null;
    const { system, user } = attempt === 0
      ? buildCoderPrompt(userPrompt, plan, mode, saasIntent)
      : buildCoderRetryPrompt(userPrompt, plan, mode, attempt);

    // Reduce output budget on retries (simpler output expected)
    const attemptTokens = attempt === 0 ? maxTokens : Math.max(3000, Math.round(maxTokens * 0.5));

    let raw;
    try {
      // Use streaming on first attempt (gives live file progress).
      // On retries fall back to non-streaming (simpler, more reliable).
      const onChunk = (attempt === 0 && useStream && onProgress)
        ? makeStreamProgressTracker(plan, onProgress)
        : null;

      const call = modelName === 'openai'
        ? callOpenAI(system, user, { maxTokens: attemptTokens })
        : (onChunk
            ? callClaudeStream(system, user, { maxTokens: attemptTokens, model: claudeModel }, onChunk)
            : callClaude(system, user, { maxTokens: attemptTokens, model: claudeModel }));

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

    logger.debug(`coderService: raw response length=${raw.length}`);

    // Parse using file-delimiter format (---FILE: path--- ... ---END FILE---)
    const { success, files, error } = parseFileDelimited(raw);

    if (!success || files.length === 0) {
      lastError = Object.assign(new Error(`Coder returned no file blocks: ${error}`), {
        errorType: ERROR_TYPES.PARSE,
      });
      logger.warn(`coderService: file parse failed on attempt ${attempt}`, { parseError: error });
      continue;
    }

    const projectName = slugify(userPrompt) || 'generated-app';
    const result = enforceOutputLimits({ projectName, files }, maxFiles);
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
 * @param {Function} [onProgress] - ({ filesComplete, currentFile, filesTotal }) => void
 */
async function runCoder(userPrompt, plan, mode, onRetry, costTracker, complexity, onProgress) {
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

  // Full generation: AI handles Supabase directly via config/supabase.js pattern.
  // ZyraApp SDK injection is not used for full-generation output.
  let result = await runFullCoder(userPrompt, plan, mode, onRetry, costTracker, onProgress);

  // ── Post-generation code validation + multi-round auto-fix ────────────────
  // Skip for fallback/template output (already known-good).
  // Skip for fast mode — saves an extra API call; fast mode trades perfection for speed.
  if (!result._fallback && !result._template && mode !== 'fast') {
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
  // AutoFix is a targeted small fix — always use Haiku for cost efficiency
  const maxTokens = Math.min(6000, limits.MODE_TOKENS[mode]?.coder || 6000);

  const { system, user } = buildAutoFixPrompt(userPrompt, files, errors);

  let raw;
  try {
    const call = modelName === 'openai'
      ? callOpenAI(system, user, { maxTokens })
      : callClaude(system, user, { maxTokens, model: HAIKU_MODEL });
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

// ── Viewport normalize injection ──────────────────────────────────────────────

/**
 * Injected as the LAST child of <head> so it wins over app styles.
 * Uses !important on the critical fill properties so generated app CSS
 * cannot accidentally shrink the viewport.
 */
const VIEWPORT_NORMALIZE = `<style data-zyra="viewport">` +
  `*,*::before,*::after{box-sizing:border-box}` +
  `html{width:100%!important;height:100%!important;margin:0!important;padding:0!important;overflow-x:hidden}` +
  `body{width:100%!important;min-height:100vh!important;margin:0!important;padding:0!important;overflow-x:hidden}` +
  `</style>`;

function injectViewportNormalize(files) {
  return files.map((f) => {
    if (!f.path.endsWith('.html')) return f;
    let content = f.content || '';
    if (content.includes('data-zyra="viewport"')) return f; // already injected
    // Inject BEFORE </head> so it comes after all app styles and wins specificity
    if (/<\/head>/i.test(content)) {
      content = content.replace(/<\/head>/i, `${VIEWPORT_NORMALIZE}\n</head>`);
    } else if (/<head(\s[^>]*)?\s*>/i.test(content)) {
      // Fallback: no closing head tag — inject after opening head
      content = content.replace(/(<head(\s[^>]*)?\s*>)/i, `$1\n${VIEWPORT_NORMALIZE}`);
    } else if (content.includes('<body')) {
      content = content.replace('<body', `${VIEWPORT_NORMALIZE}\n<body`);
    } else {
      content = VIEWPORT_NORMALIZE + '\n' + content;
    }
    return { ...f, content };
  });
}

// ── Runtime error catcher injection ───────────────────────────────────────────

/**
 * Injects a minimal error-reporting script into every HTML file.
 * The script catches JS errors and sends them to the parent window via postMessage,
 * allowing the Zyra studio to detect and auto-fix runtime errors silently.
 *
 * Injected after <head> (or before first script / at file start as fallback).
 */
const RUNTIME_ERROR_CATCHER = `<script data-zyra="monitor">(function(){var p=window.parent;if(!p||p===window)return;var _q=[];var _t=null;function flush(){if(!_q.length)return;try{p.postMessage({type:'ZYRA_RUNTIME_ERROR',errors:_q.slice()},'*');}catch(_){}; _q=[];_t=null;}function push(d){_q.push(d);if(_t)clearTimeout(_t);_t=setTimeout(flush,120);}window.addEventListener('error',function(e){push({message:e.message||'Script error',source:e.filename||'',line:e.lineno||0,col:e.colno||0,stack:e.error&&e.error.stack||'',level:'error'});});window.addEventListener('unhandledrejection',function(e){var r=e.reason;push({message:r&&r.message||String(r)||'Unhandled rejection',stack:r&&r.stack||'',level:'error'});});var _ce=console.error.bind(console);console.error=function(){_ce.apply(console,arguments);try{var msg=Array.prototype.slice.call(arguments).map(function(a){return typeof a==='string'?a:JSON.stringify(a);}).join(' ');push({message:msg,level:'error',source:'console.error'});}catch(_){}};var _cw=console.warn.bind(console);console.warn=function(){_cw.apply(console,arguments);try{var msg=Array.prototype.slice.call(arguments).map(function(a){return typeof a==='string'?a:JSON.stringify(a);}).join(' ');push({message:msg,level:'warn',source:'console.warn'});}catch(_){};};}());</script>`;

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

// ── Env loader injection ───────────────────────────────────────────────────────

/**
 * Injects <script src="/zyra-env/{slug}.js"></script> into the <head> of every HTML file.
 * This script runs before any app code and sets window.__ENV__ with user-configured vars.
 * The endpoint /zyra-env/:slug.js is served by envController.serveEnvScript.
 *
 * @param {Array<{path: string, content: string}>} files
 * @param {string} projectSlug
 * @returns {Array<{path: string, content: string}>}
 */
function injectEnvLoader(files, projectSlug) {
  const tag = `  <script src="/zyra-env/${projectSlug}.js"></script>`;
  return files.map((f) => {
    if (!f.path.endsWith('.html')) return f;
    let content = f.content || '';
    if (content.includes('/zyra-env/')) return f; // already injected
    // Inject as the very first child of <head>
    if (/<head(\s[^>]*)?\s*>/i.test(content)) {
      content = content.replace(/(<head(\s[^>]*)?\s*>)/i, `$1\n${tag}`);
    } else {
      content = `${tag}\n` + content;
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

module.exports = { runCoder, injectBackendSDK, injectEnvLoader, injectViewportNormalize, injectRuntimeErrorCatcher };
