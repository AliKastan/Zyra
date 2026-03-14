/**
 * Prompt complexity classifier.
 * Returns level (simple/medium/complex), estimate, score, and detected appType.
 * appType is used by the inline planner to select a template without an API call.
 */

const COMPLEX_SIGNALS = [
  // Auth / security
  'full-stack', 'fullstack', 'auth', 'authentication', 'login', 'register', 'sign up', 'sign in',
  'oauth', 'jwt', 'session', 'permissions', 'role', 'roles',
  // Data / backend
  'database', 'db', 'sql', 'postgres', 'mongodb', 'prisma', 'supabase',
  'backend api', 'rest api', 'graphql', 'microservice', 'server',
  // Payments
  'payment', 'stripe', 'billing', 'subscription', 'checkout', 'invoice', 'pricing plan',
  // SaaS / business
  'saas', 'crm', 'erp', 'admin panel', 'admin dashboard', 'admin',
  'multi-user', 'user management', 'multi-tenant', 'workspace', 'organization',
  // Real-time
  'real-time', 'realtime', 'websocket', 'live', 'notifications',
  // E-commerce
  'e-commerce', 'ecommerce', 'online store', 'shop', 'marketplace', 'storefront', 'cart',
  // Social
  'social media', 'social network', 'feed', 'follow', 'like', 'comment',
  // Finance
  'trading', 'stock', 'crypto', 'portfolio tracker', 'investment', 'finance',
  'budget', 'expense tracker', 'accounting', 'invoicing', 'payroll',
  // Booking
  'booking', 'reservation', 'appointment', 'scheduling', 'calendar app',
  'barber', 'salon', 'clinic', 'dentist',
  // Productivity
  'project management', 'kanban', 'task manager', 'workflow', 'sprint', 'issue tracker',
  // Inventory
  'inventory', 'warehouse', 'supply chain',
  // Analytics
  'analytics', 'reporting', 'metrics dashboard', 'data visualization', 'kpi',
  // Communication
  'chat', 'messaging', 'forum', 'community', 'collaboration',
  // Education
  'learning platform', 'lms', 'course', 'education app', 'e-learning',
  // Health
  'health tracker', 'fitness app', 'medical', 'patient', 'gym membership', 'workout',
  // HR
  'hr platform', 'employee', 'onboarding tool', 'performance review',
  // AI SaaS
  'ai tool', 'ai saas', 'ai wrapper', 'ai-powered', 'llm', 'gpt', 'openai',
  // Directories
  'directory', 'job board', 'listing site', 'vendor',
  // File handling
  'file upload', 'upload', 'attachment', 'document', 'storage',
  // Platform / portal
  'platform', 'portal', 'dashboard app', 'management system', 'management platform',
];

const SIMPLE_SIGNALS = [
  'landing page', 'landing', 'portfolio', 'personal site', 'resume site',
  'calculator', 'counter', 'timer', 'stopwatch', 'countdown',
  'simple form', 'contact form', 'quiz', 'survey',
  'simple', 'basic', 'minimal', 'static site', 'single page', 'one page',
  'static', 'brochure', 'homepage',
  // Note: 'todo' intentionally removed — needs data persistence → medium
];

// Ordered from most-specific to least-specific
// SaaS-specific types are added before generic ones
const APP_TYPE_PATTERNS = [
  // SaaS product types (most specific first)
  { type: 'booking-saas',       keywords: ['booking saas', 'booking app', 'reservation system', 'appointment saas', 'scheduling saas', 'barber booking', 'salon booking'] },
  { type: 'crm-saas',           keywords: ['crm', 'customer relationship', 'lead management', 'sales pipeline', 'client management'] },
  { type: 'ai-saas',            keywords: ['ai saas', 'ai tool', 'ai wrapper', 'ai-powered saas', 'gpt saas', 'llm saas'] },
  { type: 'collaboration-saas', keywords: ['collaboration saas', 'team chat', 'slack-like', 'team messaging', 'workspace saas'] },
  { type: 'project-management', keywords: ['project management', 'kanban saas', 'sprint board', 'issue tracker', 'task management saas'] },
  { type: 'marketplace',        keywords: ['marketplace', 'e-commerce saas', 'multi-vendor', 'online store saas'] },
  { type: 'lms-saas',           keywords: ['lms', 'learning platform', 'course platform', 'e-learning saas'] },
  { type: 'finance-saas',       keywords: ['invoicing saas', 'accounting saas', 'expense management', 'payroll saas'] },
  { type: 'hr-saas',            keywords: ['hr platform', 'hr saas', 'employee management', 'people ops'] },
  { type: 'health-saas',        keywords: ['gym saas', 'fitness saas', 'health platform', 'wellness saas', 'gym membership'] },
  // Simple / marketing types
  { type: 'landing-page',       keywords: ['landing page', 'landing', 'homepage', 'hero', 'brochure', 'product page', 'marketing site'] },
  { type: 'portfolio',          keywords: ['portfolio', 'personal site', 'resume site', 'my work', 'showcase'] },
  // Tool types
  { type: 'todo',               keywords: ['todo', 'task list', 'checklist'] },
  { type: 'calculator',         keywords: ['calculator', 'calc', 'math tool'] },
  { type: 'timer',              keywords: ['timer', 'stopwatch', 'countdown', 'pomodoro'] },
  { type: 'form',               keywords: ['contact form', 'survey form', 'quiz', 'feedback form', 'simple form'] },
  // Data-driven types
  { type: 'dashboard',          keywords: ['dashboard', 'stats page', 'analytics page', 'metrics'] },
  { type: 'blog',               keywords: ['blog', 'articles', 'posts', 'news site'] },
  { type: 'crud',               keywords: ['crud', 'inventory', 'notes app', 'list app'] },
  { type: 'api',                keywords: ['rest api', 'api server', 'express api', 'api only'] },
  { type: 'chat',               keywords: ['chat app', 'messaging app'] },
];

function detectAppType(text) {
  for (const { type, keywords } of APP_TYPE_PATTERNS) {
    if (keywords.some((kw) => text.includes(kw))) return type;
  }
  return 'generic';
}

function classifyComplexity(prompt) {
  const text  = prompt.toLowerCase().trim();
  const chars = prompt.length;
  const words = text.split(/\s+/).length;

  let score = 0;

  // Length signals
  if (chars > 300)  score += 1;
  if (chars > 800)  score += 1;
  if (chars > 1500) score += 2;
  if (words > 50)   score += 1;
  if (words > 150)  score += 2;

  // Keyword signals
  COMPLEX_SIGNALS.forEach((kw) => { if (text.includes(kw)) score += 2; });
  SIMPLE_SIGNALS.forEach((kw)  => { if (text.includes(kw)) score -= 2; });

  score = Math.max(0, score);

  const appType = detectAppType(text);

  // SaaS types always get bumped to medium minimum (they need real generation, not inline templates)
  const saasTypes = new Set([
    'booking-saas', 'crm-saas', 'ai-saas', 'collaboration-saas', 'project-management',
    'marketplace', 'lms-saas', 'finance-saas', 'hr-saas', 'health-saas',
  ]);
  if (saasTypes.has(appType) && score <= 1) score = 2; // force medium minimum

  if (score <= 1) return { level: 'simple',  score, estimate: '20–60 seconds', appType };
  if (score <= 5) return { level: 'medium',  score, estimate: '1–3 minutes',   appType };
  return              { level: 'complex', score, estimate: '3–8 minutes',   appType };
}

module.exports = { classifyComplexity, detectAppType };
