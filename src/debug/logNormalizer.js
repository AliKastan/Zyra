'use strict';

/**
 * logNormalizer.js
 * Converts raw signal data into structured NormalizedError arrays.
 */

const { v4: uuidv4 } = require('uuid');
const { maskString } = require('./secretMasker');

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCES = [
  'console', 'server', 'build', 'deploy', 'runtime', 'api',
  'supabase', 'stripe', 'framework', 'config', 'user', 'preview',
];

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

// ── Category classification ───────────────────────────────────────────────────

const CATEGORY_RULES = [
  { category: 'import_error',     pattern: /cannot find module|module not found|failed to resolve|could not resolve/i },
  { category: 'env_error',        pattern: /process\.env\.[A-Z_]+.*undefined|missing.*env|env.*not.*set|environment variable/i },
  { category: 'hydration_error',  pattern: /hydration|hydrating|server.*client.*mismatch|client.*server.*mismatch|did not match/i },
  { category: 'type_error',       pattern: /TypeError|cannot read propert|cannot set propert|is not a function|undefined is not/i },
  { category: 'reference_error',  pattern: /ReferenceError|is not defined/i },
  { category: 'syntax_error',     pattern: /SyntaxError|unexpected token|unexpected end of|invalid or unexpected/i },
  { category: 'network_error',    pattern: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|net::ERR|network error|timeout|fetch failed/i },
  { category: 'database_error',   pattern: /supabase|postgres|postgresql|RLS|row level security|relation.*does not exist|permission denied.*table/i },
  { category: 'billing_error',    pattern: /stripe|webhook.*secret|payment|subscription|invoice/i },
  { category: 'auth_error',       pattern: /\b401\b|unauthorized|JWT expired|invalid.*token|token.*expired|not authenticated/i },
  { category: 'not_found',        pattern: /\b404\b|not found|no such file|ENOENT/i },
  { category: 'server_error',     pattern: /\b500\b|internal server error|unhandled.*exception|unhandledRejection/i },
  { category: 'build_error',      pattern: /webpack|vite|esbuild|rollup|parcel|compilation failed|build failed|transform failed/i },
  { category: 'dependency_error', pattern: /peer dep|peer dependency|version mismatch|incompatible.*version|npm install|yarn install/i },
  { category: 'cors_error',       pattern: /CORS|Access-Control|blocked by CORS|cross.?origin/i },
  { category: 'render_error',     pattern: /blank.*screen|white.*screen|nothing.*render|display.*none|visibility.*hidden/i },
];

/**
 * Classify a message string into a category.
 * @param {string} msg
 * @returns {string}
 */
function categorize(msg) {
  if (!msg || typeof msg !== 'string') return 'runtime_error';
  for (const { category, pattern } of CATEGORY_RULES) {
    if (pattern.test(msg)) return category;
  }
  return 'runtime_error';
}

// ── Severity classification ───────────────────────────────────────────────────

/**
 * Derive severity from message content and category.
 * @param {string} msg
 * @param {string} [category]
 * @returns {string}
 */
function classifySeverity(msg, category) {
  const m = (msg || '').toLowerCase();
  const cat = category || categorize(msg);

  if (
    /critical|fatal|panic|crash|abort|500|internal server error/.test(m) ||
    cat === 'server_error' ||
    cat === 'database_error'
  ) return 'critical';

  if (
    /error|failed|refused|unauthorized|401|403|cannot find|not defined/.test(m) ||
    cat === 'import_error' ||
    cat === 'auth_error' ||
    cat === 'network_error' ||
    cat === 'build_error' ||
    cat === 'type_error' ||
    cat === 'reference_error' ||
    cat === 'syntax_error'
  ) return 'high';

  if (
    /warning|warn|deprecated|mismatch|peer dep|cors/.test(m) ||
    cat === 'hydration_error' ||
    cat === 'cors_error' ||
    cat === 'dependency_error' ||
    cat === 'env_error'
  ) return 'medium';

  if (/not found|404|missing|undefined/.test(m)) return 'medium';

  if (/info|log|debug|notice/.test(m)) return 'info';

  return 'low';
}

// ── Source detection ──────────────────────────────────────────────────────────

function detectSource(raw, fallback) {
  if (fallback && SOURCES.includes(fallback)) return fallback;
  const m = String(raw || '').toLowerCase();
  if (/stripe/.test(m))        return 'stripe';
  if (/supabase/.test(m))      return 'supabase';
  if (/webpack|vite|esbuild|rollup|build/.test(m)) return 'build';
  if (/deploy|vercel|netlify/.test(m)) return 'deploy';
  if (/express|server|node/.test(m)) return 'server';
  if (/next|react|vue|angular/.test(m)) return 'framework';
  if (/\.env|environment/.test(m)) return 'config';
  return 'console';
}

