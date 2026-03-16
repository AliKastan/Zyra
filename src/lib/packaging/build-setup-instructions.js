'use strict';

/**
 * Build Setup Instructions
 *
 * Produces FinalSetupInstructions from pipeline outputs:
 *   - required + optional env vars (derived from .env.example + validation + intent)
 *   - integration-specific setup guidance
 *   - install / dev / build / start commands from package.json
 *   - deploy notes
 */

// ── Known integrations catalog ─────────────────────────────────────────────────

const INTEGRATIONS_CATALOG = [
  {
    name:        'Stripe',
    pattern:     /stripe/i,
    envVars:     ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
    description: 'Payment processing and subscription billing',
    setupNote:   'Create a Stripe account, get API keys from the Dashboard, and configure a webhook endpoint for your deployment URL.',
    requiresKey: true,
  },
  {
    name:        'Supabase',
    pattern:     /supabase/i,
    envVars:     ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY'],
    description: 'PostgreSQL database, auth, and storage',
    setupNote:   'Create a Supabase project, copy the project URL and anon key from Project Settings → API.',
    requiresKey: true,
  },
  {
    name:        'OpenAI',
    pattern:     /openai|gpt-/i,
    envVars:     ['OPENAI_API_KEY'],
    description: 'AI completions and embeddings via GPT models',
    setupNote:   'Get an API key from platform.openai.com → API keys.',
    requiresKey: true,
  },
  {
    name:        'Anthropic',
    pattern:     /anthropic|claude/i,
    envVars:     ['ANTHROPIC_API_KEY'],
    description: 'AI completions via Claude models',
    setupNote:   'Get an API key from console.anthropic.com → API keys.',
    requiresKey: true,
  },
  {
    name:        'SendGrid',
    pattern:     /sendgrid/i,
    envVars:     ['SENDGRID_API_KEY'],
    description: 'Transactional email delivery',
    setupNote:   'Create a SendGrid account, verify your sender domain, and generate an API key.',
    requiresKey: true,
  },
  {
    name:        'Resend',
    pattern:     /resend/i,
    envVars:     ['RESEND_API_KEY'],
    description: 'Transactional email for developers',
    setupNote:   'Create a Resend account at resend.com, add your domain, and generate an API key.',
    requiresKey: true,
  },
  {
    name:        'Twilio',
    pattern:     /twilio/i,
    envVars:     ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    description: 'SMS and communications platform',
    setupNote:   'Get Account SID and Auth Token from console.twilio.com → Account Info.',
    requiresKey: true,
  },
  {
    name:        'Firebase',
    pattern:     /firebase/i,
    envVars:     ['FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_PROJECT_ID'],
    description: 'Google Firebase (auth, Firestore, storage)',
    setupNote:   'Create a Firebase project, go to Project Settings → Your apps → Web app to get config.',
    requiresKey: true,
  },
  {
    name:        'AWS',
    pattern:     /aws-sdk|s3\.|dynamodb/i,
    envVars:     ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    description: 'Amazon Web Services (S3, DynamoDB, etc.)',
    setupNote:   'Create an IAM user with appropriate permissions, generate access keys from AWS Console.',
    requiresKey: true,
  },
];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * @param {import('./types').PackagingInput} input
 * @param {import('./types').ProjectManifest} manifest
 * @returns {import('./types').FinalSetupInstructions}
 */
