/**
 * Template-Hybrid Generation System.
 *
 * For simple landing pages, portfolios, and generic sites, this system:
 *   1. Detects style variant from prompt keywords (dark / warm / tech / light)
 *   2. Sends a ~80-token content-extraction prompt to the model
 *   3. Gets back ~200-400 tokens of content vars (name, tagline, features, etc.)
 *   4. Injects vars into a pre-written professional template
 *
 * Cost: ~450 tokens total vs 12,000–18,000 for full generation (96% reduction).
 *
 * App types that benefit from template-hybrid:
 *   landing-page, portfolio, generic
 *
 * App types that still need full generation (custom logic):
 *   todo, crud, dashboard, blog, api, chat, calculator, timer, form
 */

// ── Style variant detection ────────────────────────────────────────────────────

const STYLE_SIGNALS = {
  dark:  /dark|black|night|luxury|premium|elite|obsidian|midnight|noir|sleek/i,
  warm:  /warm|cozy|natural|health|wellness|fitness|green|earth|organic|artisan|studio|boutique/i,
  tech:  /tech|ai|data|saas|software|cloud|platform|developer|dev|code|api|startup|b2b/i,
};

/**
 * Detect the best style variant for a given prompt.
 * Returns 'dark' | 'warm' | 'tech' | 'light'
 */
function detectStyleTag(prompt) {
  if (STYLE_SIGNALS.dark.test(prompt))  return 'dark';
  if (STYLE_SIGNALS.warm.test(prompt))  return 'warm';
  if (STYLE_SIGNALS.tech.test(prompt))  return 'tech';
  return 'light';
}

// ── Content extraction prompt ──────────────────────────────────────────────────

/**
 * Builds the tiny prompt that asks the model for content vars only.
 * System: ~60 tokens. User: ~50 tokens. Response: ~200-400 tokens.
 */
function buildContentExtractionPrompt(userPrompt) {
  const system = `Extract website content from the user request. Output ONLY this JSON (no other text):
{"n":"company or product name","tl":"tagline ≤8 words, compelling","d":"description ≤20 words, clear value prop","f":[{"t":"feature name ≤5 words","d":"benefit ≤12 words"},{"t":"...","d":"..."},{"t":"...","d":"..."}],"stats":[{"v":"metric","l":"label"},{"v":"...","l":"..."},{"v":"...","l":"..."},{"v":"...","l":"..."}],"cta":"CTA ≤4 words","cta2":"secondary CTA ≤4 words or empty","foot":"brand tagline ≤10 words"}`;

  const user = `Request: "${userPrompt}"`;
  return { system, user };
}

// ── Default content (used if model returns partial data) ───────────────────────

function defaultContent(prompt) {
  const words = prompt.replace(/^(build|create|make|a|an|the)\s+/i, '').split(/\s+/);
  const name = words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return {
    n: name || 'Product',
    tl: 'The smarter way to get things done',
    d: 'Built for teams that want reliable tools without the complexity.',
    f: [
      { t: 'Powerful Features', d: 'Everything you need to move fast and ship confidently.' },
      { t: 'Built to Scale',    d: 'Handles growth seamlessly from day one to a million users.' },
      { t: 'Great Experience',  d: 'Intuitive design your whole team will actually enjoy using.' },
    ],
    stats: [
      { v: '99.9%', l: 'Uptime' },
      { v: '2,400+', l: 'Customers' },
      { v: '< 2hrs', l: 'Setup Time' },
      { v: '4.9 / 5', l: 'Rating' },
    ],
    cta: 'Get Started Free',
    cta2: 'See How It Works',
    foot: 'Making great software accessible to everyone.',
  };
}

/**
 * Merge extracted content with defaults, ensuring all required fields are present.
 */
function mergeContent(extracted, prompt) {
  const defaults = defaultContent(prompt);
  const c = { ...defaults, ...extracted };
  // Ensure arrays have expected length
  if (!Array.isArray(c.f) || c.f.length < 3)  c.f    = defaults.f;
  if (!Array.isArray(c.stats) || c.stats.length < 4) c.stats = defaults.stats;
  return c;
}

// ── CSS theme variants ─────────────────────────────────────────────────────────
// Each theme overrides CSS custom properties. Base CSS uses var(--*) everywhere.

