'use strict';

/**
 * Build Project Manifest
 *
 * Extracts and structures all machine-readable project metadata from pipeline
 * outputs into a single ProjectManifest object.
 */

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build the final project manifest from all pipeline outputs.
 *
 * @param {import('./types').PackagingInput} input
 * @returns {import('./types').ProjectManifest}
 */
function buildProjectManifest(input) {
  const {
    intent          = {},
    product         = {},
    stack           = {},
    blueprint       = {},
    complexityReport = null,
    files           = [],
    fileArtifacts   = null,
    validationReport = {},
    structuralRepairReport = null,
    projectName: nameOverride,
    generatedAt,
  } = input;

  const projectName = _resolveProjectName(nameOverride, blueprint, product, intent);
  const appType     = _resolveAppType(intent, product);
  const platforms   = _resolvePlatforms(intent, complexityReport, files);
  const stackSummary = _resolveStack(stack, intent, blueprint, files);

  const complexity     = complexityReport || {};
  const complexityTier = complexity.complexityTier || 'medium';
  const complexityScore = typeof complexity.totalScore === 'number' ? complexity.totalScore : 0;

  const features      = _resolveFeatures(intent, product);
  const integrations  = _resolveIntegrationNames(intent, product, files);
  const routes        = _resolveRoutes(product, blueprint, stack);
  const dataEntities  = _resolveDataEntities(intent, product, blueprint);
  const requiredEnvVars = _resolveRequiredEnvVars(files, validationReport, structuralRepairReport, intent);

  const fileCount       = files.length;
  const routeCount      = routes.length;
  const integrationCount = integrations.length;

  const projectId = _generateProjectId(projectName);
  const now       = new Date().toISOString();

  return {
    projectId,
    projectName,
    appType,
    platforms,
    stack: stackSummary,
    complexityTier,
    complexityScore,
    features,
    integrations,
    routes,
    dataEntities,
    requiredEnvVars,
    fileCount,
    routeCount,
    integrationCount,
    generatedAt: generatedAt || now,
    packagedAt:  now,
  };
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _resolveProjectName(override, blueprint, product, intent) {
  if (override && typeof override === 'string') return override;
  if (blueprint.projectName) return blueprint.projectName;
  if (product.appName)       return product.appName;
  if (product.displayName)   return product.displayName;
  const appName = intent.realContent?.appName;
  if (appName) return appName;
  if (intent.appType && intent.appType !== 'generic') return intent.appType;
  return 'my-app';
}

function _resolveAppType(intent, product) {
  return intent.appType || product.appType || 'generic';
}

function _resolvePlatforms(intent, complexityReport, files) {
  const platforms = ['web'];
  const signals   = complexityReport?.signals || {};

  const hasMobile = signals.hasMobile
    || (intent.features || []).some(f => /mobile|ios|android|expo|react.native/i.test(f.name + ' ' + (f.description || '')))
    || files.some(f => /app\.json|expo\.json|app\/\(tabs\)/i.test(f.path));

  if (hasMobile) platforms.push('mobile');

  return platforms;
}

function _resolveStack(stack, intent, blueprint, files) {
  const tech = stack.tech || {};

  const result = {
    frontend: tech.frontend || 'HTML5 + CSS3 + ES6 JavaScript',
    deployment: _inferDeployment(stack, blueprint, files),
  };

  if (tech.backend && tech.backend !== 'none') result.backend = tech.backend;
  if (tech.storage && tech.storage !== 'localStorage' && tech.storage !== 'none') result.database = tech.storage;

  if (intent.needsAuth || tech.auth) result.auth = tech.auth || 'JWT + bcrypt';
  if (intent.needsPayments) result.payments = _inferPaymentStack(intent, files);

  const signals = {};
  if (intent.features) {
    for (const f of intent.features) {
      const t = (f.name + ' ' + (f.description || '')).toLowerCase();
      if (/openai|gpt|anthropic|claude|gemini|ai|llm/.test(t)) { signals.hasAI = true; break; }
    }
  }
  if (signals.hasAI) result.ai = 'AI / LLM integration';

  return result;
}

function _inferDeployment(stack, blueprint, files) {
  const hasPkg    = files.some(f => f.path === 'package.json' || f.path.endsWith('/package.json'));
  const hasServer = files.some(f => /server\.(js|ts)$/.test(f.path));
  const hasDocker = files.some(f => f.path === 'Dockerfile');
  const hasProcfile = files.some(f => f.path === 'Procfile');
  const hasVercelJson = files.some(f => f.path === 'vercel.json');

  if (hasDocker) return 'Docker container';
  if (hasProcfile) return 'Heroku / PaaS';
  if (hasVercelJson) return 'Vercel';
  if (hasServer || hasPkg) return 'Node.js server';
  return 'Static hosting (Netlify / GitHub Pages / Vercel)';
}

function _inferPaymentStack(intent, files) {
  const hasStripe = files.some(f => /stripe/i.test(f.content || ''));
  if (hasStripe) return 'Stripe (Checkout + Webhooks)';
  return 'Payment integration (Stripe recommended)';
}

function _resolveFeatures(intent, product) {
  const features = [];
  const seen = new Set();

  const add = (name) => {
    const key = name.toLowerCase().trim();
    if (key && !seen.has(key)) { seen.add(key); features.push(name); }
  };

  // From intent features
  for (const f of (intent.features || [])) {
    if (f.name) add(f.name);
  }

  // From product pages (if no features)
  if (features.length === 0) {
    for (const p of (product.pages || [])) {
      if (p.name && p.name.toLowerCase() !== 'home') add(`${p.name} page`);
    }
  }

  // Infer from signals
  if (intent.needsAuth     && !seen.has('authentication')) add('Authentication (login / signup)');
  if (intent.needsPayments && !seen.has('payments'))       add('Payment processing (Stripe)');
  if (intent.isMultiUser   && !seen.has('multi-user'))     add('Multi-user support');

  return features.slice(0, 20); // cap at 20 for readability
}

function _resolveIntegrationNames(intent, product, files) {
  const integrations = new Set();

  // From file content
  const allContent = files.map(f => f.content || '').join('\n').toLowerCase();
  if (/stripe/.test(allContent))             integrations.add('Stripe');
  if (/supabase/.test(allContent))           integrations.add('Supabase');
  if (/openai|gpt/.test(allContent))         integrations.add('OpenAI');
  if (/anthropic|claude/.test(allContent))   integrations.add('Anthropic');
  if (/sendgrid/.test(allContent))           integrations.add('SendGrid');
  if (/twilio/.test(allContent))             integrations.add('Twilio');
  if (/firebase/.test(allContent))           integrations.add('Firebase');
  if (/aws-sdk|s3|dynamodb/.test(allContent)) integrations.add('AWS');
  if (/resend/.test(allContent))             integrations.add('Resend');
  if (/pusher|socket\.io/.test(allContent))  integrations.add('Real-time (WebSockets)');

  // From product integrations
  for (const i of (product.integrations || [])) {
    if (typeof i === 'string') integrations.add(i);
    else if (i.name)           integrations.add(i.name);
  }

  return [...integrations];
}

function _resolveRoutes(product, blueprint, stack) {
  const routes = new Set();

  // From product pages
  for (const p of (product.pages || [])) {
    if (p.path) routes.add(p.path);
    else if (p.name) routes.add(`/${p.name.toLowerCase().replace(/\s+/g, '-')}`);
  }

  // From blueprint fileList
  for (const f of (blueprint.fileList || [])) {
    if (f.endsWith('.html')) routes.add(f);
  }

  // From stack files
  for (const f of (stack.files || [])) {
    if (f.endsWith('.html')) routes.add(f);
  }

  return [...routes].slice(0, 20);
}

function _resolveDataEntities(intent, product, blueprint) {
  const entities = new Set();

  if (intent.coreEntity) entities.add(intent.coreEntity);

  for (const m of (product.dataModels || [])) {
    if (typeof m === 'string') entities.add(m);
    else if (m.name) entities.add(m.name);
  }

  // From inference report
  const inferredEntities = intent._inferenceReport?.requirements?.filter(r => r.category === 'entity') || [];
  for (const e of inferredEntities) {
    if (e.name) entities.add(e.name);
  }

  return [...entities].slice(0, 15);
}

function _resolveRequiredEnvVars(files, validationReport, structuralRepairReport, intent) {
  /** @type {Map<string, import('./types').EnvVarSpec>} */
  const varMap = new Map();

  const add = (name, partial = {}) => {
    if (!name || varMap.has(name)) return;
    varMap.set(name, {
      name,
      description:  partial.description  || _describeEnvVar(name),
      required:     partial.required     !== false,
      hasDefault:   partial.hasDefault   || false,
      defaultValue: partial.defaultValue || undefined,
      category:     partial.category     || _categorizeEnvVar(name),
      setupNote:    partial.setupNote    || _setupNoteForVar(name),
    });
  };

  // Parse .env.example from generated files
  const envExample = files.find(f => f.path === '.env.example' || f.path.endsWith('/.env.example'));
  if (envExample) {
    _parseEnvExample(envExample.content || '').forEach(v => add(v.name, v));
  }

  // From validation report
  for (const v of (validationReport.missingEnvVars || [])) {
    add(v);
  }

  // From structural repair
  for (const v of (structuralRepairReport?.addedEnvVars || [])) {
    add(v);
  }

  // From intent signals
  if (intent.needsAuth) {
    add('JWT_SECRET', { description: 'Secret key for signing JWT tokens', required: true, category: 'auth' });
    add('BCRYPT_ROUNDS', { description: 'Number of bcrypt salt rounds (default: 12)', required: false, hasDefault: true, defaultValue: '12', category: 'auth' });
  }
  if (intent.needsPayments) {
    add('STRIPE_SECRET_KEY', { description: 'Stripe secret API key', required: true, category: 'billing', setupNote: 'Get from https://dashboard.stripe.com/apikeys' });
    add('STRIPE_PUBLISHABLE_KEY', { description: 'Stripe publishable key (safe for frontend)', required: true, category: 'billing', setupNote: 'Get from https://dashboard.stripe.com/apikeys' });
    add('STRIPE_WEBHOOK_SECRET', { description: 'Stripe webhook signing secret', required: true, category: 'billing', setupNote: 'Create in Stripe Dashboard > Webhooks' });
  }

  // Always-needed core vars
  add('PORT', { description: 'Port the server listens on', required: false, hasDefault: true, defaultValue: '3000', category: 'core' });

  return [...varMap.values()];
}

/**
 * Parse a .env.example file into env var specs.
 * Handles: KEY=value, KEY=, # comment, # KEY=..., KEY="value"
 *
 * @param {string} content
 * @returns {Array<{name: string, hasDefault: boolean, defaultValue: string}>}
 */
function _parseEnvExample(content) {
  const vars = [];
  const seen = new Set();

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx < 1) continue;

    const name  = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');

    if (!name || seen.has(name)) continue;
    seen.add(name);

    const hasDefault = value.length > 0 && !_isPlaceholder(value);
    vars.push({ name, hasDefault, defaultValue: value || undefined });
  }

  return vars;
}

