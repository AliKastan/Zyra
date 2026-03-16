'use strict';

/**
 * Business Logic Module Registry
 *
 * Maps app types and prompt keywords to required business modules.
 * Used by the generation pipeline to:
 *   1. Select which modules to include in the generated app
 *   2. Provide generation hints to the LLM coder
 *   3. Report which modules were selected in the job result
 */

// ── Module definitions ────────────────────────────────────────────────────────

const MODULES = {
  users: {
    id:          'users',
    name:        'User Management',
    description: 'User creation, authentication, email verification, password reset, role assignment',
    features:    ['user-creation', 'profile-updates', 'email-verification', 'password-reset', 'role-assignment'],
    envVars:     ['JWT_SECRET'],
    dependencies: ['bcryptjs', 'jsonwebtoken'],
    files: [
      'server/services/userService.js',
      'server/routes/auth.js',
      'server/middleware/authenticate.js',
    ],
  },
  subscriptions: {
    id:          'subscriptions',
    name:        'Subscriptions',
    description: 'Plan tiers, trial handling, upgrade/downgrade, cancellation, renewal',
    features:    ['subscription-status', 'plan-tiers', 'upgrade-downgrade', 'trial-handling', 'cancellation'],
    envVars:     ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    dependencies: ['stripe'],
    files: [
      'server/services/subscriptionService.js',
      'server/routes/billing.js',
      'server/webhooks/stripe.js',
    ],
  },
  orders: {
    id:          'orders',
    name:        'Orders & Payments',
    description: 'Order creation, status tracking, payment confirmation, refund logic',
    features:    ['order-creation', 'order-status', 'payment-confirmation', 'refund-logic'],
    envVars:     ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    dependencies: ['stripe'],
    files: [
      'server/services/orderService.js',
      'server/routes/orders.js',
    ],
  },
  notifications: {
    id:          'notifications',
    name:        'Notifications',
    description: 'Email, in-app, and event-based notifications',
    features:    ['email-notifications', 'in-app-notifications', 'event-based-alerts'],
    envVars:     ['SENDGRID_API_KEY'],
    dependencies: ['@sendgrid/mail'],
    files: [
      'server/services/notificationService.js',
      'server/routes/notifications.js',
    ],
  },
  content: {
    id:          'content',
    name:        'Content Management',
    description: 'Create, update, delete, publish/unpublish content with scheduling',
    features:    ['create-content', 'update-content', 'delete-content', 'publish-unpublish'],
    envVars:     [],
    dependencies: [],
    files: [
      'server/services/contentService.js',
      'server/routes/content.js',
    ],
  },
  admin: {
    id:          'admin',
    name:        'Admin Tools',
    description: 'User/content moderation, system logs, admin action audit trail',
    features:    ['user-moderation', 'content-moderation', 'system-logs', 'admin-actions'],
    envVars:     [],
    dependencies: [],
    files: [
      'server/services/adminService.js',
      'server/routes/admin.js',
      'server/middleware/requireAdmin.js',
    ],
  },
  analytics: {
    id:          'analytics',
    name:        'Analytics & Events',
    description: 'Event tracking, usage metrics, user activity logs',
    features:    ['track-events', 'usage-metrics', 'user-activity-logs'],
    envVars:     [],
    dependencies: [],
    files: [
      'server/services/analyticsService.js',
      'server/routes/analytics.js',
    ],
  },
};

// ── App-type → module mapping ─────────────────────────────────────────────────

const APP_TYPE_MODULES = {
  'saas':          ['users', 'subscriptions', 'analytics'],
  'marketplace':   ['users', 'orders', 'admin', 'notifications'],
  'ecommerce':     ['users', 'orders', 'notifications', 'admin'],
  'blog':          ['users', 'content', 'analytics'],
  'cms':           ['users', 'content', 'admin', 'analytics'],
  'ai-tool':       ['users', 'subscriptions', 'analytics'],
  'social':        ['users', 'content', 'notifications', 'analytics'],
  'dashboard':     ['users', 'analytics', 'admin'],
  'crm':           ['users', 'content', 'notifications', 'analytics'],
  'booking':       ['users', 'orders', 'notifications', 'analytics'],
  'portfolio':     [],
  'landing-page':  [],
  'generic':       ['users'],
};

// ── Keyword patterns for module detection ─────────────────────────────────────