const THEMES = {
  light: {
    bg: '#ffffff', surface: '#f8fafc', text: '#0f172a', text2: '#475569',
    text3: '#94a3b8', border: '#e2e8f0', accent: '#4F46E5', accentHover: '#4338CA',
    accentLight: '#eef2ff', btnText: '#fff', shadow: 'rgba(0,0,0,.06)',
    heroGrad: 'linear-gradient(160deg,#ffffff 60%,#f0f4ff 100%)',
    ctaBg: '#0f172a', ctaText: '#f8fafc',
  },
  dark: {
    bg: '#08090f', surface: '#0f172a', text: '#f1f5f9', text2: '#94a3b8',
    text3: '#475569', border: '#1e293b', accent: '#818cf8', accentHover: '#a5b4fc',
    accentLight: '#1e1b4b', btnText: '#08090f', shadow: 'rgba(0,0,0,.4)',
    heroGrad: 'linear-gradient(160deg,#08090f 60%,#0f172a 100%)',
    ctaBg: '#4F46E5', ctaText: '#fff',
  },
  warm: {
    bg: '#faf9f7', surface: '#ffffff', text: '#1c1917', text2: '#57534e',
    text3: '#a8a29e', border: '#e7e5e4', accent: '#0d9488', accentHover: '#0f766e',
    accentLight: '#f0fdfa', btnText: '#fff', shadow: 'rgba(0,0,0,.05)',
    heroGrad: 'linear-gradient(160deg,#faf9f7 60%,#f0fdfa 100%)',
    ctaBg: '#1c1917', ctaText: '#faf9f7',
  },
  tech: {
    bg: '#020617', surface: '#0f172a', text: '#e2e8f0', text2: '#94a3b8',
    text3: '#475569', border: '#1e293b', accent: '#7c3aed', accentHover: '#8b5cf6',
    accentLight: '#2e1065', btnText: '#fff', shadow: 'rgba(0,0,0,.5)',
    heroGrad: 'linear-gradient(160deg,#020617 60%,#0f172a 100%)',
    ctaBg: '#7c3aed', ctaText: '#fff',
  },
};

// ── Template builders ──────────────────────────────────────────────────────────

function buildHtml(c, theme) {
  const f = c.f;
  const s = c.stats;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(c.n)}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>

<nav class="nav">
  <div class="nav-inner">
    <a class="logo" href="#">${esc(c.n)}</a>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#about">About</a>
      <a href="#cta" class="btn btn-primary">${esc(c.cta)}</a>
    </div>
    <button class="hamburger" onclick="toggleNav()" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </div>
  <div class="mobile-nav" id="mobileNav">
    <a href="#features" onclick="toggleNav()">Features</a>
    <a href="#about" onclick="toggleNav()">About</a>
    <a href="#cta" class="btn btn-primary" onclick="toggleNav()">${esc(c.cta)}</a>
  </div>
</nav>

<section class="hero">
  <div class="container">
    <p class="badge">Introducing ${esc(c.n)}</p>
    <h1>${esc(c.tl)}</h1>
    <p class="hero-sub">${esc(c.d)}</p>
    <div class="hero-btns">
      <a href="#cta" class="btn btn-primary btn-lg">${esc(c.cta)}</a>
      ${c.cta2 ? `<a href="#features" class="btn btn-outline btn-lg">${esc(c.cta2)}</a>` : ''}
    </div>
    <div class="proof-row">
      <span class="proof-avatars">
        <span class="av">A</span><span class="av">B</span><span class="av">C</span><span class="av">D</span>
      </span>
      <span class="proof-text">Trusted by <strong>${s[1]?.v || '2,400+'}</strong> ${s[1]?.l?.toLowerCase() || 'customers'} worldwide</span>
    </div>
  </div>
</section>

<section class="features" id="features">
  <div class="container">
    <div class="section-hd">
      <p class="label">Why it works</p>
      <h2>Built for the way you work</h2>
      <p>Everything you need to move faster, nothing to slow you down.</p>
    </div>
    <div class="feat-grid">
      <div class="feat-card">
        <div class="feat-num">01</div>
        <h3>${esc(f[0].t)}</h3>
        <p>${esc(f[0].d)}</p>
      </div>
      <div class="feat-card">
        <div class="feat-num">02</div>
        <h3>${esc(f[1].t)}</h3>
        <p>${esc(f[1].d)}</p>
      </div>
      <div class="feat-card">
        <div class="feat-num">03</div>
        <h3>${esc(f[2].t)}</h3>
        <p>${esc(f[2].d)}</p>
      </div>
    </div>
  </div>
</section>

<section class="stats" id="about">
  <div class="container stats-grid">
    <div class="stat"><span class="sv">${esc(s[0].v)}</span><span class="sl">${esc(s[0].l)}</span></div>
    <div class="stat"><span class="sv">${esc(s[1].v)}</span><span class="sl">${esc(s[1].l)}</span></div>
    <div class="stat"><span class="sv">${esc(s[2].v)}</span><span class="sl">${esc(s[2].l)}</span></div>
    <div class="stat"><span class="sv">${esc(s[3].v)}</span><span class="sl">${esc(s[3].l)}</span></div>
  </div>