function buildSetupInstructions(input, manifest) {
  const { files = [], intent = {} } = input;

  const allContent = files.map(f => f.content || '').join('\n');
  const { installCommand, devCommand, buildCommand, startCommand } = _extractScripts(files);
  const { requiredEnvVars, optionalEnvVars } = _partitionEnvVars(manifest.requiredEnvVars || []);
  const integrations = _buildIntegrations(allContent, files, intent, manifest);
  const deployNotes  = _buildDeployNotes(files, manifest, integrations);

  return {
    requiredEnvVars,
    optionalEnvVars,
    integrations,
    installCommand,
    devCommand,
    buildCommand,
    startCommand,
    deployNotes,
  };
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Extract npm scripts from package.json in generated files.
 */
function _extractScripts(files) {
  const pkgFile = files.find(f => f.path === 'package.json' || f.path.endsWith('/package.json'));

  let pkg = null;
  if (pkgFile) {
    try { pkg = JSON.parse(pkgFile.content || '{}'); } catch (_) {}
  }

  const scripts = pkg?.scripts || {};

  return {
    installCommand: 'npm install',
    devCommand:     scripts.dev   ? 'npm run dev'   : (scripts.start ? 'npm start' : _inferDevCommand(files)),
    buildCommand:   scripts.build ? 'npm run build' : undefined,
    startCommand:   scripts.start ? 'npm start'     : undefined,
  };
}

function _inferDevCommand(files) {
  if (files.some(f => f.path === 'index.html')) return 'open index.html  # or serve with: npx serve .';
  return 'npm run dev';
}

/**
 * Separate required from optional env vars.
 * Optional = hasDefault === true OR category === 'core' with a default.
 */
function _partitionEnvVars(allVars) {
  const required = [];
  const optional = [];

  for (const v of allVars) {
    if (!v.required || (v.hasDefault && v.category === 'core')) {
      optional.push(v);
    } else {
      required.push(v);
    }
  }

  return { requiredEnvVars: required, optionalEnvVars: optional };
}

/**
 * Build integration specs by scanning file content for known service patterns.
 */
function _buildIntegrations(allContent, files, intent, manifest) {
  /** @type {import('./types').IntegrationSpec[]} */
  const specs = [];

  for (const catalog of INTEGRATIONS_CATALOG) {
    if (!catalog.pattern.test(allContent)) continue;

    // Determine which env vars from this integration are referenced
    const presentVars = catalog.envVars.filter(v =>
      allContent.includes(v) || manifest.requiredEnvVars.some(r => r.name === v)
    );
    if (presentVars.length === 0) continue;

    // Check if all key env vars have non-placeholder values in .env.example
    const envFile = files.find(f => f.path === '.env.example');
    const envContent = envFile?.content || '';
    const configured = presentVars.every(v => {
      const match = envContent.match(new RegExp(`^${v}=(.+)$`, 'm'));
      if (!match) return false;
      const val = match[1].trim();
      return val.length > 0 && !/^(your[-_]|xxx|changeme|placeholder|todo|<|\.\.\.)/i.test(val);
    });

    specs.push({
      name:        catalog.name,
      description: catalog.description,
      requiresKey: catalog.requiresKey,
      configured,
      envVars:     presentVars,
      setupNote:   catalog.setupNote,
    });
  }

  return specs;
}

/**
 * Generate deployment notes based on project characteristics.
 */
function _buildDeployNotes(files, manifest, integrations) {
  const notes = [];
  const hasPkg     = files.some(f => f.path === 'package.json');
  const hasServer  = files.some(f => /server\.(js|ts)$/.test(f.path));
  const hasDocker  = files.some(f => f.path === 'Dockerfile');
  const hasEnv     = files.some(f => f.path === '.env.example');
  const hasHtml    = files.some(f => f.path === 'index.html');

  if (hasEnv) {
    notes.push('Copy .env.example to .env and fill in all required values before deploying.');
  }

  if (hasDocker) {
    notes.push('Docker image ready. Run: docker build -t ' + manifest.projectName + ' . && docker run -p 3000:3000 ' + manifest.projectName);
  } else if (hasServer) {
    notes.push('Deploy to Railway, Render, or Heroku — set all env vars in the platform dashboard.');
    notes.push('For production: set NODE_ENV=production and use a process manager (PM2 or similar).');
  } else if (hasHtml) {
    notes.push('Static site — deploy to Netlify, Vercel, or GitHub Pages by pointing to the project folder.');
    notes.push('No build step required. Upload all files as-is.');
  }

  const unconfigured = integrations.filter(i => i.requiresKey && !i.configured);
  if (unconfigured.length > 0) {
    notes.push(`Add API keys for: ${unconfigured.map(i => i.name).join(', ')} before deploying to production.`);
  }

  if (manifest.integrations.includes('Supabase')) {
    notes.push('Run Supabase migrations after deploy: npx supabase db push (or apply SQL in the Supabase dashboard).');
  }

  return notes;
}

module.exports = { buildSetupInstructions };