const KEYWORD_MODULE_MAP = [
  { pattern: /\b(subscription|subscribe|plan[_\s-]?tier|billing[_\s-]?plan|upgrade|downgrade|trial|freemium|recurring)\b/i, modules: ['subscriptions'] },
  { pattern: /\b(order|checkout|cart|purchase|buy|payment|stripe|invoice|refund|ecommerce|shop)\b/i,                        modules: ['orders'] },
  { pattern: /\b(notifications?|alert|email[_\s-]?send|in[_-]app|push[_\s-]?notif|webhook|remind)\b/i,                     modules: ['notifications'] },
  { pattern: /\b(blog|post|article|content[_\s-]?manage|cms|publish|editorial|page[_\s-]?builder)\b/i,                    modules: ['content'] },
  { pattern: /\b(admin|moderat|backoffice|staff[_\s-]?panel|internal[_\s-]?tool|audit[_\s-]?log|system[_\s-]?log)\b/i,   modules: ['admin'] },
  { pattern: /\b(analytics|track[_\s-]?event|metric|usage[_\s-]?stat|activity[_\s-]?log|dashboa?rd[_\s-]?stat)\b/i,     modules: ['analytics'] },
  { pattern: /\b(auth|login|sign[_\s-]?up|register|user[_\s-]?manag|account|profile|jwt|role[_\s-]?based)\b/i,           modules: ['users'] },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the list of module IDs for a given app type.
 * @param {string} appType
 * @returns {string[]}
 */
function getModulesForAppType(appType) {
  return APP_TYPE_MODULES[appType] || APP_TYPE_MODULES['generic'];
}

/**
 * Detect which modules are needed based on a prompt string.
 * Returns a deduplicated list of module IDs.
 *
 * @param {string} prompt
 * @returns {string[]}
 */
function detectModulesFromPrompt(prompt) {
  if (!prompt) return [];
  const found = new Set();
  for (const { pattern, modules } of KEYWORD_MODULE_MAP) {
    if (pattern.test(prompt)) {
      for (const m of modules) found.add(m);
    }
  }
  return [...found];
}

/**
 * Select all relevant business modules for an app.
 * Merges app-type defaults with prompt-detected modules.
 *
 * @param {string} appType
 * @param {string} [prompt]
 * @returns {{ modules: string[], sources: Object }}
 */
function selectModules(appType, prompt) {
  const fromType   = getModulesForAppType(appType || 'generic');
  const fromPrompt = prompt ? detectModulesFromPrompt(prompt) : [];
  const all        = [...new Set([...fromType, ...fromPrompt])];

  return {
    modules: all,
    sources: {
      fromAppType: fromType,
      fromPrompt:  fromPrompt,
      total:       all.length,
    },
  };
}

/**
 * Get full module definitions for a list of module IDs.
 * @param {string[]} moduleIds
 * @returns {Object[]}
 */
function getModuleDefinitions(moduleIds) {
  return moduleIds.map(id => MODULES[id]).filter(Boolean);
}

/**
 * Build a generation-hint block for the LLM coder prompt.
 * Describes what business logic should be included.
 *
 * @param {string[]} moduleIds
 * @returns {string}
 */
function buildModuleHints(moduleIds) {
  if (!moduleIds || moduleIds.length === 0) return '';
  const defs = getModuleDefinitions(moduleIds);
  if (defs.length === 0) return '';

  const lines = [
    '### Business Logic Modules to Include',
    '',
    ...defs.map(m => [
      `**${m.name}**: ${m.description}`,
      `  Features: ${m.features.join(', ')}`,
      m.envVars.length > 0 ? `  Env vars: ${m.envVars.join(', ')}` : '',
    ].filter(Boolean).join('\n')),
  ];

  return lines.join('\n');
}

/**
 * Build the UI-safe payload for job results.
 * @param {string[]} moduleIds
 * @param {{ fromAppType: string[], fromPrompt: string[] }} sources
 * @returns {Object}
 */
function buildModulesPayload(moduleIds, sources = {}) {
  const defs = getModuleDefinitions(moduleIds);
  return {
    modules:       defs.map(m => ({ id: m.id, name: m.name, features: m.features })),
    moduleCount:   defs.length,
    envVarsNeeded: [...new Set(defs.flatMap(m => m.envVars))],
    dependencies:  [...new Set(defs.flatMap(m => m.dependencies))],
    sources,
  };
}

module.exports = {
  MODULES,
  APP_TYPE_MODULES,
  KEYWORD_MODULE_MAP,
  getModulesForAppType,
  detectModulesFromPrompt,
  selectModules,
  getModuleDefinitions,
  buildModuleHints,
  buildModulesPayload,
};
