/**
 * Integration Catalog
 *
 * Master catalog of every service integration Zyra-generated apps can use.
 * Each integration defines: category, required vars, setup guide, and validation hints.
 *
 * Billing note: payment credentials always belong to the SaaS owner, not Zyra.
 */

const CATALOG = {

  // ── Database ─────────────────────────────────────────────────────────────────
  supabase: {
    id:          'supabase',
    label:       'Supabase',
    category:    'database',
    description: 'PostgreSQL database, Auth, Realtime, and Storage',
    docsUrl:     'https://supabase.com/docs',
    setupUrl:    'https://supabase.com/dashboard',
    detectionSignals: ['supabase', 'createClient', 'SUPABASE_URL'],
    vars: [
      {
        key:      'SUPABASE_URL',
        label:    'Project URL',
        required: true,
        public:   true,
        hint:     'supabase.com → Project → Settings → API → Project URL',
        placeholder: 'https://abcdefgh.supabase.co',
        validate: (v) => /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(v)
          ? null : 'Must be https://xxxx.supabase.co',
      },
      {
        key:      'SUPABASE_ANON_KEY',
        label:    'Anon / Public Key',
        required: true,
        public:   true,
        hint:     'supabase.com → Project → Settings → API → anon / public key',
        placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        validate: (v) => v.startsWith('eyJ') ? null : 'Should start with eyJ',
      },
      {
        key:      'SUPABASE_SERVICE_ROLE_KEY',
        label:    'Service Role Key',
        required: false,
        public:   false,
        hint:     'For server-side admin operations only. Never expose to the client.',
        placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        validate: (v) => v.startsWith('eyJ') ? null : 'Should start with eyJ',
      },
    ],
    setupGuide: [
      'Create a project at supabase.com',
      'Go to Project → Settings → API',
      'Copy "Project URL" → paste as SUPABASE_URL',
      'Copy "anon / public" key → paste as SUPABASE_ANON_KEY',
      'Go to SQL Editor → paste sql/schema.sql → click Run',
      '(Optional) Run sql/seed.sql for sample data',
    ],
    sqlFiles: ['sql/schema.sql', 'sql/setup.sql', 'sql/seed.sql'],
  },

  // ── Payments ──────────────────────────────────────────────────────────────────
  stripe: {
    id:          'stripe',
    label:       'Stripe',
    category:    'payments',
    description: 'Subscription billing — connect YOUR Stripe account. Revenue goes directly to you.',
    docsUrl:     'https://stripe.com/docs',
    setupUrl:    'https://dashboard.stripe.com/apikeys',
    detectionSignals: ['stripe', 'STRIPE_', 'billing.js'],
    billingNote: 'Connect YOUR OWN Stripe account. All revenue flows directly to you — Zyra is not involved.',
    vars: [
      {
        key:      'STRIPE_PUBLISHABLE_KEY',
        label:    'Publishable Key',
        required: true,
        public:   true,
        hint:     'stripe.com → Developers → API keys → Publishable key',
        placeholder: 'pk_test_...',
        validate: (v) => /^pk_(test|live)_/.test(v)
          ? null : 'Must start with pk_test_ or pk_live_',
      },
      {
        key:      'STRIPE_SECRET_KEY',
        label:    'Secret Key',
        required: true,
        public:   false,
        hint:     'stripe.com → Developers → API keys → Secret key. Keep server-side only.',
        placeholder: 'sk_test_...',
        validate: (v) => /^sk_(test|live)_/.test(v)
          ? null : 'Must start with sk_test_ or sk_live_',
      },
      {
        key:      'STRIPE_WEBHOOK_SECRET',
        label:    'Webhook Secret',
        required: false,
        public:   false,
        hint:     'stripe.com → Developers → Webhooks → Signing secret',
        placeholder: 'whsec_...',
        validate: (v) => v.startsWith('whsec_') ? null : 'Must start with whsec_',
      },
    ],
    setupGuide: [
      'Create an account at stripe.com',
      'Go to Developers → API Keys',
      'Copy Publishable key → STRIPE_PUBLISHABLE_KEY',
      'Copy Secret key → STRIPE_SECRET_KEY (never expose to frontend)',
      'For webhooks: Developers → Webhooks → Add endpoint → copy signing secret',
    ],
  },

  // ── AI APIs ───────────────────────────────────────────────────────────────────
  openai: {
    id:          'openai',
    label:       'OpenAI',
    category:    'ai',
    description: 'GPT-4, GPT-3.5, DALL-E, Whisper, and Embeddings',
    docsUrl:     'https://platform.openai.com/docs',
    setupUrl:    'https://platform.openai.com/api-keys',
    detectionSignals: ['openai', 'OPENAI_API_KEY', 'gpt-', 'davinci'],
    vars: [
      {
        key:      'OPENAI_API_KEY',
        label:    'API Key',
        required: true,
        public:   false,
        hint:     'platform.openai.com → API Keys → Create new secret key',
        placeholder: 'sk-...',
        validate: (v) => v.startsWith('sk-') ? null : 'Must start with sk-',
      },
    ],
    setupGuide: [
      'Sign up at platform.openai.com',
      'Go to API Keys → Create new secret key',
      'Copy key → OPENAI_API_KEY',
      'Note: keep server-side only, never expose to frontend',
    ],
  },

  anthropic: {
    id:          'anthropic',
    label:       'Anthropic / Claude',
    category:    'ai',
    description: 'Claude Sonnet, Haiku, and Opus models',
    docsUrl:     'https://docs.anthropic.com',
    setupUrl:    'https://console.anthropic.com/settings/keys',
    detectionSignals: ['anthropic', 'ANTHROPIC_API_KEY', 'claude'],
    vars: [
      {
        key:      'ANTHROPIC_API_KEY',
        label:    'API Key',
        required: true,
        public:   false,
        hint:     'console.anthropic.com → Settings → API Keys',
        placeholder: 'sk-ant-...',
        validate: (v) => v.startsWith('sk-ant-') ? null : 'Must start with sk-ant-',
      },
    ],
    setupGuide: [
      'Sign up at console.anthropic.com',
      'Go to Settings → API Keys → Create Key',
      'Copy key → ANTHROPIC_API_KEY',
    ],
  },

  groq: {
    id:          'groq',
    label:       'Groq',
    category:    'ai',
    description: 'Ultra-fast LLM inference (Llama, Mistral, Gemma)',
    docsUrl:     'https://console.groq.com/docs',
    setupUrl:    'https://console.groq.com/keys',
    detectionSignals: ['groq', 'GROQ_API_KEY'],
    vars: [
      {
        key:      'GROQ_API_KEY',
        label:    'API Key',
        required: true,
        public:   false,
        hint:     'console.groq.com → API Keys',
        placeholder: 'gsk_...',
      },
    ],
    setupGuide: ['Create free account at console.groq.com', 'Go to API Keys → Create', 'Copy key → GROQ_API_KEY'],
  },

  // ── Email ─────────────────────────────────────────────────────────────────────
  resend: {
    id:          'resend',
    label:       'Resend',
    category:    'email',
    description: 'Transactional email — welcome emails, password resets, notifications',
    docsUrl:     'https://resend.com/docs',
    setupUrl:    'https://resend.com/api-keys',
    detectionSignals: ['resend', 'RESEND_API_KEY'],
    vars: [
      {
        key:      'RESEND_API_KEY',
        label:    'API Key',
        required: true,
        public:   false,
        hint:     'resend.com → API Keys → Create API Key',
        placeholder: 're_...',
        validate: (v) => v.startsWith('re_') ? null : 'Must start with re_',
      },
    ],
    setupGuide: [
      'Create account at resend.com',
      'Go to API Keys → Create API Key',
      'Copy key → RESEND_API_KEY',
      'Add your sending domain in resend.com → Domains',
    ],
  },

  sendgrid: {
    id:          'sendgrid',
    label:       'SendGrid',
    category:    'email',
    description: 'Transactional and marketing email at scale',
    docsUrl:     'https://docs.sendgrid.com',
    setupUrl:    'https://app.sendgrid.com/settings/api_keys',
    detectionSignals: ['sendgrid', 'SENDGRID_API_KEY'],
    vars: [
      {
        key:      'SENDGRID_API_KEY',
        label:    'API Key',
        required: true,
        public:   false,
        hint:     'app.sendgrid.com → Settings → API Keys',
        placeholder: 'SG....',
        validate: (v) => v.startsWith('SG.') ? null : 'Must start with SG.',
      },
    ],
    setupGuide: [
      'Sign up at sendgrid.com',
      'Go to Settings → API Keys → Create API Key',
      'Copy key → SENDGRID_API_KEY',
    ],
  },

  // ── Storage ───────────────────────────────────────────────────────────────────
  cloudinary: {
    id:          'cloudinary',
    label:       'Cloudinary',
    category:    'storage',
    description: 'Image and video upload, transformation, and CDN delivery',
    docsUrl:     'https://cloudinary.com/documentation',
    setupUrl:    'https://cloudinary.com/console',
    detectionSignals: ['cloudinary', 'CLOUDINARY_', 'cloudinary.com'],
    vars: [
      {
        key:      'CLOUDINARY_CLOUD_NAME',
        label:    'Cloud Name',
        required: true,
        public:   true,
        hint:     'cloudinary.com → Dashboard → Cloud name',
        placeholder: 'your-cloud-name',
      },
      {
        key:      'CLOUDINARY_API_KEY',
        label:    'API Key',
        required: true,
        public:   false,
        hint:     'cloudinary.com → Settings → Access keys',
        placeholder: '123456789012345',
      },
      {
        key:      'CLOUDINARY_API_SECRET',
        label:    'API Secret',
        required: true,
        public:   false,
        hint:     'cloudinary.com → Settings → Access keys',
        placeholder: 'your-api-secret',
      },
    ],
    setupGuide: [
      'Create account at cloudinary.com',
      'Go to Dashboard to find your Cloud name',
      'Go to Settings → Access keys for API key/secret',
    ],
  },

  // ── Analytics ─────────────────────────────────────────────────────────────────
  posthog: {
    id:          'posthog',
    label:       'PostHog',
    category:    'analytics',
    description: 'Product analytics, session recording, feature flags',
    docsUrl:     'https://posthog.com/docs',
    setupUrl:    'https://app.posthog.com',
    detectionSignals: ['posthog', 'POSTHOG_KEY', 'posthog.com'],
    vars: [
      {
        key:      'POSTHOG_API_KEY',
        label:    'Project API Key',
        required: true,
        public:   true,
        hint:     'app.posthog.com → Project → Settings → Project API Key',
        placeholder: 'phc_...',
      },
      {
        key:      'POSTHOG_HOST',
        label:    'Host',
        required: false,
        public:   true,
        hint:     'Use https://app.posthog.com for cloud, or your self-hosted URL',
        placeholder: 'https://app.posthog.com',
      },
    ],
    setupGuide: [
      'Create account at posthog.com',
      'Go to Project → Settings to find your API key',
      'Copy key → POSTHOG_API_KEY',
    ],
  },

  // ── Messaging / SMS ───────────────────────────────────────────────────────────
  twilio: {
    id:          'twilio',
    label:       'Twilio',
    category:    'sms',
    description: 'SMS, WhatsApp, and voice notifications',
    docsUrl:     'https://www.twilio.com/docs',
    setupUrl:    'https://console.twilio.com',
    detectionSignals: ['twilio', 'TWILIO_', 'twilio.com'],
    vars: [
      {
        key:      'TWILIO_ACCOUNT_SID',
        label:    'Account SID',
        required: true,
        public:   false,
        hint:     'console.twilio.com → Account SID',
        placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        validate: (v) => v.startsWith('AC') ? null : 'Must start with AC',
      },
      {
        key:      'TWILIO_AUTH_TOKEN',
        label:    'Auth Token',
        required: true,
        public:   false,
        hint:     'console.twilio.com → Auth Token',
        placeholder: 'your-auth-token',
      },
      {
        key:      'TWILIO_PHONE_NUMBER',
        label:    'Phone Number',
        required: false,
        public:   true,
        hint:     'Your Twilio phone number in E.164 format',
        placeholder: '+1234567890',
      },
    ],
    setupGuide: [
      'Create account at twilio.com',
      'Go to Console dashboard for Account SID and Auth Token',
      'Buy a phone number for SMS sending',
    ],
  },

  // ── Maps ──────────────────────────────────────────────────────────────────────
  mapbox: {
    id:          'mapbox',
    label:       'Mapbox',
    category:    'maps',
    description: 'Interactive maps, geocoding, and location services',
    docsUrl:     'https://docs.mapbox.com',
    setupUrl:    'https://account.mapbox.com',
    detectionSignals: ['mapbox', 'MAPBOX_TOKEN', 'mapboxgl'],
    vars: [
      {
        key:      'MAPBOX_TOKEN',
        label:    'Access Token',
        required: true,
        public:   true,
        hint:     'account.mapbox.com → Access Tokens → Public token',
        placeholder: 'pk.eyJ1...',
        validate: (v) => v.startsWith('pk.') ? null : 'Must start with pk.',
      },
    ],
    setupGuide: [
      'Create account at mapbox.com',
      'Go to Account → Access Tokens',
      'Copy public token → MAPBOX_TOKEN',
    ],
  },

};

