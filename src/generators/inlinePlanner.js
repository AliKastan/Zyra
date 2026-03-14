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
// SaaS templates have richer file structures (20+ files) used as guidance for full generation.
// Simple templates (calculator, timer, etc.) remain minimal.

const TEMPLATES = {
  // ── SaaS product types ──────────────────────────────────────────────────────
  'booking-saas': {
    summary: 'A booking SaaS MVP with auth, scheduling, provider management, notifications, and billing.',
    stack: 'HTML/CSS/JS + Supabase',
    files: [
      'index.html', 'pages/login.html', 'pages/register.html', 'pages/forgot-password.html',
      'pages/pricing.html',
      'pages/dashboard/index.html', 'pages/dashboard/bookings.html',
      'pages/dashboard/calendar.html', 'pages/dashboard/settings.html', 'pages/dashboard/billing.html',
      'pages/provider/index.html', 'pages/provider/availability.html',
      'pages/admin/index.html', 'pages/admin/users.html',
      'css/main.css', 'css/components.css', 'css/layout.css', 'css/auth.css', 'css/responsive.css',
      'js/app.js', 'js/auth.js', 'js/router.js', 'js/api.js', 'js/utils.js',
      'js/bookings.js', 'js/calendar.js', 'js/billing.js', 'js/admin.js',
      'js/components/modal.js', 'js/components/toast.js', 'js/components/sidebar.js',
      'config/supabase.js', 'sql/schema.sql', 'sql/seed.sql', 'env.example', 'README.md',
    ],
    steps: [
      'Build landing page with hero, feature highlights, pricing (Free/Pro/Business), and signup CTA',
      'Implement Supabase auth: signup, login, password reset, user profile creation trigger',
      'Build provider availability system: time slots, recurring schedules, blocking dates',
      'Build booking flow: browse providers, select slot, confirm, receive confirmation',
      'Build customer dashboard: upcoming bookings, history, cancel/reschedule',
      'Build provider dashboard: booking requests, calendar view, manage availability',
      'Build admin panel: user management, booking overview, platform analytics',
      'Add billing architecture: plan table, subscriptions table, Stripe env setup',
    ],
  },

  'crm-saas': {
    summary: 'A CRM SaaS MVP with contacts, pipeline management, deal tracking, and team collaboration.',
    stack: 'HTML/CSS/JS + Supabase',
    files: [
      'index.html', 'pages/login.html', 'pages/register.html', 'pages/forgot-password.html',
      'pages/pricing.html',
      'pages/dashboard/index.html', 'pages/dashboard/contacts.html',
      'pages/dashboard/pipeline.html', 'pages/dashboard/deals.html',
      'pages/dashboard/activities.html', 'pages/dashboard/settings.html', 'pages/dashboard/billing.html',
      'pages/admin/index.html', 'pages/admin/users.html',
      'css/main.css', 'css/components.css', 'css/layout.css', 'css/auth.css', 'css/responsive.css',
      'js/app.js', 'js/auth.js', 'js/router.js', 'js/api.js', 'js/utils.js',
      'js/contacts.js', 'js/pipeline.js', 'js/deals.js', 'js/activities.js',
      'js/billing.js', 'js/admin.js',
      'js/components/modal.js', 'js/components/toast.js', 'js/components/sidebar.js',
      'config/supabase.js', 'sql/schema.sql', 'sql/seed.sql', 'env.example', 'README.md',
    ],
    steps: [
      'Build landing page with CRM feature highlights, use-case sections, and pricing',
      'Implement Supabase auth with profile + workspace creation on signup',
      'Build contacts module: list with search/filter, contact card, notes, activity timeline',
      'Build pipeline view: Kanban board with deal stages, drag-and-drop between columns',
      'Build deals module: deal CRUD with value, close date, probability, contact linking',
      'Build activities module: calls, emails, meetings — log and track per contact/deal',
      'Build dashboard: pipeline value, win rate, deals by stage, recent activity feed',
      'Add admin panel with user management, team invites, and subscription status',
    ],
  },

  'ai-saas': {
    summary: 'An AI SaaS MVP with prompt interface, usage tracking, plan limits, and billing.',
    stack: 'HTML/CSS/JS + Supabase',
    files: [
      'index.html', 'pages/login.html', 'pages/register.html', 'pages/forgot-password.html',
      'pages/pricing.html',
      'pages/dashboard/index.html', 'pages/dashboard/generate.html',
      'pages/dashboard/history.html', 'pages/dashboard/settings.html', 'pages/dashboard/billing.html',
      'pages/admin/index.html', 'pages/admin/users.html', 'pages/admin/usage.html',
      'css/main.css', 'css/components.css', 'css/layout.css', 'css/auth.css', 'css/responsive.css',
      'js/app.js', 'js/auth.js', 'js/router.js', 'js/api.js', 'js/utils.js',
      'js/generator.js', 'js/history.js', 'js/usage.js', 'js/billing.js', 'js/admin.js',
      'js/components/modal.js', 'js/components/toast.js', 'js/components/sidebar.js',
      'config/supabase.js', 'sql/schema.sql', 'sql/seed.sql', 'env.example', 'README.md',
    ],
    steps: [
      'Build landing page with AI value prop, feature demos, usage stats, and pricing tiers',
      'Implement auth + profile with usage_credits field seeded from plan',
      'Build main AI generation interface: prompt textarea, model config, output display, copy button',
      'Build generation history: past outputs with search, filter by date, regenerate, delete',
      'Implement usage tracking: credits_used counter, plan limits enforcement before API call',
      'Build usage dashboard: credits remaining, bar chart of usage over time, reset date',
      'Build billing page: current plan, upgrade/downgrade, Stripe checkout redirect',
      'Build admin panel: total users, API usage, revenue, per-user usage table',
    ],
  },

  'project-management': {
    summary: 'A project management SaaS MVP with boards, tasks, team members, and progress tracking.',
    stack: 'HTML/CSS/JS + Supabase',
    files: [
      'index.html', 'pages/login.html', 'pages/register.html', 'pages/forgot-password.html',
      'pages/pricing.html',
      'pages/dashboard/index.html', 'pages/dashboard/projects.html',
      'pages/dashboard/board.html', 'pages/dashboard/tasks.html',
      'pages/dashboard/team.html', 'pages/dashboard/settings.html', 'pages/dashboard/billing.html',
      'pages/admin/index.html',
      'css/main.css', 'css/components.css', 'css/layout.css', 'css/auth.css', 'css/responsive.css',
      'js/app.js', 'js/auth.js', 'js/router.js', 'js/api.js', 'js/utils.js',
      'js/projects.js', 'js/board.js', 'js/tasks.js', 'js/team.js',
      'js/billing.js', 'js/admin.js',
      'js/components/modal.js', 'js/components/toast.js', 'js/components/sidebar.js',
      'config/supabase.js', 'sql/schema.sql', 'sql/seed.sql', 'env.example', 'README.md',
    ],
    steps: [
      'Build landing page with product demo, workflow features, team pricing',
      'Implement auth + workspace creation (every user gets a personal workspace on signup)',
      'Build projects list: create project, set name/color/icon, archive, member count',
      'Build Kanban board: columns (Todo/In Progress/Review/Done), task cards, drag-and-drop',
      'Build task detail modal: description, assignee, due date, priority, labels, comments',
      'Build team management: invite by email, role assignment (owner/admin/member/viewer)',
      'Build dashboard: tasks due today, project progress bars, recent activity',
      'Add billing with workspace plan limits (projects count, members count per plan)',
    ],
  },

  'collaboration-saas': {
    summary: 'A team collaboration SaaS MVP with channels, direct messaging, members, and file sharing.',
    stack: 'HTML/CSS/JS + Supabase',
    files: [
      'index.html', 'pages/login.html', 'pages/register.html', 'pages/forgot-password.html',
      'pages/pricing.html', 'pages/create-workspace.html',
      'pages/workspace/index.html', 'pages/workspace/channel.html', 'pages/workspace/dm.html',
      'pages/workspace/members.html', 'pages/workspace/settings.html',
      'pages/dashboard/billing.html', 'pages/admin/index.html',
      'css/main.css', 'css/components.css', 'css/layout.css', 'css/auth.css', 'css/responsive.css',
      'js/app.js', 'js/auth.js', 'js/router.js', 'js/api.js', 'js/utils.js',
      'js/workspace.js', 'js/channels.js', 'js/messages.js', 'js/members.js',
      'js/billing.js', 'js/admin.js',
      'js/components/modal.js', 'js/components/toast.js',
      'config/supabase.js', 'sql/schema.sql', 'sql/seed.sql', 'env.example', 'README.md',
    ],
    steps: [
      'Build landing page with "team communication" positioning, channel screenshots, pricing',
      'Implement auth + workspace creation wizard (name, invite team, create channels)',
      'Build workspace layout: left sidebar (workspace switcher, channels, DMs), main content area',
      'Build channel messaging: real-time messages via Supabase Realtime, message history',
      'Build direct messaging: user picker, DM thread, online presence indicators',
      'Build member management: invite, assign roles, view profiles, deactivate',
      'Build notifications: unread counts per channel, notification preferences',
      'Add billing: per-seat pricing model, workspace plan limits, Stripe setup',
    ],
  },

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
