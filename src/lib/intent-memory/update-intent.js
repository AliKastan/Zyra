'use strict';

/**
 * Intent Updater
 *
 * Classifies a user prompt and extracts structured signals from it.
 * Returns an IntentUpdate that is later merged into the existing memory
 * by merge-intent.js.
 *
 * No API calls — pure pattern matching for speed.
 */

// ── Feature catalog ──────────────────────────────────────────────────────────
// Maps feature keys → signal phrases (any match triggers the feature)

const FEATURE_CATALOG = {
  auth:             ['login', 'sign up', 'signup', 'sign in', 'signin', 'register', 'authentication', 'user account', 'user accounts', 'logout', 'forgot password', 'password reset'],
  booking:          ['booking', 'appointment', 'schedule', 'scheduling', 'calendar', 'reservation', 'slot', 'availability'],
  payments:         ['payment', 'checkout', 'subscription', 'billing plan', 'pay now', 'buy now', 'purchase'],
  dashboard:        ['dashboard', 'admin dashboard', 'control panel', 'management panel', 'overview'],
  analytics:        ['analytics', 'metrics', 'statistics', 'reporting', 'reports', 'insights', 'charts', 'graphs'],
  notifications:    ['notification', 'notify', 'alert', 'email notification', 'push notification', 'in-app notification'],
  chat:             ['chat', 'messaging', 'direct message', 'inbox', 'real-time message', 'live chat'],
  search:           ['search', 'full-text search', 'filter', 'fuzzy search', 'autocomplete'],
  upload:           ['file upload', 'image upload', 'upload file', 'upload image', 'attachment', 'document upload'],
  reviews:          ['review', 'rating', 'star rating', 'testimonial', 'feedback form'],
  social:           ['social', 'follow', 'follower', 'friend', 'like', 'share', 'feed', 'activity feed'],
  ecommerce:        ['cart', 'shopping cart', 'shop', 'store', 'product listing', 'inventory', 'order management'],
  profile:          ['profile', 'user profile', 'account settings', 'settings page', 'preferences'],
  map:              ['map', 'location', 'geolocation', 'nearby', 'directions', 'google maps'],
  blog:             ['blog', 'article', 'post', 'content management', 'cms', 'editor'],
  api:              ['rest api', 'graphql api', 'api endpoint', 'webhook', 'developer api'],
  admin:            ['admin panel', 'admin area', 'admin section', 'staff view', 'moderator'],
  ai:               ['ai feature', 'ai-powered', 'machine learning', 'llm', 'language model', 'ai generation', 'ai assistant', 'text generation', 'ai text', 'openai api', 'ai tool', 'ai chat', 'ai for'],
  multi_tenant:     ['multi-tenant', 'multi tenant', 'organization', 'workspace', 'team management', 'tenants'],
  export:           ['export', 'csv export', 'pdf export', 'download report', 'data export'],
  two_factor:       ['two-factor', '2fa', 'mfa', 'multi-factor', 'totp', 'authenticator app'],
};

// ── Integration catalog ──────────────────────────────────────────────────────

const INTEGRATION_CATALOG = {
  'Stripe':           ['stripe', 'stripe payment', 'stripe billing', 'stripe checkout'],
  'OpenAI':           ['openai', 'gpt-4', 'gpt4', 'chatgpt', 'openai api', 'gpt'],
  'Anthropic':        ['anthropic', 'claude api', 'claude model'],
  'Supabase':         ['supabase', 'supabase auth', 'supabase db'],
  'SendGrid':         ['sendgrid', 'sendgrid email'],
  'Resend':           ['resend', 'resend email'],
  'Firebase':         ['firebase', 'firestore', 'firebase auth', 'fcm'],
  'Cloudinary':       ['cloudinary', 'cloudinary upload'],
  'AWS S3':           ['aws s3', 's3 bucket', 'amazon s3'],
  'Twilio':           ['twilio', 'twilio sms'],
  'Pusher':           ['pusher', 'socket.io', 'websocket real-time'],
  'Google Analytics': ['google analytics', 'ga4', 'gtag'],
  'MongoDB':          ['mongodb', 'mongo', 'mongoose'],
  'PostgreSQL':       ['postgresql', 'postgres', 'pg database'],
  'Prisma':           ['prisma', 'prisma orm'],
  'Drizzle':          ['drizzle', 'drizzle orm'],
  'Redis':            ['redis', 'redis cache', 'valkey'],
};

