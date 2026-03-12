/**
 * Prompt complexity classifier.
 * Returns level (simple/medium/complex), estimate, score, and detected appType.
 * appType is used by the inline planner to select a template without an API call.
 */

const COMPLEX_SIGNALS = [
  'full-stack', 'fullstack', 'auth', 'authentication', 'login', 'register',
  'database', 'db', 'sql', 'postgres', 'mongodb', 'prisma',
  'payment', 'stripe', 'billing', 'subscription',
  'saas', 'crm', 'erp', 'admin panel', 'role', 'permissions',
  'multi-user', 'user management', 'real-time', 'websocket',
  'notifications', 'email', 'oauth', 'jwt', 'session',
  'backend api', 'rest api', 'graphql', 'microservice',
];

const SIMPLE_SIGNALS = [
  'landing page', 'landing', 'portfolio', 'personal site', 'resume site',
  'todo', 'task list', 'calculator', 'counter', 'timer', 'stopwatch',
  'simple form', 'contact form', 'quiz', 'survey',
  'simple', 'basic', 'minimal', 'static site', 'single page', 'one page',
  'static', 'brochure', 'homepage',
];

// Ordered from most-specific to least-specific
const APP_TYPE_PATTERNS = [
  { type: 'landing-page',  keywords: ['landing page', 'landing', 'homepage', 'hero', 'brochure', 'product page', 'marketing'] },
  { type: 'portfolio',     keywords: ['portfolio', 'personal site', 'resume site', 'my work', 'showcase'] },
  { type: 'todo',          keywords: ['todo', 'task list', 'task manager', 'tasks', 'checklist'] },
  { type: 'calculator',    keywords: ['calculator', 'calc', 'math tool'] },
  { type: 'timer',         keywords: ['timer', 'stopwatch', 'countdown', 'pomodoro'] },
  { type: 'form',          keywords: ['contact form', 'survey form', 'quiz', 'feedback form', 'simple form'] },
  { type: 'dashboard',     keywords: ['dashboard', 'stats page', 'analytics page', 'metrics'] },
  { type: 'blog',          keywords: ['blog', 'articles', 'posts', 'news site'] },
  { type: 'crud',          keywords: ['crud', 'inventory', 'notes app', 'list app'] },
  { type: 'api',           keywords: ['rest api', 'api server', 'express api', 'api only'] },
  { type: 'chat',          keywords: ['chat app', 'messaging app'] },
];

function detectAppType(text) {
  for (const { type, keywords } of APP_TYPE_PATTERNS) {
    if (keywords.some((kw) => text.includes(kw))) return type;
  }
  return 'generic';
}

function classifyComplexity(prompt) {
  const text = prompt.toLowerCase().trim();
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

  if (score <= 1) return { level: 'simple',  score, estimate: '20–60 seconds', appType };
  if (score <= 5) return { level: 'medium',  score, estimate: '1–3 minutes',   appType };
  return              { level: 'complex', score, estimate: '3–8 minutes',   appType };
}

module.exports = { classifyComplexity, detectAppType };
