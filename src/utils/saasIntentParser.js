/**
 * SaaS Intent Parser
 *
 * Extracts SaaS-specific intent from a user prompt — no API call, <1ms.
 * Output is threaded through the generation pipeline to inform the planner
 * and coder with structured SaaS context: category, modules, roles, monetization.
 */

// ── Category detection ────────────────────────────────────────────────────────
// Ordered most-specific → least-specific

const SAAS_CATEGORY_PATTERNS = [
  { category: 'booking-saas',       signals: ['booking', 'reservation', 'appointment', 'scheduling', 'barber', 'salon', 'clinic', 'therapist', 'dentist', 'hotel', 'rental', 'time slot', 'availability', 'calendar booking'] },
  { category: 'crm-saas',           signals: ['crm', 'client management', 'customer management', 'lead management', 'sales pipeline', 'contacts manager', 'deals', 'pipeline', 'real estate agent', 'sales tool', 'customer relationship'] },
  { category: 'marketplace',        signals: ['marketplace', 'e-commerce', 'ecommerce', 'online store', 'shop', 'multi-vendor', 'seller', 'storefront', 'product listing', 'buy and sell', 'vendor platform'] },
  { category: 'collaboration-saas', signals: ['slack-like', 'team chat', 'channels', 'workspace', 'team communication', 'discord-like', 'messaging platform', 'collaboration tool', 'team messaging'] },
  { category: 'project-management', signals: ['project management', 'kanban', 'sprint', 'jira-like', 'trello-like', 'asana-like', 'issue tracker', 'task board', 'agile board', 'scrum board', 'roadmap tool'] },
  { category: 'ai-saas',            signals: ['ai tool', 'ai saas', 'ai-powered', 'gpt', 'openai', 'ai wrapper', 'ai writing', 'ai generation', 'resume optimizer', 'ai assistant', 'chatbot saas', 'ai for', 'powered by ai', 'llm', 'ai platform', 'generative ai'] },
  { category: 'lms-saas',           signals: ['lms', 'learning platform', 'course platform', 'online courses', 'e-learning', 'education platform', 'student portal', 'instructor', 'lessons', 'curriculum', 'learning management'] },
  { category: 'finance-saas',       signals: ['invoicing', 'invoice', 'accounting software', 'expense tracking', 'expense manager', 'payroll', 'financial reporting', 'revenue tracking', 'billing software', 'bookkeeping'] },
  { category: 'hr-saas',            signals: ['hr platform', 'employee management', 'onboarding tool', 'hr tool', 'performance review', 'leave management', 'attendance tracking', 'payroll management', 'people management'] },
  { category: 'health-saas',        signals: ['fitness app', 'gym membership', 'workout tracker', 'health tracker', 'nutrition tracker', 'personal trainer', 'wellness platform', 'telehealth', 'patient portal', 'medical practice'] },
  { category: 'directory',          signals: ['directory', 'listing site', 'job board', 'classified', 'business directory', 'vendor directory', 'freelancer marketplace', 'talent platform'] },
  { category: 'internal-tool',      signals: ['internal tool', 'admin tool', 'operations dashboard', 'back-office', 'ops platform', 'internal dashboard', 'employee portal', 'company intranet'] },
  { category: 'generic-saas',       signals: ['saas', 'subscription app', 'web app', 'platform', 'b2b', 'dashboard app', 'management platform', 'management system', 'portal'] },
];

// ── Monetization detection ────────────────────────────────────────────────────

const MONETIZATION_PATTERNS = [
  { model: 'subscription',  signals: ['subscription', 'monthly plan', 'yearly plan', 'pricing plans', 'freemium', 'pro plan', 'premium', 'free tier', 'paid plan', 'upgrade'] },
  { model: 'per-seat',      signals: ['per user', 'per seat', 'team plan', 'per member', 'seat-based'] },
  { model: 'marketplace',   signals: ['commission', 'marketplace fee', 'transaction fee', 'revenue share', 'take a cut', 'seller fee'] },
  { model: 'usage-based',   signals: ['usage-based', 'pay per use', 'credits', 'tokens', 'api calls', 'usage limit', 'pay as you go'] },
  { model: 'one-time',      signals: ['one-time purchase', 'lifetime license', 'buy once', 'one-time payment'] },
  { model: 'free',          signals: ['free tool', 'open source', 'no payment', 'completely free', 'always free'] },
];

// ── "Inspired by" detection ───────────────────────────────────────────────────

const INSPIRED_BY_PATTERNS = [
  { ref: 'Slack',      signals: ['slack-like', 'like slack', 'slack clone', 'slack for', 'slack-inspired'] },
  { ref: 'Notion',     signals: ['notion-like', 'like notion', 'notion clone', 'notion for'] },
  { ref: 'Trello',     signals: ['trello-like', 'like trello', 'kanban board like trello', 'trello clone'] },
  { ref: 'Airbnb',     signals: ['airbnb-like', 'like airbnb', 'airbnb clone', 'rental platform like'] },
  { ref: 'Calendly',   signals: ['calendly-like', 'like calendly', 'calendly clone', 'booking tool like'] },
  { ref: 'Shopify',    signals: ['shopify-like', 'like shopify', 'shopify for', 'ecommerce platform like'] },
  { ref: 'Jira',       signals: ['jira-like', 'like jira', 'issue tracker like jira', 'sprint board like'] },
  { ref: 'HubSpot',    signals: ['hubspot-like', 'like hubspot', 'marketing crm like'] },
  { ref: 'Airtable',   signals: ['airtable-like', 'like airtable', 'database view like'] },
  { ref: 'Linear',     signals: ['linear-like', 'like linear', 'linear clone'] },
  { ref: 'Stripe',     signals: ['stripe-like', 'payment platform like stripe'] },
  { ref: 'Salesforce', signals: ['salesforce-like', 'like salesforce', 'enterprise crm like'] },
];

