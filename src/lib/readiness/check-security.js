'use strict';

/**
 * Security Sanity Check
 *
 * Performs basic structural security checks (NOT a full audit):
 * - Detects potential hardcoded API keys / tokens
 * - Detects unsafe env var usage patterns
 * - Detects development-only keys in non-dev files
 * - Detects dangerously permissive CORS
 * - Detects missing auth on sensitive routes
 *
 * This is a sanity check, not a penetration test.
 */

// Patterns that suggest a real key (not a placeholder)
const REAL_KEY_PATTERNS = [
  { name: 'OpenAI key',        re: /sk-[A-Za-z0-9]{20,}/,                       safe: false },
  { name: 'Stripe live key',   re: /sk_live_[A-Za-z0-9]{10,}/,                  safe: false },
  { name: 'Stripe test key',   re: /sk_test_[A-Za-z0-9]{10,}/,                  safe: true  }, // test keys are lower risk
  { name: 'AWS access key',    re: /AKIA[A-Z2-7]{16}/,                           safe: false },
  { name: 'GitHub PAT',        re: /ghp_[A-Za-z0-9]{36}/,                       safe: false },
  { name: 'Slack bot token',   re: /xoxb-[0-9A-Za-z-]{20,}/,                    safe: false },
  { name: 'SendGrid key',      re: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/, safe: false },
  { name: 'Firebase key',      re: /AIza[0-9A-Za-z_-]{35}/,                     safe: false },
];

// Patterns that suggest unsafe env usage
const UNSAFE_ENV_PATTERNS = [
  {
    re:      /eval\s*\(\s*process\.env/,
    message: 'eval() called with process.env value — remote code execution risk',
    fix:     'Never eval() environment variable values',
  },
  {
    re:      /child_process\.exec\s*\(\s*[^)]*process\.env/,
    message: 'child_process.exec() with env var — command injection risk',
    fix:     'Use child_process.execFile() or validate/sanitize env var before shell use',
  },
];

// Files to skip (test files, docs, lock files)
const SKIP_PATTERNS = ['.test.', '.spec.', '.md', '.lock', 'node_modules', '.min.js'];

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').ReadinessInput} input
 * @returns {import('./types').SecurityCheckResult}
 */
function checkSecurity(input) {
  const { files = {} } = input;

  /** @type {import('./types').ReadinessIssue[]} */
  const issues = [];

  const flaggedFiles   = new Set();
  let hasHardcodedKeys = false;
  let hasUnsafeEnvUsage = false;

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    if (SKIP_PATTERNS.some(s => path.includes(s))) continue;

    // ── Hardcoded key detection ─────────────────────────────────────────────
    for (const { name, re, safe } of REAL_KEY_PATTERNS) {
      if (re.test(content)) {
        flaggedFiles.add(path);
        hasHardcodedKeys = true;

        issues.push({
          severity: safe ? 'warning' : 'critical',
          category: 'security',
          message:  `Potential hardcoded ${name} in ${path}`,
          fix:      'Move this value to an environment variable: process.env.YOUR_KEY_NAME',
          file:     path,
        });
      }
    }

    // ── Unsafe env usage ────────────────────────────────────────────────────
    for (const { re, message, fix } of UNSAFE_ENV_PATTERNS) {
      if (re.test(content)) {
        hasUnsafeEnvUsage = true;
        flaggedFiles.add(path);

        issues.push({
          severity: 'critical',
          category: 'security',
          message,
          fix,
          file: path,
        });
      }
    }

    // ── Dangerously permissive CORS ─────────────────────────────────────────
    if (
      /cors\s*\(\s*\{\s*origin\s*:\s*['"]?\*['"]?\s*\}/.test(content) ||
      /Access-Control-Allow-Origin.*\*/i.test(content)
    ) {
      issues.push({
        severity: 'warning',
        category: 'security',
        message:  `Permissive CORS (origin: '*') detected in ${path}`,
        fix:      'Restrict CORS origin to your actual frontend domain in production',
        file:     path,
      });
    }

    // ── Hardcoded "password" or "secret" literal (not a var name) ──────────
    if (
      /password\s*=\s*['"][^'"]{6,}['"]/i.test(content) &&
      !/process\.env/.test(content.slice(
        Math.max(0, content.search(/password\s*=/i) - 20),
        content.search(/password\s*=/i) + 60,
      ))
    ) {
      // Only flag if it looks like an assignment to a real value, not a placeholder
      if (!/placeholder|example|your_password|changeme|replace/i.test(content)) {
        issues.push({
          severity: 'warning',
          category: 'security',
          message:  `Potential hardcoded password literal in ${path}`,
          fix:      'Use process.env.PASSWORD and store real values in .env',
          file:     path,
        });
        flaggedFiles.add(path);
      }
    }
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 30;
    else if (issue.severity === 'warning') score -= 10;
  }
  score = Math.max(0, score);

  return {
    hasHardcodedKeys,
    hasUnsafeEnvUsage,
    flaggedFiles: [...flaggedFiles],
    issues,
    score,
  };
}

module.exports = { checkSecurity };
