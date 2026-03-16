'use strict';

/**
 * Integration Readiness Check
 *
 * Detects common third-party integrations and verifies:
 * - API key env vars exist in .env.example
 * - Fallback logic exists for missing keys
 * - Integrations do not crash if keys are absent
 */

/**
 * Catalog of known integrations with their detection signatures.
 * @type {Array<{ name: string, keywords: string[], requiredVars: string[], optionalVars?: string[], category: string }>}
 */
const INTEGRATION_CATALOG = [
  {
    name:         'OpenAI',
    keywords:     ['openai', 'gpt', 'chat.completions', 'openai.com', 'from "openai"', "require('openai')"],
    requiredVars: ['OPENAI_API_KEY'],
    category:     'ai',
  },
  {
    name:         'Anthropic',
    keywords:     ['anthropic', 'claude', '@anthropic-ai', "@anthropic-ai/sdk"],
    requiredVars: ['ANTHROPIC_API_KEY'],
    category:     'ai',
  },
  {
    name:         'Stripe',
    keywords:     ['stripe', 'stripe.com', "require('stripe')", 'from "stripe"'],
    requiredVars: ['STRIPE_SECRET_KEY'],
    optionalVars: ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
    category:     'billing',
  },
  {
    name:         'Supabase',
    keywords:     ['supabase', '@supabase/supabase-js', "createClient("],
    requiredVars: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    optionalVars: ['SUPABASE_SERVICE_ROLE_KEY'],
    category:     'database',
  },
  {
    name:         'SendGrid',
    keywords:     ['sendgrid', '@sendgrid/mail', "require('@sendgrid"],
    requiredVars: ['SENDGRID_API_KEY'],
    optionalVars: ['SENDGRID_FROM_EMAIL'],
    category:     'email',
  },
  {
    name:         'Resend',
    keywords:     ['resend', "require('resend')", 'from "resend"'],
    requiredVars: ['RESEND_API_KEY'],
    category:     'email',
  },
  {
    name:         'Twilio',
    keywords:     ['twilio', "require('twilio')"],
    requiredVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    category:     'communications',
  },
  {
    name:         'Firebase',
    keywords:     ['firebase', 'firebase/app', '@firebase'],
    requiredVars: ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID'],
    optionalVars: ['FIREBASE_AUTH_DOMAIN', 'FIREBASE_STORAGE_BUCKET'],
    category:     'backend',
  },
  {
    name:         'AWS',
    keywords:     ['aws-sdk', '@aws-sdk', 'amazonaws.com'],
    requiredVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    optionalVars: ['AWS_REGION', 'AWS_S3_BUCKET'],
    category:     'storage',
  },
  {
    name:         'Cloudinary',
    keywords:     ['cloudinary', "require('cloudinary')", 'from "cloudinary"'],
    requiredVars: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
    category:     'storage',
  },
  {
    name:         'Pusher',
    keywords:     ['pusher', "require('pusher')", 'from "pusher"'],
    requiredVars: ['PUSHER_APP_ID', 'PUSHER_KEY', 'PUSHER_SECRET'],
    optionalVars: ['PUSHER_CLUSTER'],
    category:     'realtime',
  },
  {
    name:         'Google Analytics',
    keywords:     ['gtag', 'google-analytics', 'GA_MEASUREMENT_ID', 'googletagmanager'],
    requiredVars: ['GA_MEASUREMENT_ID'],
    category:     'analytics',
  },
];

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').ReadinessInput} input
 * @returns {import('./types').IntegrationCheckResult}
 */
function checkIntegrations(input) {
  const { files = {} } = input;
  const allContent      = Object.values(files).join('\n').toLowerCase();
  const envContent      = _getEnvFileContent(files);

  /** @type {import('./types').ReadinessIssue[]} */
  const issues = [];

  const detected     = [];
  const configured   = [];
  const unconfigured = [];

  for (const integration of INTEGRATION_CATALOG) {
    const isDetected = integration.keywords.some(kw => allContent.includes(kw.toLowerCase()));
    if (!isDetected) continue;

    detected.push(integration.name);

    // Check that required env vars are declared in .env.example or referenced
    const allVars = [
      ...integration.requiredVars,
      ...(integration.optionalVars || []),
    ];

    // A var is "configured" only if it appears in .env.example — not just anywhere in code.
    // Code references (process.env.KEY) mean it's _used_, not that it's _set_.
    const missingRequired = integration.requiredVars.filter(v =>
      !_varInEnvFile(v, envContent),
    );

    if (missingRequired.length === 0) {
      configured.push(integration.name);
    } else {
      unconfigured.push(integration.name);

      for (const v of missingRequired) {
        issues.push({
          severity: 'warning',
          category: 'integrations',
          message:  `${integration.name} detected but ${v} is not configured`,
          fix:      `Add ${v}=your_value_here to .env.example and handle the case where it is undefined`,
        });
      }
    }

    // Check for fallback / null-guard on the client initialization
    const hasFallback = _checkFallbackLogic(files, integration.name, integration.requiredVars);
    if (!hasFallback && missingRequired.length > 0) {
      issues.push({
        severity: 'info',
        category: 'integrations',
        message:  `${integration.name} client may crash on startup if API key is missing`,
        fix:      `Add a guard: if (!process.env.${integration.requiredVars[0]}) { console.warn('..'); } before initializing`,
      });
    }
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  let score = 100;
  if (detected.length === 0) {
    score = 100; // No integrations = no integration risk
  } else {
    const unconfiguredRatio = unconfigured.length / detected.length;
    score = Math.round(100 - unconfiguredRatio * 50);
    for (const issue of issues) {
      if (issue.severity === 'critical') score -= 20;
    }
    score = Math.max(0, score);
  }

  return { detected, configured, unconfigured, issues, score };
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _getEnvFileContent(files) {
  for (const [path, content] of Object.entries(files)) {
    if (path === '.env.example' || path === '.env.sample' ||
        path.endsWith('/.env.example') || path.endsWith('/.env.sample')) {
      return (content || '').toLowerCase();
    }
  }
  return '';
}

function _varInEnvFile(varName, envContent) {
  if (!envContent) return false;
  // Match KEY= at the start of a line in the env file
  return new RegExp(`(^|\\n)${varName}\\s*=`, 'i').test(envContent);
}

/**
 * Basic heuristic: check if there's a null-check or try/catch near the integration init.
 */
function _checkFallbackLogic(files, integrationName, requiredVars) {
  const keyVar = requiredVars[0];
  if (!keyVar) return true;

  for (const content of Object.values(files)) {
    if (typeof content !== 'string') continue;
    // Look for: if (!process.env.KEY) or try { ... } around the key reference
    if (
      content.includes(`!process.env.${keyVar}`) ||
      content.includes(`process.env.${keyVar} === undefined`) ||
      content.includes(`process.env.${keyVar} || `) ||
      /try\s*\{[^}]{0,200}process\.env/s.test(content)
    ) {
      return true;
    }
  }
  return false;
}

module.exports = { checkIntegrations, INTEGRATION_CATALOG };