</section>

<section class="cta-section" id="cta">
  <div class="container cta-inner">
    <h2>Ready to get started?</h2>
    <p>Join thousands of teams already using ${esc(c.n)} to build better.</p>
    <form class="cta-form" onsubmit="submitCTA(event)">
      <input type="email" id="ctaEmail" placeholder="Work email" required>
      <button type="submit" class="btn btn-cta">${esc(c.cta)}</button>
    </form>
    <p class="cta-note">No credit card required. Free 14-day trial.</p>
    <p id="ctaSuccess" class="cta-success" style="display:none">You're in. We'll be in touch soon.</p>
  </div>
</section>

<footer class="footer">
  <div class="container footer-inner">
    <div class="footer-brand">
      <a class="logo" href="#">${esc(c.n)}</a>
      <p>${esc(c.foot || 'Making great software accessible to everyone.')}</p>
    </div>
    <div class="footer-links">
      <div class="fc"><p>Product</p><a href="#">Features</a><a href="#">Pricing</a><a href="#">Changelog</a></div>
      <div class="fc"><p>Company</p><a href="#">About</a><a href="#">Blog</a><a href="#">Careers</a></div>
      <div class="fc"><p>Legal</p><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Security</a></div>
    </div>
  </div>
  <div class="footer-btm">
    <div class="container"><p>© ${new Date().getFullYear()} ${esc(c.n)}. All rights reserved.</p></div>
  </div>
</footer>

<script src="app.js"></script>
</body>
</html>`;
}

function buildCss(theme) {
  const t = THEMES[theme] || THEMES.light;
  return `/* ── Design tokens ──────────────────────────────── */
:root {
  --bg:           ${t.bg};
  --surface:      ${t.surface};
  --text:         ${t.text};
  --text-2:       ${t.text2};
  --text-3:       ${t.text3};
  --border:       ${t.border};
  --accent:       ${t.accent};
  --accent-h:     ${t.accentHover};
  --accent-light: ${t.accentLight};
  --btn-text:     ${t.btnText};
  --shadow:       ${t.shadow};
  --hero-grad:    ${t.heroGrad};
  --cta-bg:       ${t.ctaBg};
  --cta-fg:       ${t.ctaText};
  --radius:       12px;
  --font:         system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --max-w:        1100px;
}

/* ── Reset ─────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px;scroll-behavior:smooth}
body{font-family:var(--font);color:var(--text);background:var(--bg);line-height:1.65;-webkit-font-smoothing:antialiased}
a{text-decoration:none;color:inherit}
img{max-width:100%;display:block}

/* ── Layout ────────────────────────────────────── */
.container{max-width:var(--max-w);margin:0 auto;padding:0 24px}

/* ── Buttons ───────────────────────────────────── */
.btn{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 20px;border-radius:8px;font-size:.9375rem;font-weight:600;cursor:pointer;border:1.5px solid transparent;transition:background .18s,box-shadow .18s,border-color .18s,color .18s;white-space:nowrap;font-family:inherit}
.btn-primary{background:var(--accent);color:var(--btn-text)}
.btn-primary:hover{background:var(--accent-h);box-shadow:0 4px 14px color-mix(in srgb,var(--accent) 35%,transparent)}
.btn-outline{border-color:var(--border);color:var(--text-2);background:transparent}
.btn-outline:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-light)}
.btn-lg{height:52px;padding:0 28px;font-size:1rem;border-radius:10px}
.btn-cta{background:var(--accent);color:var(--btn-text);height:52px;padding:0 28px;border-radius:10px;font-size:1rem;font-weight:700;border:none;cursor:pointer;transition:background .18s,box-shadow .18s;font-family:inherit}
.btn-cta:hover{background:var(--accent-h);box-shadow:0 4px 16px color-mix(in srgb,var(--accent) 40%,transparent)}

