'use strict';

/**
 * Environment Configuration Check
 *
 * Verifies:
 * - .env.example exists
 * - Required env vars have placeholders
 * - No hardcoded secrets in code
 * - Runtime dependencies are declared
 */

// Patterns that suggest an env var is required
const ENV_VAR_USAGE_RE = /process\.env\.([A-Z][A-Z0-9_]{2,})/g;

// Patterns that suggest a hardcoded secret (basic structural check)
const HARDCODED_SECRET_PATTERNS = [
  /(['"`])sk-[A-Za-z0-9]{20,}\1/,          // OpenAI key
  /(['"`])sk_live_[A-Za-z0-9]{20,}\1/,     // Stripe live key
  /(['"`])sk_test_[A-Za-z0-9]{20,}\1/,     // Stripe test key
  /(['"`])AKIA[A-Z0-9]{16}\1/,             // AWS access key
  /(['"`])ghp_[A-Za-z0-9]{36}\1/,          // GitHub PAT
  /(['"`])xoxb-[0-9A-Za-z-]+\1/,          // Slack bot token
  /(['"`])eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\1/, // JWT (long)
];

// Env vars that are safe defaults / not truly secret
const SAFE_ENV_VARS = new Set([
  'NODE_ENV', 'PORT', 'HOST', 'DEBUG', 'LOG_LEVEL', 'NEXT_PUBLIC_APP_URL',
  'PUBLIC_URL', 'BASE_URL', 'APP_NAME', 'APP_VERSION', 'TZ', 'LANG',
]);

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').ReadinessInput} input
 * @returns {import('./types').EnvCheckResult}
 */
function checkEnv(input) {
  const { files = {} } = input;
  const filePaths = Object.keys(files);

  /** @type {import('./types').ReadinessIssue[]} */
  const issues = [];

  // ── .env.example presence ─────────────────────────────────────────────────
  const hasEnvExample = filePaths.some(p =>
    p === '.env.example' || p === '.env.sample' ||
    p.endsWith('/.env.example') || p.endsWith('/.env.sample'),
  );

  if (!hasEnvExample) {
    issues.push({
      severity: 'warning',
      category: 'env',
      message:  'No .env.example file found',
      fix:      'Create .env.example listing all required environment variables with placeholder values',
    });
  }

  // ── Env vars referenced in code ───────────────────────────────────────────
  const referencedVars = _collectReferencedVars(files);
  const requiredVars   = referencedVars.filter(v => !SAFE_ENV_VARS.has(v));

  // Vars missing from .env.example
  const envExampleContent = _getEnvExampleContent(files);
  const missingVars = requiredVars.filter(v => !_varInEnvFile(v, envExampleContent));

  for (const v of missingVars) {
    issues.push({
      severity: 'warning',
      category: 'env',
      message:  `Environment variable ${v} is used in code but not listed in .env.example`,
      fix:      `Add ${v}=your_value_here to .env.example`,
    });
  }

  // ── Hardcoded secrets detection ────────────────────────────────────────────
  const { hasHardcodedSecrets, flaggedFiles } = _detectHardcodedSecrets(files);

  if (hasHardcodedSecrets) {
    for (const f of flaggedFiles) {
      issues.push({
        severity: 'critical',
        category: 'env',
        message:  `Potential hardcoded secret detected in ${f}`,
        fix:      'Move the secret to an environment variable and reference via process.env',
        file:     f,
      });
    }
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 40;
    else if (issue.severity === 'warning') score -= 8;
  }
  score = Math.max(0, score);

  return {
    hasEnvExample,
    requiredVars,
    missingVars,
    hasHardcodedSecrets,
    issues,
    score,
  };
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _collectReferencedVars(files) {
  const vars = new Set();
  const skipExtensions = ['.md', '.json', '.env', '.example', '.sample', '.lock', '.png', '.jpg', '.svg'];

  for (const [path, content] of Object.entries(files)) {
    if (skipExtensions.some(ext => path.endsWith(ext))) continue;
    if (typeof content !== 'string') continue;

    let match;
    const re = new RegExp(ENV_VAR_USAGE_RE.source, 'g');
    while ((match = re.exec(content)) !== null) {
      vars.add(match[1]);
    }
  }

  return [...vars].sort();
}

function _getEnvExampleContent(files) {
  for (const [path, content] of Object.entries(files)) {
    if (path === '.env.example' || path === '.env.sample' ||
        path.endsWith('/.env.example') || path.endsWith('/.env.sample')) {
      return content || '';
    }
  }
  return '';
}

function _varInEnvFile(varName, envContent) {
  if (!envContent) return false;
  return new RegExp(`^${varName}\\s*=`, 'm').test(envContent);
}

function _detectHardcodedSecrets(files) {
  const flaggedFiles = [];
  const skipExtensions = ['.md', '.example', '.sample', '.lock', '.env'];

  for (const [path, content] of Object.entries(files)) {
    if (skipExtensions.some(ext => path.endsWith(ext))) continue;
    if (typeof content !== 'string') continue;

    for (const pattern of HARDCODED_SECRET_PATTERNS) {
      if (pattern.test(content)) {
        flaggedFiles.push(path);
        break; // one flag per file is enough
      }
    }
  }

  return { hasHardcodedSecrets: flaggedFiles.length > 0, flaggedFiles };
}

module.exports = { checkEnv };
