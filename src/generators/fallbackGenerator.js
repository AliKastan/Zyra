/**
 * Template-based fallback code generator.
 *
 * Used as a last resort when all model-based generation attempts fail.
 * Produces a professional-looking, fully functional landing page from
 * the user's prompt text — always succeeds, never throws.
 */

function slugifySimple(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50) || 'generated-app';
}

/**
 * Extract a usable title from the user's prompt.
 * Tries to pull the first meaningful noun phrase.
 */
function extractTitle(prompt) {
  // Strip common filler phrases and take the remaining meaningful words
  const cleaned = prompt
    .replace(/^(build|create|make|generate|design|develop)\s+/i, '')
    .replace(/^(a|an|the)\s+/i, '')
    .trim();

  // Capitalize first letter of each word, take first 5 words max
  const words = cleaned.split(/\s+/).slice(0, 5);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Extract a one-sentence description from the prompt.
 */
function extractDescription(prompt) {
  const cleaned = prompt.trim();
  if (cleaned.length < 80) return cleaned;
  return cleaned.slice(0, 120).trim() + '...';
}

/**
 * Pick a consistent accent color from the prompt keywords.
 */
function pickAccent(prompt) {
  const p = prompt.toLowerCase();
  if (/dark|black|night|luxury|premium|elite/.test(p))   return { main: '#1a1a2e', light: '#16213e', btn: '#e94560', hover: '#c73652' };
  if (/health|wellness|fitness|gym|green|nature/.test(p)) return { main: '#0D9488', light: '#f0fdfa', btn: '#0D9488', hover: '#0f766e' };
  if (/finance|money|bank|invest|gold/.test(p))           return { main: '#92400e', light: '#fffbeb', btn: '#d97706', hover: '#b45309' };
  if (/tech|ai|data|saas|software|cloud/.test(p))         return { main: '#4338CA', light: '#eef2ff', btn: '#4F46E5', hover: '#4338CA' };
  if (/creative|design|art|studio|agency/.test(p))        return { main: '#7C3AED', light: '#f5f3ff', btn: '#7C3AED', hover: '#6D28D9' };
  if (/food|restaurant|cafe|cook/.test(p))                return { main: '#B45309', light: '#fffbeb', btn: '#D97706', hover: '#B45309' };
  // Default: clean indigo
  return { main: '#1e293b', light: '#f8fafc', btn: '#4F46E5', hover: '#4338CA' };
}

/**
 * Generate 3 realistic feature cards relevant to the prompt.
 */
function generateFeatures(prompt) {
  const p = prompt.toLowerCase();
  if (/gym|fitness|workout|exercise/.test(p)) {
    return [
      { icon: '◎', title: 'Smart Workout Plans', desc: 'AI-powered training schedules adapted to your fitness level and goals.' },
      { icon: '◐', title: 'Progress Tracking',   desc: 'Log every set, rep, and milestone with detailed performance analytics.' },
      { icon: '◑', title: 'Community Support',   desc: 'Connect with fellow athletes and share achievements in a motivated community.' },
    ];
  }
  if (/ai|machine learning|data|model/.test(p)) {
    return [
      { icon: '◎', title: 'Intelligent Automation', desc: 'Automate repetitive workflows with state-of-the-art AI models.' },
      { icon: '◐', title: 'Real-Time Insights',     desc: 'Surface patterns in your data instantly with live dashboards.' },
      { icon: '◑', title: 'Enterprise Security',    desc: 'SOC 2 compliant infrastructure with end-to-end encryption.' },
    ];
  }
  if (/design|creative|agency|studio/.test(p)) {
    return [
      { icon: '◎', title: 'Pixel-Perfect Craft',  desc: 'We obsess over every detail to deliver designs that convert and delight.' },
      { icon: '◐', title: 'Strategic Thinking',   desc: 'Branding and UX grounded in user research and business objectives.' },
      { icon: '◑', title: 'End-to-End Delivery',  desc: 'From concept to production — one studio, complete ownership.' },
    ];
  }
  if (/saas|product|platform|software/.test(p)) {
    return [
      { icon: '◎', title: 'Lightning Fast',     desc: 'Built on modern infrastructure for <100ms response times globally.' },
      { icon: '◐', title: 'Scales With You',    desc: 'From 10 to 10 million users without changing a line of code.' },
      { icon: '◑', title: 'Integrates Anywhere', desc: 'REST API and native SDKs for every major language and framework.' },
    ];
  }
  // Generic defaults
  return [
    { icon: '◎', title: 'Powerful Features',  desc: 'Everything you need to get started quickly and scale with confidence.' },
    { icon: '◐', title: 'Built to Last',       desc: 'Reliable, performant, and designed with maintainability in mind.' },
    { icon: '◑', title: 'Great Experience',    desc: 'Intuitive interfaces that your team and customers will actually enjoy.' },
  ];
}

function generateHtml(title, description, accent, features) {
  const f = features;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <!-- Navigation -->
  <nav class="nav">
    <div class="nav-inner">
      <a href="#" class="nav-logo">${title.split(' ')[0]}</a>
      <div class="nav-links">
        <a href="#features">Features</a>
        <a href="#about">About</a>
        <a href="#cta" class="btn btn-primary">Get Started</a>
      </div>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="container">
      <div class="hero-badge">Now Available</div>
      <h1 class="hero-title">${title}</h1>
      <p class="hero-sub">${description}</p>
      <div class="hero-actions">
        <a href="#cta" class="btn btn-primary btn-lg">Get Started Free</a>
        <a href="#features" class="btn btn-outline btn-lg">Learn More</a>
      </div>
      <div class="hero-social-proof">
        <span class="proof-avatars">
          <span class="avatar">A</span>
          <span class="avatar">B</span>
          <span class="avatar">C</span>
          <span class="avatar">D</span>
        </span>
        <span class="proof-text">Trusted by <strong>2,400+</strong> teams worldwide</span>
      </div>
    </div>
  </section>

  <!-- Features -->
  <section class="features" id="features">
    <div class="container">
      <div class="section-header">
        <p class="section-label">Why choose us</p>
        <h2 class="section-title">Built for the way you work</h2>
        <p class="section-sub">Everything you need, nothing you don't. Focused on outcomes, not features.</p>
      </div>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">${f[0].icon}</div>
          <h3 class="feature-title">${f[0].title}</h3>
          <p class="feature-desc">${f[0].desc}</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">${f[1].icon}</div>
          <h3 class="feature-title">${f[1].title}</h3>
          <p class="feature-desc">${f[1].desc}</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">${f[2].icon}</div>
          <h3 class="feature-title">${f[2].title}</h3>
          <p class="feature-desc">${f[2].desc}</p>
        </div>
      </div>
    </div>
  </section>

  <!-- About / Proof -->
  <section class="about" id="about">
    <div class="container about-inner">
      <div class="about-text">
        <p class="section-label">Our approach</p>
        <h2 class="section-title">Quality over everything</h2>
        <p>We believe great products come from deeply understanding the problem, not just shipping fast. Every decision is deliberate, every detail considered.</p>
        <ul class="check-list">
          <li>Backed by a decade of industry experience</li>
          <li>Designed for real-world scale and reliability</li>
          <li>Continuous improvements, no version lock-in</li>
        </ul>
        <a href="#cta" class="btn btn-primary">Start Today</a>
      </div>
      <div class="about-stats">
        <div class="stat"><span class="stat-num">99.9%</span><span class="stat-label">Uptime SLA</span></div>
        <div class="stat"><span class="stat-num">2.4k+</span><span class="stat-label">Happy Customers</span></div>
        <div class="stat"><span class="stat-num">48hrs</span><span class="stat-label">Avg Setup Time</span></div>
        <div class="stat"><span class="stat-num">4.9/5</span><span class="stat-label">Customer Rating</span></div>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="cta-section" id="cta">
    <div class="container cta-inner">
      <h2>Ready to get started?</h2>
      <p>Join thousands of teams already using ${title.split(' ')[0]} to build better.</p>
      <form class="cta-form" onsubmit="handleSubmit(event)">
        <input type="email" placeholder="Enter your work email" required class="cta-input" id="emailInput">
        <button type="submit" class="btn btn-primary">Get Early Access</button>
      </form>
      <p class="cta-note">No credit card required. Free 14-day trial.</p>
      <div id="successMsg" class="success-msg" style="display:none">
        Thanks! We'll be in touch soon.
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="container footer-inner">
      <div class="footer-brand">
        <a href="#" class="nav-logo">${title.split(' ')[0]}</a>
        <p>Making great software accessible to everyone.</p>
      </div>
      <div class="footer-links">
        <div class="footer-col">
          <p class="footer-col-title">Product</p>
          <a href="#">Features</a>
          <a href="#">Pricing</a>
          <a href="#">Changelog</a>
        </div>
        <div class="footer-col">
          <p class="footer-col-title">Company</p>
          <a href="#">About</a>
          <a href="#">Blog</a>
          <a href="#">Careers</a>
        </div>
        <div class="footer-col">
          <p class="footer-col-title">Legal</p>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Security</a>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <div class="container">
        <p>© ${new Date().getFullYear()} ${title}. All rights reserved.</p>
      </div>
    </div>
  </footer>

  <script src="app.js"></script>
</body>
</html>`;
}

function generateCss(accent) {
  return `/* ── Design tokens ─────────────────────────────────────── */
:root {
  --accent:      ${accent.btn};
  --accent-hover:${accent.hover};
  --bg:          #ffffff;
  --surface:     #f8fafc;
  --text:        #0f172a;
  --text-2:      #475569;
  --text-3:      #94a3b8;
  --border:      #e2e8f0;
  --radius:      12px;
  --shadow-sm:   0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
  --shadow:      0 4px 16px rgba(0,0,0,.08);
  --shadow-lg:   0 12px 40px rgba(0,0,0,.12);
  --font:        system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --max-w:       1100px;
}

/* ── Reset ─────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; scroll-behavior: smooth; width: 100%; height: 100%; }
body {
  font-family: var(--font);
  color: var(--text);
  background: var(--bg);
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  width: 100%;
  min-height: 100vh;
}
a { text-decoration: none; color: inherit; }
img { max-width: 100%; display: block; }

/* ── Layout ────────────────────────────────────────────── */
.container {
  max-width: var(--max-w);
  margin: 0 auto;
  padding: 0 24px;
}

/* ── Buttons ───────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 20px;
  border-radius: 8px;
  font-size: .9375rem;
  font-weight: 600;
  cursor: pointer;
  border: 1.5px solid transparent;
  transition: background .18s, box-shadow .18s, border-color .18s, color .18s;
  white-space: nowrap;
}
.btn-primary {
  background: var(--accent);
  color: #fff;
}
.btn-primary:hover {
  background: var(--accent-hover);
  box-shadow: 0 4px 14px rgba(79,70,229,.3);
}
.btn-outline {
  border-color: var(--border);
  color: var(--text-2);
  background: transparent;
}
.btn-outline:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--surface);
}
.btn-lg { height: 52px; padding: 0 28px; font-size: 1rem; border-radius: 10px; }

/* ── Navigation ────────────────────────────────────────── */
.nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255,255,255,.88);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--border);
  height: 64px;
  display: flex;
  align-items: center;
}
.nav-inner {
  max-width: var(--max-w);
  margin: 0 auto;
  padding: 0 24px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.nav-logo {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.03em;
}
.nav-links {
  display: flex;
  align-items: center;
  gap: 28px;
}
.nav-links a {
  font-size: .9375rem;
  color: var(--text-2);
  font-weight: 500;
  transition: color .15s;
}
.nav-links a:hover { color: var(--text); }
.nav-links .btn { margin-left: 8px; }

/* ── Hero ──────────────────────────────────────────────── */
.hero {
  padding: 100px 0 96px;
  text-align: center;
  background: linear-gradient(160deg, #ffffff 60%, var(--surface) 100%);
}
.hero-badge {
  display: inline-block;
  margin-bottom: 24px;
  padding: 5px 14px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: .8125rem;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: .03em;
  text-transform: uppercase;
}
.hero-title {
  font-size: clamp(2.5rem, 6vw, 4.5rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.1;
  color: var(--text);
  max-width: 760px;
  margin: 0 auto 20px;
}
.hero-sub {
  font-size: clamp(1rem, 2vw, 1.25rem);
  color: var(--text-2);
  max-width: 580px;
  margin: 0 auto 36px;
  line-height: 1.6;
}
.hero-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 40px;
}
.hero-social-proof {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-3);
  font-size: .875rem;
}
.proof-avatars { display: flex; }
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
  color: #fff;
  font-size: .75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  margin-left: -8px;
}
.avatar:first-child { margin-left: 0; }
.proof-text strong { color: var(--text-2); }

