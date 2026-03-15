'use strict';

/**
 * INTEGRATION VALIDATION
 *
 * Checks all integrations declared in the intent (AI, email, SMS, storage,
 * analytics, etc.) to ensure they are wired, not merely cosmetic.
 *
 * Checks:
 *   - Integration module file exists                            [major]
 *   - Required env vars are in .env.example                    [medium]
 *   - Initialization code exists in JS (not stub-only)         [major]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateIntegrations(ctx) {
  const { fileMap, filePaths, intent, blueprint } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  // Collect integrations from multiple possible sources
  const integrations = _collectIntegrations(intent, blueprint);

  if (integrations.length === 0) {
    return { status: 'pass', issues: [] };
  }

  const allJsContent = _joinFiles(fileMap, p => p.endsWith('.js') || p.endsWith('.ts'));
  const envContent   = fileMap.get('.env.example') || '';

  for (const integration of integrations) {
    const name = (integration.name || integration.type || integration).toLowerCase();
    const spec = INTEGRATION_SPECS[_matchSpec(name)] || null;
    if (!spec) continue; // unknown integration — skip deterministic checks

    // Check module file exists
    const hasFile = spec.filePaths.some(pattern =>
      [...filePaths].some(p => p.includes(pattern))
    );
    if (!hasFile) {
      issues.push({
        id:         `missing_integration_file:${name}`,
        severity:   'major',
        message:    `${spec.displayName} integration file not found (expected one of: ${spec.filePaths.join(', ')})`,
        suggestion: `Create a ${spec.filePaths[0]} module that initializes and exports the ${spec.displayName} client`,
      });
    }

    // Check init code exists
    const hasInit = spec.initPatterns.some(p => p.test(allJsContent));
    if (!hasInit && hasFile) {
      issues.push({
        id:         `missing_integration_init:${name}`,
        severity:   'major',
        message:    `${spec.displayName} file exists but no initialization code found — integration may be stub-only`,
        suggestion: `Initialize ${spec.displayName} client: ${spec.initExample}`,
      });
    }

    // Check env vars
    for (const envVar of spec.envVars) {
      if (!envContent.includes(envVar)) {
        issues.push({
          id:         `missing_integration_env:${name}:${envVar}`,
          severity:   'medium',
          message:    `${spec.displayName} requires ${envVar} but it is not in .env.example`,
          file:       '.env.example',
          suggestion: `Add ${envVar}=your_key_here to .env.example`,
        });
      }
    }
  }

  return { status: _checkStatus(issues), issues };
}

// ── Integration specs ────────────────────────────────────────────────────────

const INTEGRATION_SPECS = {
  openai: {
    displayName:  'OpenAI',
    filePaths:    ['openai.js', 'ai-service.js', 'ai.js', 'services/ai', 'lib/ai'],
    initPatterns: [/new OpenAI\s*\(/, /OpenAI\s*\(/, /openai\.chat/, /openai\.completions/],
    envVars:      ['OPENAI_API_KEY'],
    initExample:  'new OpenAI({ apiKey: process.env.OPENAI_API_KEY })',
  },
  anthropic: {
    displayName:  'Anthropic',
    filePaths:    ['anthropic.js', 'ai-service.js', 'claude.js'],
    initPatterns: [/new Anthropic\s*\(/, /anthropic\.messages/, /callClaude/],
    envVars:      ['ANTHROPIC_API_KEY'],
    initExample:  'new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })',
  },
  sendgrid: {
    displayName:  'SendGrid',
    filePaths:    ['sendgrid.js', 'email.js', 'mailer.js', 'services/email'],
    initPatterns: [/sgMail\.setApiKey/, /sendgrid\.setApiKey/, /@sendgrid\/mail/],
    envVars:      ['SENDGRID_API_KEY'],
    initExample:  'sgMail.setApiKey(process.env.SENDGRID_API_KEY)',
  },
  twilio: {
    displayName:  'Twilio',
    filePaths:    ['twilio.js', 'sms.js', 'services/sms'],
    initPatterns: [/new twilio\.Twilio/, /twilio\s*\(/, /client\.messages\.create/],
    envVars:      ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    initExample:  'new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)',
  },
  aws: {
    displayName:  'AWS S3',
    filePaths:    ['s3.js', 'storage.js', 'aws.js', 'services/storage'],
    initPatterns: [/new S3\s*\(/, /new AWS\.S3/, /s3\.upload\s*\(/, /s3\.putObject/],
    envVars:      ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    initExample:  'new AWS.S3({ accessKeyId: process.env.AWS_ACCESS_KEY_ID })',
  },
  firebase: {
    displayName:  'Firebase',
    filePaths:    ['firebase.js', 'firebase-config.js', 'services/firebase'],
    initPatterns: [/initializeApp\s*\(/, /firebase\.initializeApp/, /getFirestore/],
    envVars:      ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID'],
    initExample:  'initializeApp({ apiKey: process.env.FIREBASE_API_KEY })',
  },
  supabase: {
    displayName:  'Supabase',
    filePaths:    ['supabase.js', 'supabaseClient.js', 'lib/supabase'],
    initPatterns: [/createClient\s*\(/, /supabase\.from\s*\(/, /supabaseAdmin/],
    envVars:      ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    initExample:  'createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)',
  },
};

function _matchSpec(integrationName) {
  if (/openai|gpt|chatgpt/.test(integrationName))    return 'openai';
  if (/anthropic|claude/.test(integrationName))       return 'anthropic';
  if (/sendgrid|email|smtp/.test(integrationName))    return 'sendgrid';
  if (/twilio|sms/.test(integrationName))             return 'twilio';
  if (/aws|s3|storage/.test(integrationName))         return 'aws';
  if (/firebase/.test(integrationName))               return 'firebase';
  if (/supabase/.test(integrationName))               return 'supabase';
  return null;
}

function _collectIntegrations(intent, blueprint) {
  const result = [];

  // From intent.integrations array
  if (Array.isArray(intent.integrations)) {
    result.push(...intent.integrations);
  }

  // From intent features that mention integrations
  for (const feature of (intent.features || [])) {
    const name = (feature.name || '').toLowerCase();
    if (_matchSpec(name)) result.push(feature);
  }

  // From blueprint integrations field
  if (Array.isArray(blueprint.integrations)) {
    result.push(...blueprint.integrations);
  }

  // Deduplicate by name
  const seen = new Set();
  return result.filter(i => {
    const key = (i.name || i.type || i).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function _joinFiles(fileMap, predicate) {
  const parts = [];
  for (const [p, content] of fileMap) {
    if (predicate(p) && content) parts.push(content);
  }
  return parts.join('\n');
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

module.exports = { validateIntegrations };