// ── Design intent catalog ────────────────────────────────────────────────────

const DESIGN_CATALOG = {
  'dark':        ['dark theme', 'dark mode', 'night mode', 'make it darker', 'dark ui', 'dark color', 'dark background', 'ui darker'],
  'light':       ['light theme', 'light mode', 'make it lighter', 'minimal', 'clean design', 'white background'],
  'premium':     ['premium', 'luxury', 'elegant', 'high-end', 'exclusive', 'sophisticated'],
  'modern':      ['modern', 'sleek', 'contemporary', 'up-to-date ui'],
  'playful':     ['playful', 'fun', 'colorful', 'vibrant', 'bright colors', 'cheerful'],
  'corporate':   ['corporate', 'professional look', 'enterprise feel', 'business style'],
  'minimalist':  ['minimalist', 'very minimal', 'bare minimal', 'ultra clean', 'whitespace'],
  'dashboard':   ['dashboard style', 'data-dense', 'analytics layout', 'metric-focused'],
  'mobile_first':['mobile-first', 'mobile first design', 'thumb-friendly'],
};

// ── Platform catalog ─────────────────────────────────────────────────────────

const PLATFORM_SIGNALS = {
  web:    ['web app', 'website', 'web application', 'browser', 'responsive web', 'next.js', 'react app'],
  mobile: ['mobile app', 'ios app', 'android app', 'react native', 'expo app', 'native app', 'phone app'],
};

// ── Role catalog ─────────────────────────────────────────────────────────────

const ROLE_SIGNALS = {
  admin:    ['admin', 'administrator', 'superuser', 'staff', 'moderator'],
  customer: ['customer', 'client', 'buyer', 'end user', 'user'],
  seller:   ['seller', 'vendor', 'merchant', 'provider'],
  creator:  ['creator', 'content creator', 'author', 'writer', 'publisher'],
  driver:   ['driver', 'courier', 'delivery person'],
  agent:    ['agent', 'support agent', 'representative'],
  barber:   ['barber', 'stylist', 'technician', 'professional'],
};

// ── Entity catalog ───────────────────────────────────────────────────────────

const ENTITY_SIGNALS = {
  User:         ['user', 'account', 'member', 'customer', 'buyer'],
  Booking:      ['booking', 'appointment', 'reservation', 'slot'],
  Product:      ['product', 'item', 'listing', 'sku', 'inventory item'],
  Order:        ['order', 'purchase', 'transaction'],
  Post:         ['post', 'article', 'blog post', 'content', 'entry'],
  Service:      ['service', 'offering', 'package'],
  Review:       ['review', 'rating', 'feedback'],
  Notification: ['notification', 'alert', 'message'],
  Payment:      ['payment', 'invoice', 'charge', 'subscription'],
  Category:     ['category', 'tag', 'label', 'type'],
  Message:      ['message', 'chat message', 'dm'],
  Organization: ['organization', 'company', 'workspace', 'team'],
};

// ── App type hints ───────────────────────────────────────────────────────────

const APP_TYPE_SIGNALS = {
  saas:       ['saas', 'software as a service', 'subscription platform', 'b2b platform'],
  booking:    ['booking app', 'booking platform', 'appointment system', 'reservation system', 'scheduling app'],
  ecommerce:  ['e-commerce', 'ecommerce', 'online shop', 'marketplace', 'store'],
  social:     ['social network', 'social platform', 'community platform'],
  dashboard:  ['analytics dashboard', 'data dashboard', 'reporting tool', 'bi tool'],
  ai:         ['ai tool', 'ai assistant', 'ai platform', 'llm app'],
  blog:       ['blog platform', 'cms', 'content platform', 'publishing platform'],
  crm:        ['crm', 'customer relationship', 'sales tool', 'lead management'],
};

// ── Remove signals ───────────────────────────────────────────────────────────

