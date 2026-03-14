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
    summary: 'A polished, responsive landing page with hero, features section, social proof, and call-to-action.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: [
      'Build hero section with bold headline, sub-headline, and primary CTA button',
      'Add features/benefits grid with icons and descriptions',
      'Add social proof section (testimonials or logos)',
      'Add pricing or secondary CTA section',
      'Build footer with links',
      'Make fully responsive with smooth scroll and subtle animations',
    ],
  },
  'portfolio': {
    summary: 'A personal portfolio site with an about section, project gallery, skills, and contact form.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: [
      'Build sticky header with smooth-scroll navigation',
      'Add hero/intro section with name, title, and brief bio',
      'Add projects grid with hover effects and links',
      'Add skills section with visual indicators',
      'Add contact section with a working mailto form',
      'Style with a cohesive, professional theme',
    ],
  },
  'todo': {
    summary: 'A feature-rich todo app with add, toggle, filter, and delete — persisted to localStorage.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: [
      'Build input bar and task list UI',
      'Implement add task on Enter or button click',
      'Implement toggle complete (strikethrough) and delete',
      'Add filter tabs: All / Active / Completed',
      'Show item count and a Clear Completed button',
      'Persist all state to localStorage on every change',
    ],
  },
  'calculator': {
    summary: 'A functional calculator with standard arithmetic, keyboard support, and clear/backspace.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: [
      'Build calculator grid layout with display and buttons',
      'Wire up click and keyboard events',
      'Implement arithmetic logic: +, -, *, /',
      'Handle chained operations, decimal point, and sign toggle',
      'Handle edge cases: divide by zero, leading zeros, overflow display',
    ],
  },
  'timer': {
    summary: 'A countdown / stopwatch app with start, stop, reset, and lap tracking.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: [
      'Build large time display and control buttons',
      'Implement stopwatch mode with start/stop/reset using requestAnimationFrame',
      'Implement countdown mode with custom duration input',
      'Add lap recording with a scrollable lap list',
      'Add audio cue or visual flash when countdown reaches zero',
    ],
  },
  'form': {
    summary: 'A clean contact or survey form with real-time client-side validation and success state.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: [
      'Build form layout with labeled fields and clear visual hierarchy',
      'Add real-time validation: required fields, email format, min lengths',
      'Show inline error messages below each field on blur',
      'Disable submit button until form is valid',
      'Show a success message/animation on submission',
    ],
  },
  'dashboard': {
    summary: 'An analytics dashboard with metric cards, a chart, and a data table.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: [
      'Build collapsible sidebar with navigation links and icons',
      'Add top bar with page title and user avatar',
      'Add KPI metric cards with trend indicators (up/down arrows)',
      'Add a line or bar chart using Canvas API or SVG (no external lib)',
      'Add a sortable data table with pagination',
      'Make layout responsive: sidebar collapses on mobile',
    ],
  },
  'blog': {
    summary: 'A static blog with post list, individual post view, and category filtering.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: [
      'Define 5-6 sample posts as a JS data array (title, date, category, excerpt, body)',
      'Build post list page with cards showing excerpt and metadata',
      'Build single post view rendered into the same page via JS routing',
      'Add category filter tabs on the list page',
      'Add header with site name and nav; footer with links',
    ],
  },
  'crud': {
    summary: 'A CRUD app with create, read, update, and delete — data persisted to localStorage.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: [
      'Build a list view and a modal/inline form for create/edit',
      'Implement create: validate and append to state array',
      'Implement read: render list from state on every update',
      'Implement update: pre-fill form with existing data, save on submit',
      'Implement delete with a confirmation prompt',
      'Persist full state array to localStorage on every mutation',
    ],
  },
  'api': {
    summary: 'A RESTful API server with CRUD endpoints and in-memory data store.',
    stack: 'Node.js, Express',
    files: ['package.json', 'server.js', 'routes/items.js', 'middleware/errorHandler.js', 'README.md'],
    steps: [
      'Set up Express server with JSON body parsing and CORS',
      'Define in-memory data store (array + uuid for IDs)',
      'Add GET /items and GET /items/:id',
      'Add POST /items with input validation',
      'Add PUT /items/:id and DELETE /items/:id',
      'Add global error handler middleware and 404 fallback',
    ],
  },
  'chat': {
    summary: 'A real-time-style chat UI with message bubbles, timestamps, and simulated replies.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: [
      'Build chat layout: fixed header, scrollable message area, sticky input bar',
      'Implement send message on Enter or button — append user bubble',
      'Add typing indicator animation (three dots) before bot reply',
      'Simulate replies after 800–1500ms delay with canned responses',
      'Auto-scroll to latest message; format timestamps',
    ],
  },
  'generic': {
    summary: 'A clean, well-structured web application.',
    stack: 'HTML, CSS, JavaScript',
    files: ['index.html', 'style.css', 'app.js'],
    steps: [
      'Set up semantic HTML structure with header, main, and footer',
      'Implement the core requested functionality',
      'Style with a clean, consistent design system',
      'Make responsive for mobile and desktop',
    ],
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