function _isPlaceholder(value) {
  return /^(your[-_].*|xxx|changeme|placeholder|todo|<.*>|\.\.\.|add[-_]here)/i.test(value);
}

function _describeEnvVar(name) {
  const descriptions = {
    PORT:                   'Port the server listens on',
    NODE_ENV:               'Runtime environment (development | production)',
    DATABASE_URL:           'Database connection string',
    DB_URL:                 'Database connection string',
    JWT_SECRET:             'Secret key for signing JWT tokens',
    JWT_EXPIRES_IN:         'JWT token expiry duration (e.g. 7d)',
    SESSION_SECRET:         'Secret for session middleware',
    STRIPE_SECRET_KEY:      'Stripe secret API key',
    STRIPE_PUBLISHABLE_KEY: 'Stripe publishable key (frontend-safe)',
    STRIPE_WEBHOOK_SECRET:  'Stripe webhook signing secret',
    OPENAI_API_KEY:         'OpenAI API key',
    ANTHROPIC_API_KEY:      'Anthropic API key',
    SUPABASE_URL:           'Supabase project URL',
    SUPABASE_ANON_KEY:      'Supabase anonymous (public) key',
    SUPABASE_SERVICE_KEY:   'Supabase service role key (admin)',
    SENDGRID_API_KEY:       'SendGrid email API key',
    TWILIO_ACCOUNT_SID:     'Twilio account SID',
    TWILIO_AUTH_TOKEN:      'Twilio auth token',
    FIREBASE_API_KEY:       'Firebase API key',
    AWS_ACCESS_KEY_ID:      'AWS access key ID',
    AWS_SECRET_ACCESS_KEY:  'AWS secret access key',
    AWS_REGION:             'AWS region (e.g. us-east-1)',
    RESEND_API_KEY:         'Resend email API key',
    BCRYPT_ROUNDS:          'Number of bcrypt hashing rounds',
    CORS_ORIGIN:            'Allowed CORS origin(s)',
    ADMIN_EMAIL:            'Admin account email address',
    ADMIN_PASSWORD:         'Admin account initial password',
    SMTP_HOST:              'SMTP server hostname',
    SMTP_PORT:              'SMTP server port',
    SMTP_USER:              'SMTP username',
    SMTP_PASS:              'SMTP password',
  };
  return descriptions[name] || `Environment variable: ${name}`;
}