/* ── Navigation ────────────────────────────────── */
.nav{position:sticky;top:0;z-index:100;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:saturate(180%) blur(14px);border-bottom:1px solid var(--border);height:64px;display:flex;flex-direction:column;justify-content:center}
.nav-inner{max-width:var(--max-w);margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.logo{font-size:1.2rem;font-weight:800;color:var(--text);letter-spacing:-.03em}
.nav-links{display:flex;align-items:center;gap:24px}
.nav-links a{font-size:.9375rem;color:var(--text-2);font-weight:500;transition:color .15s}
.nav-links a:hover{color:var(--text)}
.nav-links .btn{margin-left:8px}
.hamburger{display:none;flex-direction:column;gap:5px;background:none;border:none;cursor:pointer;padding:4px}
.hamburger span{display:block;width:22px;height:2px;background:var(--text-2);border-radius:2px;transition:background .15s}
.mobile-nav{display:none;flex-direction:column;gap:16px;padding:16px 24px;border-top:1px solid var(--border);background:var(--bg)}
.mobile-nav a{font-size:1rem;color:var(--text-2);font-weight:500;padding:4px 0}
.mobile-nav.open{display:flex}

/* ── Hero ──────────────────────────────────────── */
.hero{padding:96px 0 88px;text-align:center;background:var(--hero-grad)}
.badge{display:inline-block;margin-bottom:24px;padding:5px 14px;border-radius:999px;background:var(--surface);border:1px solid var(--border);font-size:.8125rem;font-weight:700;color:var(--accent);letter-spacing:.05em;text-transform:uppercase}
h1{font-size:clamp(2.5rem,6vw,4.5rem);font-weight:800;letter-spacing:-.04em;line-height:1.1;color:var(--text);max-width:760px;margin:0 auto 20px}
.hero-sub{font-size:clamp(1rem,2vw,1.2rem);color:var(--text-2);max-width:540px;margin:0 auto 36px;line-height:1.6}
.hero-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:40px}
.proof-row{display:flex;align-items:center;justify-content:center;gap:10px;color:var(--text-3);font-size:.875rem}
.proof-avatars{display:flex}
.av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-h));color:var(--btn-text);font-size:.75rem;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg);margin-left:-8px}
.av:first-child{margin-left:0}
.proof-text strong{color:var(--text-2)}

/* ── Features ──────────────────────────────────── */
.features{padding:96px 0;background:var(--surface)}
.section-hd{text-align:center;margin-bottom:56px}
.label{font-size:.8125rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:10px}
h2{font-size:clamp(1.75rem,4vw,2.75rem);font-weight:800;letter-spacing:-.03em;line-height:1.2;color:var(--text);margin-bottom:12px}
.section-hd p{font-size:1.0625rem;color:var(--text-2);max-width:500px;margin:0 auto}
.feat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}
.feat-card{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:28px;box-shadow:0 1px 3px var(--shadow);transition:box-shadow .2s,transform .2s}
.feat-card:hover{box-shadow:0 4px 16px var(--shadow);transform:translateY(-2px)}
.feat-num{font-size:2.25rem;font-weight:900;color:var(--accent);opacity:.35;margin-bottom:14px;line-height:1;letter-spacing:-.04em}
.feat-card h3{font-size:1.125rem;font-weight:700;margin-bottom:10px;color:var(--text);letter-spacing:-.01em}
.feat-card p{font-size:.9375rem;color:var(--text-2);line-height:1.6}

/* ── Stats ─────────────────────────────────────── */
.stats{padding:0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--bg)}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr)}
.stat{padding:48px 24px;text-align:center;border-right:1px solid var(--border)}
.stat:last-child{border-right:none}
.sv{display:block;font-size:2.25rem;font-weight:800;letter-spacing:-.04em;color:var(--text);line-height:1.1;margin-bottom:6px}
.sl{font-size:.875rem;color:var(--text-3);font-weight:500}