/* ── Features ──────────────────────────────────────────── */
.features {
  padding: 96px 0;
  background: var(--surface);
}
.section-header {
  text-align: center;
  margin-bottom: 56px;
}
.section-label {
  font-size: .8125rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 10px;
}
.section-title {
  font-size: clamp(1.75rem, 4vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.2;
  color: var(--text);
  margin-bottom: 14px;
}
.section-sub {
  font-size: 1.0625rem;
  color: var(--text-2);
  max-width: 520px;
  margin: 0 auto;
}
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}
.feature-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 28px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow .2s, transform .2s;
}
.feature-card:hover {
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}
.feature-icon {
  font-size: 1.75rem;
  margin-bottom: 16px;
  color: var(--accent);
}
.feature-title {
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: 10px;
  color: var(--text);
  letter-spacing: -0.01em;
}
.feature-desc {
  font-size: .9375rem;
  color: var(--text-2);
  line-height: 1.6;
}

/* ── About ─────────────────────────────────────────────── */
.about {
  padding: 96px 0;
}
.about-inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 64px;
  align-items: center;
}
.about-text p {
  color: var(--text-2);
  line-height: 1.7;
  margin-bottom: 16px;
}
.about-text .section-title { margin-top: 10px; margin-bottom: 20px; }
.check-list {
  list-style: none;
  margin: 0 0 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.check-list li {
  padding-left: 24px;
  position: relative;
  color: var(--text-2);
  font-size: .9375rem;
}
.check-list li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: var(--accent);
  font-weight: 700;
}
.about-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.stat {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-num {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--text);
}
.stat-label {
  font-size: .875rem;
  color: var(--text-3);
}

