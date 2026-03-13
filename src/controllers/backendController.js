const svc    = require('../services/backendService');
const logger = require('../utils/logger');

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function ok(res, data)          { res.json({ data, error: null }); }
function fail(res, msg, code)   { res.status(code || 400).json({ data: null, error: msg }); }

// ── POST /api/backend/provision/:projectId ────────────────────────────────────

async function provision(req, res) {
  try {
    await svc.provisionProject(req.params.projectId);
    ok(res, { provisioned: true });
  } catch (err) {
    logger.error('backendController.provision', { error: err.message });
    fail(res, err.message, 500);
  }
}

// ── POST /api/backend/auth/signup/:projectId ──────────────────────────────────

async function signUp(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 'email and password are required');

  try {
    const result = await svc.signUp(req.params.projectId, email, password);
    ok(res, result);
  } catch (err) {
    const code = err.message === 'Email already registered' ? 409 : 500;
    fail(res, err.message, code);
  }
}

// ── POST /api/backend/auth/signin/:projectId ──────────────────────────────────

async function signIn(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 'email and password are required');

  try {
    const result = await svc.signIn(req.params.projectId, email, password);
    if (!result) return fail(res, 'Invalid email or password', 401);
    ok(res, result);
  } catch (err) {
    logger.error('backendController.signIn', { error: err.message });
    fail(res, err.message, 500);
  }
}

// ── POST /api/backend/auth/signout/:projectId ─────────────────────────────────

function signOut(_req, res) {
  // JWTs are stateless — client discards the token; nothing to do server-side
  ok(res, { signedOut: true });
}

// ── GET /api/backend/data/:projectId/:collection ──────────────────────────────

async function getAll(req, res) {
  const { projectId, collection } = req.params;
  const filters = req.query;

  // Cap filter count to prevent abuse
  if (Object.keys(filters).length > 20) return fail(res, 'Too many filter params', 400);

  try {
    const rows = await svc.getData(projectId, collection, filters, extractToken(req));
    ok(res, rows);
  } catch (err) {
    fail(res, err.message, err.message === 'Unauthorized' ? 401 : 500);
  }
}

// ── POST /api/backend/data/:projectId/:collection ─────────────────────────────

async function create(req, res) {
  const { projectId, collection } = req.params;

  try {
    const row = await svc.createData(projectId, collection, req.body || {}, extractToken(req));
    ok(res, row);
  } catch (err) {
    fail(res, err.message, err.message === 'Unauthorized' ? 401 : 500);
  }
}

// ── PUT /api/backend/data/:projectId/:collection/:id ──────────────────────────

async function update(req, res) {
  const { projectId, collection, id } = req.params;

  try {
    const row = await svc.updateData(projectId, collection, id, req.body || {}, extractToken(req));
    if (!row) return fail(res, 'Record not found', 404);
    ok(res, row);
  } catch (err) {
    fail(res, err.message, err.message === 'Unauthorized' ? 401 : 500);
  }
}

// ── DELETE /api/backend/data/:projectId/:collection/:id ──────────────────────

async function remove(req, res) {
  const { projectId, collection, id } = req.params;

  try {
    await svc.deleteData(projectId, collection, id, extractToken(req));
    ok(res, { deleted: true });
  } catch (err) {
    fail(res, err.message, err.message === 'Unauthorized' ? 401 : 500);
  }
}

module.exports = { provision, signUp, signIn, signOut, getAll, create, update, remove };