/* ── CTA section ───────────────────────────────── */
.cta-section{padding:96px 0;background:var(--cta-bg);color:var(--cta-fg);text-align:center}
.cta-inner h2{font-size:clamp(1.75rem,4vw,2.5rem);font-weight:800;letter-spacing:-.03em;margin-bottom:12px;color:var(--cta-fg)}
.cta-inner p{font-size:1.0625rem;color:color-mix(in srgb,var(--cta-fg) 70%,transparent);margin-bottom:28px}
.cta-form{display:flex;gap:10px;max-width:480px;margin:0 auto 12px;flex-wrap:wrap;justify-content:center}
.cta-form input[type=email]{flex:1;min-width:200px;height:52px;padding:0 16px;border-radius:10px;border:1.5px solid color-mix(in srgb,var(--cta-fg) 25%,transparent);background:color-mix(in srgb,var(--cta-fg) 10%,transparent);color:var(--cta-fg);font-size:.9375rem;outline:none;font-family:inherit;transition:border-color .15s}
.cta-form input::placeholder{color:color-mix(in srgb,var(--cta-fg) 45%,transparent)}
.cta-form input:focus{border-color:color-mix(in srgb,var(--cta-fg) 50%,transparent)}
.cta-note{font-size:.875rem;color:color-mix(in srgb,var(--cta-fg) 45%,transparent)}
.cta-success{margin-top:16px;font-weight:600;color:#4ade80}

/* ── Footer ────────────────────────────────────── */
.footer{background:var(--surface);border-top:1px solid var(--border);padding-top:56px}
.footer-inner{display:flex;justify-content:space-between;gap:48px;flex-wrap:wrap;padding-bottom:48px}
.footer-brand p{margin-top:12px;font-size:.9375rem;color:var(--text-3);max-width:260px;line-height:1.55}
.footer-links{display:flex;gap:48px;flex-wrap:wrap}
.fc{display:flex;flex-direction:column;gap:10px}
.fc p{font-weight:700;font-size:.875rem;color:var(--text);letter-spacing:.02em;margin-bottom:4px}
.fc a{font-size:.9375rem;color:var(--text-3);transition:color .15s}
.fc a:hover{color:var(--text-2)}
.footer-btm{border-top:1px solid var(--border);padding:20px 0}
.footer-btm p{font-size:.875rem;color:var(--text-3);text-align:center}

/* ── Fade-in animation ─────────────────────────── */
.fadein{opacity:0;transform:translateY(18px);transition:opacity .45s ease,transform .45s ease}
.fadein.visible{opacity:1;transform:none}

/* ── Responsive ────────────────────────────────── */
@media(max-width:768px){
  .nav-links{display:none}
  .hamburger{display:flex}
  .hero{padding:72px 0 64px}
  .features,.cta-section{padding:64px 0}
  .stats-grid{grid-template-columns:1fr 1fr}
  .stat{border-right:none;border-bottom:1px solid var(--border);padding:32px 16px}
  .stat:nth-child(odd){border-right:1px solid var(--border)}
  .stat:nth-child(3),.stat:nth-child(4){border-bottom:none}
  .footer-inner{flex-direction:column;gap:32px}
  .footer-links{gap:24px}
}
@media(max-width:480px){
  h1{font-size:2.25rem}
  .feat-grid{grid-template-columns:1fr}
  .stats-grid{grid-template-columns:1fr 1fr}
}`;
}

function buildJs() {
  return `// Navigation
function toggleNav(){document.getElementById('mobileNav').classList.toggle('open')}

// Scroll shadow on nav
(function(){
  const nav=document.querySelector('.nav');
  window.addEventListener('scroll',function(){
    nav.style.boxShadow=window.scrollY>8?'0 1px 12px rgba(0,0,0,.1)':'none';
  });
})();

// Fade-in on scroll
(function(){
  const els=document.querySelectorAll('.feat-card,.stat,.section-hd');
  if(!('IntersectionObserver' in window)){
    els.forEach(function(el){el.classList.add('fadein','visible')});return;
  }
  els.forEach(function(el){el.classList.add('fadein')});
  const obs=new IntersectionObserver(function(entries){
    entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target)}});
  },{threshold:0.1});
  els.forEach(function(el){obs.observe(el)});
})();

// CTA form
function submitCTA(e){
  e.preventDefault();
  var form=e.target;
  var success=document.getElementById('ctaSuccess');
  form.style.display='none';
  success.style.display='block';
}`;
}

// ── Main public API ────────────────────────────────────────────────────────────

/**
 * Generate project files from content vars + style tag.
 * @param {object} contentVars - extracted from model or defaults
 * @param {string} styleTag - 'light' | 'dark' | 'warm' | 'tech'
 * @param {string} userPrompt - original prompt (for fallback naming)
 * @returns {{ projectName: string, files: Array<{path, content}>, _template: true }}
 */
function generateFromTemplate(contentVars, styleTag, userPrompt) {
  const c = mergeContent(contentVars, userPrompt || '');
  const theme = THEMES[styleTag] ? styleTag : 'light';

  const slug = c.n
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50) || 'landing';

  return {
    projectName: slug,
    files: [
      { path: 'index.html', content: buildHtml(c, theme) },
      { path: 'style.css',  content: buildCss(theme) },
      { path: 'app.js',     content: buildJs() },
    ],
    _template: true,
  };
}

// HTML-escape helper (prevents injection in template vars)
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// App types that benefit from template-hybrid (marketing/content sites only).
// 'generic' is intentionally excluded — it's ambiguous and could be any kind of app.
const TEMPLATE_TYPES = new Set(['landing-page', 'portfolio']);

module.exports = {
  detectStyleTag,
  buildContentExtractionPrompt,
  generateFromTemplate,
  defaultContent,
  mergeContent,
  TEMPLATE_TYPES,
};
