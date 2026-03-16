'use strict';

/**
 * Environment Variable Planning Checks
 *
 * Detects features that require env vars but have no plan for them:
 * - integrations without env placeholder plan
 * - secrets without .env.example entry
 * - env vars referenced in blueprint with no placeholder
 */

// Map of feature signals → required env vars
const FEATURE_ENV_REQUIREMENTS = [
  {
    signal:    /stripe|billing|payment|subscription/,
    vars:      ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY'],
    category:  'billing',
    label:     'Stripe billing',
  },
  {
    signal:    /openai|gpt|chat completion|llm chat/,
    vars:      ['OPENAI_API_KEY'],
    category:  'ai',
    label:     'OpenAI',
  },
  {
    signal:    /anthropic|claude api/,
    vars:      ['ANTHROPIC_API_KEY'],
    category:  'ai',
    label:     'Anthropic Claude',
  },
  {
    signal:    /supabase/,
    vars:      ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    category:  'database',
    label:     'Supabase',
  },
  {
    signal:    /sendgrid/,
    vars:      ['SENDGRID_API_KEY'],
    category:  'email',
    label:     'SendGrid',
  },
  {
    signal:    /resend email/,
    vars:      ['RESEND_API_KEY'],
    category:  'email',
    label:     'Resend',
  },
  {
    signal:    /twilio/,
    vars:      ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    category:  'communications',
    label:     'Twilio',
  },
  {
    signal:    /firebase/,
    vars:      ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID'],
    category:  'backend',
    label:     'Firebase',
  },
  {
    signal:    /jwt|json web token/,
    vars:      ['JWT_SECRET'],
    category:  'auth',
    label:     'JWT auth',
  },
  {
    signal:    /session|cookie.?secret/,
    vars:      ['SESSION_SECRET'],
    category:  'auth',
    label:     'Session management',
  },
  {
    signal:    /database|postgres|mongodb|mysql|prisma/,
    vars:      ['DATABASE_URL'],
    category:  'database',
    label:     'Database',
  },
  {
    signal:    /aws|s3 bucket|s3 storage/,
    vars:      ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    category:  'storage',
    label:     'AWS',
  },
];

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').PreventionInput} input
 * @returns {import('./types').PreventionIssue[]}
 */
function checkEnvPlanning(input) {
  const { intent = {}, product = {}, stack = {}, blueprint = {}, complexityReport = null } = input;

  const issues = [];
  const allText = _buildAllText(intent, product, blueprint, stack);
  const signals = complexityReport?.signals || {};

  for (const req of FEATURE_ENV_REQUIREMENTS) {
    // Use complexity signals where available, fall back to text search
    const isDetected = _isFeatureDetected(req, allText, signals);
    if (!isDetected) continue;

    // Check if env vars are already planned (mentioned in designNotes or fileList)
    const missingVars = req.vars.filter(v =>
      !allText.includes(v.toLowerCase()),
    );

    if (missingVars.length > 0) {
      issues.push({
        id: `env-missing-${req.category}-vars`,
        category: 'env',
        severity: 'high',
        action: 'safe_default_injected',
        reason: `${req.label} is required but the following env vars are not in the plan: ${missingVars.join(', ')}`,
        fix: `Add to .env.example: ${missingVars.map(v => `${v}=your_value`).join(', ')}`,
      });
    }
  }

  // ── Always: BASE_URL for server apps ─────────────────────────────────────
  const isServer = stack.backend || stack.tech?.backend || (stack.tech?.runtime || '').includes('node');
  if (isServer && !allText.includes('base_url') && !allText.includes('app_url')) {
    issues.push({
      id: 'env-missing-base-url',
      category: 'env',
      severity: 'low',
      action: 'generation_hint_added',
      reason: 'Server apps that generate URLs (emails, OAuth callbacks) need a BASE_URL env var to work correctly in different environments.',
      fix: 'Add BASE_URL=http://localhost:3000 to .env.example',
    });
  }

  return issues;
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _isFeatureDetected(req, allText, signals) {
  // Use complexity report signals first (more reliable)
  if (signals.hasBilling && /stripe|billing|payment/.test(req.signal.toString())) return true;
  if (signals.hasAI && /openai|anthropic|gpt|llm/.test(req.signal.toString())) return true;
  if (signals.hasDatabase && /database|postgres|mongodb|mysql|prisma/.test(req.signal.toString())) return true;
  if (signals.hasAuth && /jwt|session/.test(req.signal.toString())) return true;

  // Fall back to text matching
  return req.signal.test(allText);
}

function _buildAllText(intent, product, blueprint, stack) {
  return [
    intent.appType || '',
    (intent.features || []).map(f => `${f.name} ${f.description || ''}`).join(' '),
    product.summary || '',
    (product.pages || []).map(p => p.name || p).join(' '),
    blueprint.designNotes || '',
    (blueprint._designSpec?.generationHints || []).join(' '),
    (stack?.files || []).join(' '),
    (stack?.tech ? JSON.stringify(stack.tech) : ''),
  ].join(' ').toLowerCase();
}

module.exports = { checkEnvPlanning, FEATURE_ENV_REQUIREMENTS };
