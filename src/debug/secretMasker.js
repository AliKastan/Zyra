'use strict';

/**
 * secretMasker.js
 * Redacts secrets from strings and objects before sending to AI or logging.
 */

const REDACTED = '[REDACTED]';

// ── Pattern definitions ───────────────────────────────────────────────────────

// Stripe keys
const STRIPE_LIVE_KEY   = /\bsk_live_[A-Za-z0-9]{20,}\b/g;
const STRIPE_TEST_KEY   = /\bsk_test_[A-Za-z0-9]{20,}\b/g;
const STRIPE_WEBHOOK    = /\bwhsec_[A-Za-z0-9]{20,}\b/g;
const STRIPE_PK_LIVE    = /\bpk_live_[A-Za-z0-9]{20,}\b/g;
const STRIPE_PK_TEST    = /\bpk_test_[A-Za-z0-9]{20,}\b/g;

// JWT tokens — eyJ header (base64 encoded `{`) followed by payload and signature
const JWT_TOKEN         = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

// Bearer authorization header values
const BEARER_TOKEN      = /(Bearer\s+)[A-Za-z0-9\-._~+/]{10,}={0,2}/gi;

// AWS access keys
const AWS_ACCESS_KEY    = /\bAKIA[A-Z0-9]{16}\b/g;

// AWS secret access key (common pattern: 40 char base64-ish after known prefixes)
const AWS_SECRET_KEY    = /(aws[_\-]?secret[_\-]?access[_\-]?key\s*[=:]\s*)([A-Za-z0-9/+]{40})/gi;

// Supabase service role key — long JWT-like key starting with eyJ in a supabase context
// Caught by JWT_TOKEN pattern above, but also by key name patterns below.

// Generic key=value pairs where key contains sensitive words
// Matches: KEY=, SECRET=, TOKEN=, PASSWORD=, AUTH=, PRIVATE=, WEBHOOK=, CRED=
const SENSITIVE_KV_LINE = /\b((?:[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|AUTH|PRIVATE|WEBHOOK|CRED|APIKEY|API_KEY)[A-Z0-9_]*))\s*[=:]\s*(['"]?)([^\s'"&,;]{6,})\2/gi;

// Authorization header (full line value)
const AUTH_HEADER       = /((?:Authorization|Cookie|Set-Cookie|X-Api-Key|X-Auth-Token)\s*:\s*)([^\r\n]{6,})/gi;

// Ordered list of replacements to apply to a string
const STRING_PATTERNS = [
  // Named-group replacements
  { pattern: BEARER_TOKEN,       replacer: (_, prefix) => `${prefix}${REDACTED}` },
  { pattern: AWS_SECRET_KEY,     replacer: (_, prefix) => `${prefix}${REDACTED}` },
  { pattern: AUTH_HEADER,        replacer: (_, prefix) => `${prefix}${REDACTED}` },
  { pattern: SENSITIVE_KV_LINE,  replacer: (_, key, quote) => `${key}=${quote}${REDACTED}${quote}` },
  // Simple full-match replacements
  { pattern: STRIPE_LIVE_KEY,    replacer: REDACTED },
  { pattern: STRIPE_TEST_KEY,    replacer: REDACTED },
  { pattern: STRIPE_WEBHOOK,     replacer: REDACTED },
  { pattern: STRIPE_PK_LIVE,     replacer: REDACTED },
  { pattern: STRIPE_PK_TEST,     replacer: REDACTED },
  { pattern: JWT_TOKEN,          replacer: REDACTED },
  { pattern: AWS_ACCESS_KEY,     replacer: REDACTED },
];

// ── maskString ────────────────────────────────────────────────────────────────

/**
 * Redacts secrets from a plain string.
 * @param {string} str
 * @returns {string}
 */
function maskString(str) {
  if (typeof str !== 'string' || str.length === 0) return str;

  let result = str;
  for (const { pattern, replacer } of STRING_PATTERNS) {
    // Reset lastIndex for global patterns between calls
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacer);
    pattern.lastIndex = 0;
  }
  return result;
}

// ── maskEnvVars ───────────────────────────────────────────────────────────────

// Keys that should always be redacted regardless of value content
const ALWAYS_REDACT_KEYS = /(?:KEY|SECRET|TOKEN|PASSWORD|AUTH|PRIVATE|WEBHOOK|CRED|APIKEY|API_KEY|STRIPE|SUPABASE_SERVICE|VERCEL_TOKEN)/i;

/**
 * Redacts sensitive values from a flat key:value object (e.g. process.env).
 * @param {object} obj
 * @returns {object} - new object with secrets masked
 */
function maskEnvVars(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (ALWAYS_REDACT_KEYS.test(key)) {
      result[key] = REDACTED;
    } else if (typeof value === 'string') {
      result[key] = maskString(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ── maskObject ────────────────────────────────────────────────────────────────

/**
 * Recursively redacts secrets from a nested object/array.
 * @param {any} obj
 * @param {number} depth - internal recursion guard
 * @returns {any}
 */
function maskObject(obj, depth = 0) {
  if (depth > 10) return obj; // guard against deeply nested circular refs

  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return maskString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => maskObject(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (ALWAYS_REDACT_KEYS.test(key)) {
        // Redact the value but preserve the key so the caller knows the field exists
        result[key] = REDACTED;
      } else if (typeof value === 'string') {
        result[key] = maskString(value);
      } else {
        result[key] = maskObject(value, depth + 1);
      }
    }
    return result;
  }

  // Primitives (number, boolean, etc.) — safe as-is
  return obj;
}

module.exports = { maskString, maskEnvVars, maskObject };
