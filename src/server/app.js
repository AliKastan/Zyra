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

const app = express();

// ── Private beta gate ─────────────────────────────────────────────────────────
const GATE_CODE = 'zyra2026';

function hasGateAccess(req) {
  const cookie = req.headers.cookie || '';
  return /zyra_gate=granted/.test(cookie);
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

app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ── Gate verify endpoint (no auth required) ───────────────────────────────────
app.post('/api/gate/verify', (req, res) => {
  if (req.body?.code === GATE_CODE) {
    const maxAge = 30 * 24 * 60 * 60; // 30 days
    res.setHeader('Set-Cookie', `zyra_gate=granted; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`);
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false });
});

// ── Static: dashboard assets (index:false stops auto-serving index.html at /) ──
app.use(express.static(path.resolve(__dirname, '../../frontend'), { index: false }));

// Block direct URL access to index.html — redirect through the gate
app.get('/index.html', (_req, res) => res.redirect('/app'));

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

// ── Page routes ───────────────────────────────────────────────────────────────

// Root: always show the gate
app.get('/', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/gate.html'));
});

// Main app: server checks cookie before serving
app.get('/app', (req, res) => {
  if (!hasGateAccess(req)) return res.redirect('/');
  res.sendFile(path.resolve(__dirname, '../../frontend/index.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/login.html'));
});

app.get('/billing', (req, res) => {
  if (!hasGateAccess(req)) return res.redirect('/');
  res.sendFile(path.resolve(__dirname, '../../frontend/billing.html'));
});

// Fallback: gate-protect everything else
app.get(/^(?!\/api)(?!\/preview).*$/, (req, res) => {
  if (!hasGateAccess(req)) return res.redirect('/');
  res.sendFile(path.resolve(__dirname, '../../frontend/index.html'));
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

module.exports = app;