// Category metadata for display ordering and icons
const CATEGORIES = {
  database: { label: 'Database',         order: 1 },
  auth:     { label: 'Authentication',   order: 2 },
  payments: { label: 'Payments',         order: 3 },
  ai:       { label: 'AI APIs',          order: 4 },
  email:    { label: 'Email',            order: 5 },
  storage:  { label: 'Storage',          order: 6 },
  analytics:{ label: 'Analytics',        order: 7 },
  sms:      { label: 'SMS / Messaging',  order: 8 },
  maps:     { label: 'Maps',             order: 9 },
};

/**
 * Returns validation error string for a var value, or null if valid.
 * Works with both stored strings and inline validator functions.
 */
function validateVar(integrationId, varKey, value) {
  const integration = CATALOG[integrationId];
  if (!integration) return null;
  const varDef = integration.vars.find(v => v.key === varKey);
  if (!varDef?.validate) return null;
  if (!value || !value.trim()) {
    return varDef.required ? 'Required' : null;
  }
  return varDef.validate(value.trim());
}

/**
 * Checks which integrations are present in a list of file paths and file contents.
 * Returns Set of integration IDs detected.
 */
function detectIntegrationsFromFiles(filePaths, fileContents = '') {
  const text = (filePaths.join(' ') + ' ' + fileContents).toLowerCase();
  const detected = new Set();
  for (const [id, integration] of Object.entries(CATALOG)) {
    if (integration.detectionSignals.some(sig => text.includes(sig.toLowerCase()))) {
      detected.add(id);
    }
  }
  return detected;
}

/**
 * Returns integrations required by a given set of SaaS modules.
 */
function getModuleIntegrations(requiredModules = []) {
  const moduleMap = {
    auth:          ['supabase'],
    billing:       ['stripe'],
    team:          ['supabase'],
    notifications: ['resend'],
    analytics:     ['posthog'],
    fileUpload:    ['cloudinary'],
    realtime:      ['supabase'],
  };

  const needed = new Set();
  for (const mod of requiredModules) {
    (moduleMap[mod] || []).forEach(id => needed.add(id));
  }
  return [...needed];
}

module.exports = { CATALOG, CATEGORIES, validateVar, detectIntegrationsFromFiles, getModuleIntegrations };
