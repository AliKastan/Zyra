/**
 * backendService.js
 *
 * Core logic for Zyra's managed backend.
 * Generated apps call /api/backend/* which delegates here.
 *
 * Data model:
 *   zyra_app_projects  — registered project slugs (provision tracking)
 *   zyra_app_users     — end-users of generated apps (custom auth)
 *   zyra_app_data      — all generated-app row data (unified JSONB store)
 */

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = 10;

function getJwtSecret() {
  const s = process.env.ZYRA_JWT_SECRET;
  if (!s) throw new Error('ZYRA_JWT_SECRET env var is not set');
  return s;
}

function getJwtExpiry() {
  return process.env.ZYRA_JWT_EXPIRES_IN || '7d';
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

function issueToken(userId, projectId, email) {
  return jwt.sign(
    { sub: userId, projectId, email },
    getJwtSecret(),
    { expiresIn: getJwtExpiry() }
  );
}

/**
 * Verifies a JWT. Returns decoded payload or throws Error('Unauthorized').
 */
function verifyToken(token) {
  if (!token) throw new Error('Unauthorized');
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    throw new Error('Unauthorized');
  }
}

// ── Provision ─────────────────────────────────────────────────────────────────

/**
 * Registers a project in zyra_app_projects (idempotent).
 * Called by the generated app's ZyraApp.init() — safe to call on every load.
 */