function _categorizeEnvVar(name) {
  const n = name.toUpperCase();
  if (/JWT|SESSION|BCRYPT|AUTH/.test(n))              return 'auth';
  if (/STRIPE|BILLING|PAYMENT/.test(n))               return 'billing';
  if (/OPENAI|ANTHROPIC|GPT|CLAUDE|GEMINI|AI|LLM/.test(n)) return 'ai';
  if (/SUPABASE|DATABASE|DB_|MONGO|REDIS|POSTGRES/.test(n)) return 'storage';
  if (/SENDGRID|SMTP|MAIL|EMAIL|RESEND|TWILIO/.test(n)) return 'email';
  if (/ANALYTICS|SEGMENT|MIXPANEL|GA_/.test(n))       return 'analytics';
  if (/FIREBASE|AWS|S3|GCP|AZURE/.test(n))            return 'storage';
  return 'core';
}

function _setupNoteForVar(name) {
  const notes = {
    JWT_SECRET:             'Run: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
    STRIPE_SECRET_KEY:      'Stripe Dashboard → Developers → API keys',
    STRIPE_PUBLISHABLE_KEY: 'Stripe Dashboard → Developers → API keys',
    STRIPE_WEBHOOK_SECRET:  'Stripe Dashboard → Developers → Webhooks → signing secret',
    OPENAI_API_KEY:         'platform.openai.com → API keys',
    ANTHROPIC_API_KEY:      'console.anthropic.com → API keys',
    SUPABASE_URL:           'Supabase Dashboard → Project settings → API',
    SUPABASE_ANON_KEY:      'Supabase Dashboard → Project settings → API',
    SUPABASE_SERVICE_KEY:   'Supabase Dashboard → Project settings → API (keep secret)',
    SENDGRID_API_KEY:       'app.sendgrid.com → Settings → API Keys',
    RESEND_API_KEY:         'resend.com → API Keys',
    TWILIO_ACCOUNT_SID:     'console.twilio.com → Account Info',
    TWILIO_AUTH_TOKEN:      'console.twilio.com → Account Info',
  };
  return notes[name] || undefined;
}

function _generateProjectId(projectName) {
  const slug = (projectName || 'project').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 16);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${slug}-${rand}`;
}

module.exports = { buildProjectManifest };