/* ── CTA section ───────────────────────────────────────── */
.cta-section {
  padding: 96px 0;
  background: var(--text);
  color: #fff;
  text-align: center;
}
.cta-inner h2 {
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  margin-bottom: 12px;
}
.cta-inner p {
  font-size: 1.0625rem;
  color: rgba(255,255,255,.65);
  margin-bottom: 32px;
}
.cta-form {
  display: flex;
  gap: 10px;
  max-width: 480px;
  margin: 0 auto 12px;
  flex-wrap: wrap;
  justify-content: center;
}
.cta-input {
  flex: 1;
  min-width: 220px;
  height: 52px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1.5px solid rgba(255,255,255,.2);
  background: rgba(255,255,255,.1);
  color: #fff;
  font-size: .9375rem;
  outline: none;
  transition: border-color .15s;
}
.cta-input::placeholder { color: rgba(255,255,255,.45); }
.cta-input:focus { border-color: rgba(255,255,255,.5); }
.cta-note {
  font-size: .875rem;
  color: rgba(255,255,255,.4);
  margin-top: 0;
}
.success-msg {
  margin-top: 16px;
  color: #4ade80;
  font-weight: 600;
}

/* ── Footer ────────────────────────────────────────────── */
.footer {
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding-top: 56px;
}
.footer-inner {
  display: flex;
  justify-content: space-between;
  gap: 48px;
  flex-wrap: wrap;
  padding-bottom: 48px;
}
.footer-brand p {
  margin-top: 12px;
  font-size: .9375rem;
  color: var(--text-3);
  max-width: 260px;
  line-height: 1.55;
}
.footer-links { display: flex; gap: 48px; }
.footer-col { display: flex; flex-direction: column; gap: 10px; }
.footer-col-title {
  font-weight: 700;
  font-size: .875rem;
  color: var(--text);
  letter-spacing: .02em;
  margin-bottom: 4px;
}
.footer-col a {
  font-size: .9375rem;
  color: var(--text-3);
  transition: color .15s;
}
.footer-col a:hover { color: var(--text-2); }
.footer-bottom {
  border-top: 1px solid var(--border);
  padding: 20px 0;
}
.footer-bottom p {
  font-size: .875rem;
  color: var(--text-3);
  text-align: center;
}

