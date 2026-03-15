'use strict';

/**
 * ENVIRONMENT VARIABLE VALIDATION
 *
 * Scans JS files for process.env.VAR_NAME references and checks that each
 * referenced variable is documented in .env.example.
 *
 * Checks:
 *   - .env.example exists when env vars are used                [major → if missing]
 *   - Every process.env.VAR used in code appears in .env.example [medium]
 *   - Known integration env vars are documented                  [medium]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateEnv(ctx) {
  const { fileMap, filePaths, intent } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  // Collect all process.env.VAR_NAME references from JS files
  const usedVars = new Map(); // varName → Set<fromFile>

  for (const [filePath, content] of fileMap) {
    if (!filePath.endsWith('.js') && !filePath.endsWith('.ts')) continue;
    if (!content) continue;

    for (const m of content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
      const varName = m[1];
      // Skip obviously noise vars
      if (['NODE_ENV', 'PORT'].includes(varName)) continue;
      if (!usedVars.has(varName)) usedVars.set(varName, new Set());
      usedVars.get(varName).add(filePath);
    }
  }

  // Also collect from HTML (sometimes inline scripts use env-substituted vars)
  for (const [filePath, content] of fileMap) {
    if (!filePath.endsWith('.html')) continue;
    if (!content) continue;
    for (const m of content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
      const varName = m[1];
      if (!usedVars.has(varName)) usedVars.set(varName, new Set());
      usedVars.get(varName).add(filePath);
    }
  }

  if (usedVars.size === 0) {
    return { status: 'pass', issues: [] };
  }

  // Check .env.example existence
  const envExamplePath = filePaths.has('.env.example') ? '.env.example' : null;
  if (!envExamplePath) {
    issues.push({
      id:         'missing_env_example_with_vars',
      severity:   'major',
      message:    `.env.example is missing but ${usedVars.size} env var(s) are used in code: ${[...usedVars.keys()].slice(0, 5).join(', ')}`,
      file:       '.env.example',
      suggestion: 'Create .env.example and document all required environment variables',
    });
    // Can't do per-var checks without the file
    return { status: 'fail', issues };
  }

  // Parse declared vars from .env.example
  const envContent  = fileMap.get('.env.example') || '';
  const declaredVars = new Set();

  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      declaredVars.add(trimmed.slice(0, eqIdx).trim());
    }
  }

  // Flag undeclared vars
  for (const [varName, fromFiles] of usedVars) {
    if (!declaredVars.has(varName)) {
      const filesStr = [...fromFiles].slice(0, 3).join(', ');
      issues.push({
        id:         `undeclared_env_var:${varName}`,
        severity:   'medium',
        message:    `process.env.${varName} is used in code but not documented in .env.example (in: ${filesStr})`,
        file:       '.env.example',
        suggestion: `Add ${varName}=your_value_here to .env.example`,
      });
    }
  }

  // ── Check known integration env vars ────────────────────────────────────
  const integrationEnvVars = _getExpectedIntegrationVars(intent);
  for (const [varName, context] of integrationEnvVars) {
    if (!declaredVars.has(varName) && !usedVars.has(varName)) {
      issues.push({
        id:         `missing_integration_env:${varName}`,
        severity:   'medium',
        message:    `${context} requires ${varName} but it is not in .env.example`,
        file:       '.env.example',
        suggestion: `Add ${varName}=your_key_here to .env.example`,
      });
    }
  }

  return { status: _checkStatus(issues), issues };
}

/**
 * Returns expected env vars for known integrations based on intent flags.
 * @param {Object} intent
 * @returns {Map<string, string>}
 */
function _getExpectedIntegrationVars(intent) {
  const expected = new Map();
  if (intent.needsPayments) {
    expected.set('STRIPE_SECRET_KEY',      'Stripe billing');
    expected.set('STRIPE_PUBLISHABLE_KEY', 'Stripe billing');
  }
  if (intent.needsAuth) {
    expected.set('JWT_SECRET', 'JWT authentication');
  }
  // Check integrations array
  for (const integration of (intent.integrations || [])) {
    const name = (integration.name || integration.type || '').toLowerCase();
    if (name.includes('openai') || name.includes('gpt')) {
      expected.set('OPENAI_API_KEY', 'OpenAI integration');
    }
    if (name.includes('sendgrid') || name.includes('email')) {
      expected.set('SENDGRID_API_KEY', 'SendGrid email integration');
    }
    if (name.includes('twilio') || name.includes('sms')) {
      expected.set('TWILIO_ACCOUNT_SID', 'Twilio SMS integration');
    }
    if (name.includes('s3') || name.includes('aws') || name.includes('storage')) {
      expected.set('AWS_ACCESS_KEY_ID', 'AWS S3 integration');
    }
    if (name.includes('firebase')) {
      expected.set('FIREBASE_API_KEY', 'Firebase integration');
    }
    if (name.includes('supabase')) {
      expected.set('SUPABASE_URL', 'Supabase integration');
      expected.set('SUPABASE_ANON_KEY', 'Supabase integration');
    }
  }
  return expected;
}

/**
 * @param {import('./types').ValidationIssue[]} issues
 * @returns {import('./types').CheckStatus}
 */
function _checkStatus(issues) {
  if (issues.length === 0) return 'pass';
  if (issues.some(i => i.severity === 'critical' || i.severity === 'major')) return 'fail';
  return 'warning';
}

module.exports = { validateEnv };