const REMOVE_PREFIXES = ['remove', 'delete', 'drop', 'disable', "don't need", 'no longer need', 'get rid of', 'take out', 'strip out'];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify a prompt and extract structured intent signals.
 *
 * @param {string} prompt - Raw user prompt
 * @param {import('./types').UserIntentMemory | null} existingMemory - Current memory (null = first prompt)
 * @returns {import('./types').IntentUpdate}
 */
function extractIntentUpdate(prompt, existingMemory) {
  const p = prompt.toLowerCase().trim();

  const changeType     = _classifyChangeType(p, existingMemory);
  const features       = _extractFeatures(p);
  const removeFeatures = _extractRemovals(p);
  const integrations   = _extractIntegrations(p);
  const platforms      = _extractPlatforms(p);
  const roles          = _extractRoles(p);
  const entities       = _extractEntities(p);
  const designIntent   = _extractDesign(p);
  const appGoal        = changeType === 'NEW_PROJECT' ? _extractAppGoal(prompt) : undefined;
  const appType        = _extractAppType(p);

  // Integration → feature inference
  if (integrations.includes('OpenAI') || integrations.includes('Anthropic')) {
    if (!features.includes('ai')) features.push('ai');
  }
  if (integrations.includes('Stripe')) {
    if (!features.includes('payments')) features.push('payments');
  }
  if (integrations.includes('SendGrid') || integrations.includes('Resend')) {
    if (!features.includes('notifications')) features.push('notifications');
  }

  // Boolean flag signals
  const authRequired    = features.includes('auth')     || p.includes('user account') || p.includes('login');
  const billingRequired = features.includes('payments') || p.includes('stripe') || p.includes('payment');
  const adminRequired   = features.includes('admin') || features.includes('dashboard') || p.includes('admin');
  const mobileRequired  = platforms.includes('mobile');

  const description = _buildDescription(changeType, features, removeFeatures, integrations, platforms, designIntent, appGoal);

  return {
    changeType,
    features,
    removeFeatures,
    integrations,
    platforms,
    roles,
    entities,
    designIntent: designIntent || undefined,
    appGoal,
    appType: appType || undefined,
    authRequired:    authRequired    || undefined,
    billingRequired: billingRequired || undefined,
    adminRequired:   adminRequired   || undefined,
    mobileRequired:  mobileRequired  || undefined,
    description,
  };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _classifyChangeType(p, existingMemory) {
  const isFirst = !existingMemory || existingMemory.promptCount === 0;

  // Explicit new project signals
  if (/\b(?:start|begin|build|create|make|develop)\s+(?:a|an|new|the)\s+\w/.test(p) && isFirst) {
    return 'NEW_PROJECT';
  }
  if (/\b(?:start new|new app|new project|new application|start over|reset)\b/.test(p)) {
    return 'NEW_PROJECT';
  }

  // Remove signals
  if (REMOVE_PREFIXES.some(pfx => p.startsWith(pfx) || p.includes(pfx + ' '))) {
    return 'REMOVE_FEATURE';
  }

  // Style change
  if (/\b(?:make it|change|switch to|use|apply)\s+.*(?:dark|light|minimal|theme|color|style|design|ui|look|feel)\b/.test(p) ||
      /\b(?:darker|lighter|modern|premium|minimalist|colorful|vibrant|playful|corporate|elegant)\b/.test(p)) {
    return 'CHANGE_STYLE';
  }

  // Platform change
  if (/\b(?:make it|convert to|switch to|change to|port to)\s+(?:a\s+)?(?:mobile|web|desktop|native|cross-platform)\b/.test(p) ||
      /\b(?:mobile only|web only|cross.platform|mobile-only|web-only)\b/.test(p) ||
      (/\bmobile\b/.test(p) && /\bonly\b/.test(p))) {
    return 'CHANGE_PLATFORM';
  }

  // Integration change
  if (/\b(?:use|integrate|connect|add|switch)\s+(?:stripe|openai|supabase|firebase|sendgrid|resend|twilio|cloudinary|pusher|redis|prisma|mongoose|drizzle)\b/.test(p)) {
    return 'CHANGE_INTEGRATION';
  }

  // Add feature
  if (/\b(?:add|include|implement|build|create|enable|set up|setup|integrate)\b/.test(p)) {
    return 'ADD_FEATURE';
  }

  // Modify feature
  if (/\b(?:update|change|improve|enhance|fix|refactor|modify|upgrade|redesign|rework)\b/.test(p)) {
    return 'MODIFY_FEATURE';
  }

  // Clarification or contextual
  if (/\b(?:also|by .+ i mean|it should|should also|make sure|ensure|remember)\b/.test(p)) {
    return 'CLARIFICATION';
  }

  // Default: first prompt = new project, else clarification
  return isFirst ? 'NEW_PROJECT' : 'CLARIFICATION';
}

function _extractFeatures(p) {
  const found = [];
  for (const [feature, signals] of Object.entries(FEATURE_CATALOG)) {
    if (signals.some(s => p.includes(s))) {
      found.push(feature);
    }
  }
  return found;
}

function _extractRemovals(p) {
  const toRemove = [];
  const isRemoval = REMOVE_PREFIXES.some(pfx => p.includes(pfx));
  if (!isRemoval) return toRemove;

  for (const [feature, signals] of Object.entries(FEATURE_CATALOG)) {
    if (signals.some(s => p.includes(s))) {
      toRemove.push(feature);
    }
  }
  return toRemove;
}

function _extractIntegrations(p) {
  const found = [];
  for (const [name, signals] of Object.entries(INTEGRATION_CATALOG)) {
    if (signals.some(s => p.includes(s))) {
      found.push(name);
    }
  }
  return found;
}

function _extractPlatforms(p) {
  const found = [];
  for (const [platform, signals] of Object.entries(PLATFORM_SIGNALS)) {
    if (signals.some(s => p.includes(s))) {
      found.push(platform);
    }
  }
  return found;
}

function _extractRoles(p) {
  const found = [];
  for (const [role, signals] of Object.entries(ROLE_SIGNALS)) {
    if (signals.some(s => p.includes(s))) {
      found.push(role);
    }
  }
  return found;
}

function _extractEntities(p) {
  const found = [];
  for (const [entity, signals] of Object.entries(ENTITY_SIGNALS)) {
    if (signals.some(s => p.includes(s))) {
      found.push(entity);
    }
  }
  return found;
}

function _extractDesign(p) {
  for (const [tone, signals] of Object.entries(DESIGN_CATALOG)) {
    if (signals.some(s => p.includes(s))) return tone;
  }
  return null;
}

function _extractAppGoal(prompt) {
  // Try to extract a clean app goal phrase from the prompt
  const p = prompt.trim();
  // Remove common lead-in phrases
  const cleaned = p
    .replace(/^(?:build|create|make|develop|i want|i need|help me build|help me create|please build)\s+(?:a|an|me a|me an)?\s*/i, '')
    .replace(/^(?:a|an)\s+/i, '')
    .split(/[.,!?]/)[0]  // take first sentence
    .trim();
  return cleaned.length > 3 ? cleaned : p;
}

function _extractAppType(p) {
  for (const [type, signals] of Object.entries(APP_TYPE_SIGNALS)) {
    if (signals.some(s => p.includes(s))) return type;
  }
  return null;
}

function _buildDescription(changeType, features, removeFeatures, integrations, platforms, designIntent, appGoal) {
  const parts = [];

  if (changeType === 'NEW_PROJECT' && appGoal) {
    return `New project: "${appGoal}"`;
  }

  if (changeType === 'REMOVE_FEATURE' && removeFeatures.length > 0) {
    return `Remove features: ${removeFeatures.join(', ')}`;
  }

  if (changeType === 'CHANGE_STYLE' && designIntent) {
    return `Change design tone to "${designIntent}"`;
  }

  if (changeType === 'CHANGE_PLATFORM' && platforms.length > 0) {
    return `Switch platform to ${platforms.join(' + ')}`;
  }

  if (features.length > 0)      parts.push(`add ${features.join(', ')}`);
  if (integrations.length > 0)  parts.push(`integrate ${integrations.join(', ')}`);
  if (designIntent)              parts.push(`design: ${designIntent}`);

  return parts.length > 0 ? parts.join('; ') : changeType.toLowerCase().replace('_', ' ');
}

module.exports = { extractIntentUpdate };
