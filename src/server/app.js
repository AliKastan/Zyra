const express = require('express');
const cors = require('cors');
const path = require('path');

const healthRoutes   = require('../routes/healthRoutes');
const generateRoutes = require('../routes/generateRoutes');
const editRoutes     = require('../routes/editRoutes');
const jobsRoutes     = require('../routes/jobsRoutes');
const projectsRoutes = require('../routes/projectsRoutes');
const previewRoutes  = require('../routes/previewRoutes');
const deployRoutes   = require('../routes/deployRoutes');
const billingRoutes  = require('../routes/billingRoutes');
const debugRoutes    = require('../routes/debugRoutes');
const { requireAuth } = require('../middleware/authMiddleware');
const { stripeWebhook } = require('../controllers/billingController');
const logger = require('../utils/logger');
const { isValidCode } = require('../config/accessCodes');

const app = express();

// ── Private beta gate ─────────────────────────────────────────────────────────
const ACCESS_COOKIE = 'zyra_access';

function hasGateAccess(req) {
  const cookie = req.headers.cookie || '';
  return cookie.split(';').some(c => c.trim() === `${ACCESS_COOKIE}=true`);
}

function requireGate(req, res, next) {
  if (hasGateAccess(req)) return next();
  const next_ = encodeURIComponent(req.originalUrl);
  res.redirect(`/access?next=${next_}`);
}

// ── Stripe webhook — MUST come before express.json() to get raw body ──────────
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);

// ── General middleware ────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── Security headers ──────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-src 'self'",
      "upgrade-insecure-requests",
    ].join('; ')
  );
  next();
});

app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ── Gate verify endpoint ──────────────────────────────────────────────────────
app.post('/api/gate/verify', (req, res) => {
  if (isValidCode(req.body?.code)) {
    const maxAge = 30 * 24 * 60 * 60; // 30 days
    res.setHeader('Set-Cookie', `${ACCESS_COOKIE}=true; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly`);
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false });
});

// ── Page routes — registered BEFORE express.static so they win ───────────────
//
// Rule: express processes middleware top-to-bottom.
// express.static would serve index.html for /index.html before our route
// handlers ever run. By placing page routes first, we control every HTML path.

// Access gate page — always public (no chicken-and-egg)
app.get('/access', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/access.html'));
});

// Root: gate → landing page
app.get('/', requireGate, (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/landing.html'));
});

// Landing page — gate-protected
app.get('/landing', requireGate, (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/landing.html'));
});

// Block direct access to index.html — always redirect through /app
app.get('/index.html', (_req, res) => res.redirect(301, '/app'));

// Main app: gate-protected
app.get('/app', requireGate, (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/index.html'));
});

// Login page — gate-protected (login is post-access, within the product)
app.get('/login', requireGate, (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/login.html'));
});

// Billing page: gate-protected
app.get('/billing', requireGate, (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/billing.html'));
});

// ── Static assets (CSS, JS, images) — index:false prevents serving index.html ─
// Registered AFTER page routes so it only handles actual asset files.
app.use(express.static(path.resolve(__dirname, '../../frontend'), { index: false }));

// ── Static: live preview of generated projects ────────────────────────────────
app.use('/preview', express.static(path.resolve(__dirname, '../../generated-projects'), {
  index: 'index.html',
  extensions: ['html'],
}));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/health',    healthRoutes);
app.use('/api/generate',  requireAuth, generateRoutes);
app.use('/api/edit',      requireAuth, editRoutes);
app.use('/api/jobs',      requireAuth, jobsRoutes);
app.use('/api/projects',  requireAuth, projectsRoutes);
app.use('/api/preview',   requireAuth, previewRoutes);
app.use('/api/deploy',    requireAuth, deployRoutes);
app.use('/api/billing',   requireAuth, billingRoutes);
app.use('/api/debug',     requireAuth, debugRoutes);

// ── Fallback: any unmatched route — gate-protected ───────────────────────────
app.get(/^(?!\/api)(?!\/preview)(?!\/access).*$/, requireGate, (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/index.html'));
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

module.exports = app;