async function provisionProject(projectId) {
  if (!projectId || typeof projectId !== 'string') throw new Error('projectId is required');
  if (projectId.length > 120) throw new Error('projectId too long');

  const db = getSupabaseAdmin();
  const { error } = await db
    .from('zyra_app_projects')
    .upsert({ project_id: projectId }, { onConflict: 'project_id', ignoreDuplicates: true });

  if (error) throw new Error(`Provision failed: ${error.message}`);
  logger.debug(`backendService: provisioned projectId="${projectId}"`);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function signUp(projectId, email, password) {
  if (!email || !password) throw new Error('email and password are required');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');

  const db = getSupabaseAdmin();
  const normEmail = email.toLowerCase().trim();

  // Uniqueness check within this project
  const { data: existing } = await db
    .from('zyra_app_users')
    .select('id')
    .eq('project_id', projectId)
    .eq('email', normEmail)
    .maybeSingle();

  if (existing) throw new Error('Email already registered');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const { data: user, error } = await db
    .from('zyra_app_users')
    .insert({ project_id: projectId, email: normEmail, password_hash: passwordHash })
    .select('id, email, created_at')
    .single();

  if (error) throw new Error(`Sign-up failed: ${error.message}`);

  const token = issueToken(user.id, projectId, user.email);
  logger.debug(`backendService: signUp ok projectId="${projectId}" userId="${user.id}"`);
  return { user: { id: user.id, email: user.email }, token };
}

async function signIn(projectId, email, password) {
  const db = getSupabaseAdmin();
  const normEmail = email.toLowerCase().trim();

  const { data: user } = await db
    .from('zyra_app_users')
    .select('id, email, password_hash')
    .eq('project_id', projectId)
    .eq('email', normEmail)
    .maybeSingle();

  if (!user) return null;

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return null;

  const token = issueToken(user.id, projectId, user.email);
  logger.debug(`backendService: signIn ok projectId="${projectId}" userId="${user.id}"`);
  return { user: { id: user.id, email: user.email }, token };
}

// ── Data CRUD ─────────────────────────────────────────────────────────────────

/**
 * Get all rows in a collection.
 * Auth is optional for reads — passes token to attach ownership context.
 * Filters are simple JSONB key=value equality checks (from query params).
 */
async function getData(projectId, collection, filters = {}, token) {
  const db = getSupabaseAdmin();

  // Auth optional — don't 401 on bad/expired tokens for reads
  let ownerId = null;
  if (token) {
    try {
      const decoded = verifyToken(token);
      if (decoded.projectId === projectId) ownerId = decoded.sub;
    } catch {
      // Expired or invalid token — still allow reading (no ownership filter applied)
    }
  }

  let query = db
    .from('zyra_app_data')
    .select('id, data, owner_id, created_at, updated_at')
    .eq('project_id', projectId)
    .eq('collection', collection)
    .order('created_at', { ascending: true });

  // Apply JSONB filters from query string
  const filterEntries = Object.entries(filters);
  for (const [key, val] of filterEntries) {
    // PostgREST JSONB filter: data->>'key' = 'val'
    query = query.filter(`data->>${key}`, 'eq', val);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getData failed: ${error.message}`);

  return (data || []).map(rowToPublic);
}

/**
 * Insert a new row into a collection.
 * If authenticated, the row is owned by the calling user.
 */
async function createData(projectId, collection, payload, token) {
  const db = getSupabaseAdmin();

  let ownerId = null;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded.projectId !== projectId) throw new Error('Unauthorized');
    ownerId = decoded.sub;
  }

  // Strip any _-prefixed meta fields the client might send
  const cleanPayload = sanitizePayload(payload);

  const { data: row, error } = await db
    .from('zyra_app_data')
    .insert({ project_id: projectId, collection, owner_id: ownerId, data: cleanPayload })
    .select('id, data, owner_id, created_at')
    .single();

  if (error) throw new Error(`createData failed: ${error.message}`);
  return rowToPublic(row);
}

/**
 * Update an existing row (partial merge — existing fields preserved unless overwritten).
 * Requires auth. Only the row's owner can update it.
 */
async function updateData(projectId, collection, id, payload, token) {
  const db = getSupabaseAdmin();
  const decoded = verifyToken(token); // update always requires auth
  if (decoded.projectId !== projectId) throw new Error('Unauthorized');

  const { data: existing } = await db
    .from('zyra_app_data')
    .select('data, owner_id')
    .eq('id', id)
    .eq('project_id', projectId)
    .eq('collection', collection)
    .maybeSingle();

  if (!existing) return null;

  // Ownership: if the row has an owner, only that owner can update
  if (existing.owner_id && existing.owner_id !== decoded.sub) throw new Error('Unauthorized');

  const merged = { ...existing.data, ...sanitizePayload(payload) };

  const { data: row, error } = await db
    .from('zyra_app_data')
    .update({ data: merged, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, data, owner_id, updated_at')
    .single();

  if (error) throw new Error(`updateData failed: ${error.message}`);
  return rowToPublic(row);
}

/**
 * Delete a row. Requires auth. Only the row's owner can delete it.
 */
async function deleteData(projectId, collection, id, token) {
  const db = getSupabaseAdmin();
  const decoded = verifyToken(token); // delete always requires auth
  if (decoded.projectId !== projectId) throw new Error('Unauthorized');

  const { data: existing } = await db
    .from('zyra_app_data')
    .select('owner_id')
    .eq('id', id)
    .eq('project_id', projectId)
    .eq('collection', collection)
    .maybeSingle();

  if (!existing) return; // already deleted or doesn't exist — treat as success

  if (existing.owner_id && existing.owner_id !== decoded.sub) throw new Error('Unauthorized');

  const { error } = await db
    .from('zyra_app_data')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`deleteData failed: ${error.message}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Flatten a DB row into a clean public object, spreading JSONB data fields to top level. */
function rowToPublic(row) {
  return {
    id: row.id,
    ...row.data,
    _ownerId:   row.owner_id || undefined,
    _createdAt: row.created_at,
    _updatedAt: row.updated_at,
  };
}

/** Strip keys starting with _ to prevent clients overwriting internal fields. */
function sanitizePayload(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj || {};
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('_')));
}

module.exports = {
  provisionProject,
  signUp,
  signIn,
  getData,
  createData,
  updateData,
  deleteData,
};