/* ── Responsive ────────────────────────────────────────── */
@media (max-width: 768px) {
  .nav-links a:not(.btn) { display: none; }
  .about-inner { grid-template-columns: 1fr; gap: 40px; }
  .footer-inner { flex-direction: column; }
  .footer-links { flex-wrap: wrap; gap: 32px; }
  .hero { padding: 72px 0 64px; }
  .features, .about, .cta-section { padding: 64px 0; }
}

@media (max-width: 480px) {
  .hero-title { font-size: 2.25rem; }
  .features-grid { grid-template-columns: 1fr; }
  .about-stats { grid-template-columns: 1fr 1fr; }
}
`;
}

function generateJs() {
  return `// App entry point
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initAnimations();
});

function initNav() {
  const nav = document.querySelector('.nav');
  window.addEventListener('scroll', () => {
    nav.style.boxShadow = window.scrollY > 10
      ? '0 1px 12px rgba(0,0,0,.08)'
      : 'none';
  });
}

function initAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.feature-card, .stat, .about-text').forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
    observer.observe(el);
  });
}

function handleSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('emailInput');
  const msg   = document.getElementById('successMsg');
  if (input.value) {
    input.closest('.cta-form').style.display = 'none';
    msg.style.display = 'block';
  }
}
`;
}

/**
 * Generate fallback code output from the user's prompt.
 * Always succeeds. Returns the same shape as coderService.runCoder().
 */
function generateFallback(userPrompt, plan) {
  const title    = extractTitle(userPrompt || 'My App');
  const desc     = extractDescription(userPrompt || 'A modern web application.');
  const accent   = pickAccent(userPrompt || '');
  const features = generateFeatures(userPrompt || '');

  return {
    projectName: slugifySimple(title),
    files: [
      { path: 'index.html', content: generateHtml(title, desc, accent, features) },
      { path: 'style.css',  content: generateCss(accent) },
      { path: 'app.js',     content: generateJs() },
    ],
    _fallback: true,
  };
}

module.exports = { generateFallback };