// ── Stack frame parsing ───────────────────────────────────────────────────────

/**
 * Extract file, line, column from a stack trace string.
 */
function parseStackLocation(stack) {
  if (!stack || typeof stack !== 'string') return { file: null, line: null, column: null };

  // Node.js style: at Function (/path/to/file.js:12:34)
  // Browser style: at http://localhost:3001/app.js:12:34
  const match = stack.match(/at\s+(?:\S+\s+)?\(?([\w./:@\-]+\.(?:js|ts|tsx|jsx|mjs|cjs)):(\d+):(\d+)\)?/);
  if (match) {
    return { file: match[1], line: parseInt(match[2], 10), column: parseInt(match[3], 10) };
  }

  // Browser: filename:line:col at end
  const simple = stack.match(/([\w./:@\-]+\.(?:js|ts|tsx|jsx|mjs|cjs)):(\d+):(\d+)/);
  if (simple) {
    return { file: simple[1], line: parseInt(simple[2], 10), column: parseInt(simple[3], 10) };
  }

  return { file: null, line: null, column: null };
}

// ── Single signal normalization ───────────────────────────────────────────────

/**
 * Normalize a single raw console/runtime error into a NormalizedError.
 * @param {string|object} raw
 * @param {string} defaultSource
 * @returns {NormalizedError}
 */
function normalizeOne(raw, defaultSource) {
  let message   = '';
  let stacktrace = null;
  let filename   = null;
  let lineno     = null;
  let colno      = null;

  if (typeof raw === 'string') {
    message = raw;
  } else if (raw && typeof raw === 'object') {
    message    = raw.message || raw.text || raw.msg || String(raw);
    stacktrace = raw.stack || raw.stacktrace || null;
    filename   = raw.filename || raw.file || null;
    lineno     = raw.lineno || raw.line || null;
    colno      = raw.colno || raw.column || null;
  }

  // Mask secrets
  message    = maskString(String(message || ''));
  stacktrace = stacktrace ? maskString(stacktrace) : null;

  const category  = categorize(message);
  const severity  = classifySeverity(message, category);
  const source    = detectSource(message, defaultSource);

  // Try to extract location from stack if not directly provided
  if (!filename && stacktrace) {
    const loc = parseStackLocation(stacktrace);
    filename = loc.file;
    lineno   = loc.line;
    colno    = loc.column;
  }

  return {
    id:          uuidv4(),
    timestamp:   new Date().toISOString(),
    source,
    severity,
    category,
    message,
    stacktrace,
    file:        filename || null,
    line:        lineno   || null,
    column:      colno    || null,
  };
}

// ── Preview-state synthetic errors ───────────────────────────────────────────

function buildPreviewSignalErrors(previewState) {
  if (previewState === 'blank') {
    return [normalizeOne({
      message:  'Preview is blank — application may not be rendering any visible content.',
      filename: null,
    }, 'preview')];
  }
  if (previewState === 'error') {
    return [normalizeOne({
      message: 'Preview failed to load — the preview service reported an error state.',
      filename: null,
    }, 'preview')];
  }
  return [];
}

// ── User description normalization ────────────────────────────────────────────

function normalizeUserDescription(description) {
  if (!description || typeof description !== 'string' || description.trim() === '') return [];
  const masked = maskString(description.trim());
  return [{
    id:          uuidv4(),
    timestamp:   new Date().toISOString(),
    source:      'user',
    severity:    'info',
    category:    categorize(masked),
    message:     masked,
    stacktrace:  null,
    file:        null,
    line:        null,
    column:      null,
  }];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Normalize all raw signals into a flat NormalizedError[].
 *
 * @param {object} signals
 * @param {Array<string|object>} [signals.consoleErrors]
 * @param {string}               [signals.userDescription]
 * @param {string}               [signals.previewState] - 'blank'|'loaded'|'error'|'unknown'
 * @returns {NormalizedError[]}
 */
function normalizeSignals(signals) {
  if (!signals || typeof signals !== 'object') return [];

  const result = [];

  // 1. Console / runtime errors
  const consoleErrors = Array.isArray(signals.consoleErrors) ? signals.consoleErrors : [];
  for (const raw of consoleErrors) {
    try {
      result.push(normalizeOne(raw, 'console'));
    } catch (e) {
      // Skip unparsable signals silently
    }
  }

  // 2. Preview state synthetic errors
  const previewErrors = buildPreviewSignalErrors(signals.previewState || 'unknown');
  result.push(...previewErrors);

  // 3. User description
  const userErrors = normalizeUserDescription(signals.userDescription);
  result.push(...userErrors);

  return result;
}

module.exports = { normalizeSignals, categorize, classifySeverity };