// ── Module need signals ───────────────────────────────────────────────────────

const MODULE_SIGNALS = {
  auth:          ['login', 'register', 'sign up', 'sign in', 'auth', 'authentication', 'user accounts', 'accounts', 'password'],
  billing:       ['payment', 'stripe', 'billing', 'subscription', 'pricing', 'monetize', 'charge', 'invoice', 'plan', 'paid', 'revenue'],
  admin:         ['admin', 'administration', 'manage users', 'user management', 'admin panel', 'moderator', 'super admin', 'back office', 'admin dashboard'],
  team:          ['team', 'workspace', 'organization', 'company', 'members', 'invite', 'collaborate', 'shared workspace', 'multi-tenant'],
  notifications: ['notification', 'notify', 'alert', 'email notification', 'push notification', 'activity feed', 'updates'],
  analytics:     ['analytics', 'metrics', 'stats', 'reporting', 'dashboard stats', 'insights', 'kpi', 'charts', 'reports'],
  fileUpload:    ['upload', 'file upload', 'attachment', 'image upload', 'document upload', 'media', 'storage', 'photos'],
  onboarding:    ['onboarding', 'setup wizard', 'getting started', 'welcome flow', 'first-time setup'],
  realtime:      ['real-time', 'realtime', 'live updates', 'websocket', 'instant', 'broadcast', 'live chat'],
};

// ── Default roles per category ────────────────────────────────────────────────

const CATEGORY_DEFAULT_ROLES = {
  'booking-saas':       ['user', 'provider', 'admin'],
  'crm-saas':           ['user', 'manager', 'admin'],
  'marketplace':        ['buyer', 'seller', 'admin'],
  'collaboration-saas': ['member', 'admin', 'owner'],
  'project-management': ['member', 'admin'],
  'ai-saas':            ['user', 'admin'],
  'lms-saas':           ['student', 'instructor', 'admin'],
  'health-saas':        ['client', 'practitioner', 'admin'],
  'hr-saas':            ['employee', 'manager', 'admin'],
  'finance-saas':       ['user', 'accountant', 'admin'],
  'directory':          ['user', 'listing-owner', 'admin'],
  'internal-tool':      ['user', 'admin'],
  'generic-saas':       ['user', 'admin'],
};

// ── Non-SaaS signals (override: skip SaaS detection) ─────────────────────────

const NON_SAAS_SIGNALS = [
  'landing page', 'portfolio', 'personal site', 'resume site',
  'calculator', 'timer', 'stopwatch', 'countdown', 'simple game',
  'quiz app', 'static site', 'brochure site', 'one-page site',
];

/**
 * Parses a user prompt and returns structured SaaS intent.
 *
 * @param {string} prompt
 * @returns {{
 *   isSaaS: boolean,
 *   category: string,
 *   monetizationModel: string|null,
 *   inspiredBy: string|null,
 *   requiredModules: string[],
 *   userRoles: string[],
 *   isMobilePrimary: boolean,
 *   needsRealtime: boolean,
 * }}
 */
function parseSaasIntent(prompt) {
  const text = prompt.toLowerCase().trim();

  // Non-SaaS override — these are clearly simple tools, not SaaS products
  const isNonSaaS = NON_SAAS_SIGNALS.some(s => text.includes(s));

  // Detect category
  let category = null;
  for (const { category: cat, signals } of SAAS_CATEGORY_PATTERNS) {
    if (signals.some(s => text.includes(s))) {
      category = cat;
      break;
    }
  }

  const isSaaS = !isNonSaaS && category !== null;

  // Detect monetization model
  let monetizationModel = null;
  for (const { model, signals } of MONETIZATION_PATTERNS) {
    if (signals.some(s => text.includes(s))) {
      monetizationModel = model;
      break;
    }
  }
  // Default for SaaS if none explicitly detected
  if (!monetizationModel && isSaaS) monetizationModel = 'subscription';

  // Detect inspired-by reference
  let inspiredBy = null;
  for (const { ref, signals } of INSPIRED_BY_PATTERNS) {
    if (signals.some(s => text.includes(s))) {
      inspiredBy = ref;
      break;
    }
  }

  // Detect required modules
  const requiredModules = [];
  for (const [mod, signals] of Object.entries(MODULE_SIGNALS)) {
    if (signals.some(s => text.includes(s))) requiredModules.push(mod);
  }

  // SaaS always needs auth
  if (isSaaS && !requiredModules.includes('auth')) requiredModules.unshift('auth');

  // Billing if monetization is not free
  if (monetizationModel && monetizationModel !== 'free' && !requiredModules.includes('billing')) {
    requiredModules.push('billing');
  }

  // Team workspace signals
  if (!requiredModules.includes('team') &&
      (text.includes('team') || text.includes('workspace') || text.includes('organization'))) {
    requiredModules.push('team');
  }

  // User roles
  const userRoles = CATEGORY_DEFAULT_ROLES[category] || ['user', 'admin'];

  const isMobilePrimary = /mobile app|phone app|ios|android|pwa|progressive web app/i.test(text);
  const needsRealtime   = requiredModules.includes('realtime');

  return {
    isSaaS,
    category: category || 'generic-saas',
    monetizationModel,
    inspiredBy,
    requiredModules,
    userRoles,
    isMobilePrimary,
    needsRealtime,
  };
}

module.exports = { parseSaasIntent };
