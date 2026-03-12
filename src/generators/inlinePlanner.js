/**
 * inlinePlanner — zero-latency plan generation for simple and fallback cases.
 *
 * Two functions:
 *   getInlinePlan(appType, prompt)  — template-based plan, returns instantly (<1ms)
 *   getFallbackPlan(prompt, appType) — used when the API planner times out or fails
 *
 * These plans are intentionally minimal. The coder model does the real work.
 */

// ── App-type templates ────────────────────────────────────────────────────────

const TEMPLATES = {
  'landing-page': {
    summary: 'A clean, responsive landing page with hero, features, and call-to-action.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: ['Build hero section with headline and CTA', 'Add features/benefits section', 'Add footer', 'Style with modern CSS'],
  },
  'portfolio': {
    summary: 'A personal portfolio site with an about section, project gallery, and contact info.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: ['Build header and navigation', 'Add about/intro section', 'Add projects grid', 'Add contact section'],
  },
  'todo': {
    summary: 'A todo app with add, toggle complete, and delete, persisted to local storage.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: ['Build input and task list UI', 'Implement add task', 'Implement toggle and delete', 'Persist to localStorage'],
  },
  'calculator': {
    summary: 'A functional calculator with standard arithmetic operations.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: ['Build calculator UI grid', 'Wire up button events', 'Implement arithmetic logic', 'Handle edge cases (divide by zero, etc.)'],
  },
  'timer': {
    summary: 'A countdown / stopwatch timer app.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: ['Build timer display and controls', 'Implement start/stop/reset', 'Add lap or countdown mode'],
  },
  'form': {
    summary: 'A simple contact or survey form with client-side validation.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: ['Build form layout and fields', 'Add client-side validation', 'Add success/error state'],
  },
  'dashboard': {
    summary: 'A stats dashboard with metric cards and a simple chart.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: ['Build sidebar and layout', 'Add metric cards', 'Add chart with dummy data', 'Style responsively'],
  },
  'blog': {
    summary: 'A static blog with a post list and individual post view.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'post.html', 'style.css', 'app.js'],
    steps: ['Build post list page', 'Build single post page', 'Wire up navigation', 'Add sample posts'],
  },
  'crud': {
    summary: 'A CRUD app with create, read, update, and delete stored in memory or localStorage.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: ['Build list and form UI', 'Implement create and read', 'Implement update and delete', 'Persist to localStorage'],
  },
  'api': {
    summary: 'A simple REST API server with CRUD endpoints.',
    stack: 'Node.js, Express',
    files: ['package.json', 'server.js', 'routes/items.js', 'README.md'],
    steps: ['Set up Express server', 'Define data store (in-memory)', 'Add CRUD routes', 'Add error handling middleware'],
  },
  'chat': {
    summary: 'A simple chat UI (client only, no real backend).',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: ['Build chat layout', 'Implement message send/display', 'Add mock responses'],
  },
  'generic': {
    summary: 'A minimal web application.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: ['Set up basic HTML structure', 'Add core functionality', 'Style the UI'],
  },
};

/**
 * Returns an instant, template-based plan for simple requests.
 * Zero API calls. < 1ms.
 *
 * @param {string} appType - from complexity.detectAppType()
 * @param {string} prompt  - original user prompt (used to personalize summary)
 * @returns {object} plan
 */
function getInlinePlan(appType, prompt) {
  const template = TEMPLATES[appType] || TEMPLATES['generic'];
  // Shallow clone so the shared template isn't mutated
  return {
    summary:  template.summary,
    stack:    template.stack,
    files:    [...template.files],
    steps:    [...template.steps],
    _source:  'inline',
    _appType: appType,
  };
}

/**
 * Returns a fallback plan when the API planner times out or returns bad output.
 * Uses the detected app type to give a sensible default; still instant.
 *
 * @param {string} prompt
 * @param {string} appType
 * @returns {object} plan
 */
function getFallbackPlan(prompt, appType = 'generic') {
  const plan = getInlinePlan(appType, prompt);
  return { ...plan, _source: 'fallback' };
}

module.exports = { getInlinePlan, getFallbackPlan };
