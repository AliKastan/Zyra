'use strict';

/**
 * DATABASE REPAIR
 *
 * Creates a database client wrapper when intent.needsDatabase === true and the
 * validator flagged missing db initialisation. Detects which DB technology is
 * implied by existing files / dependencies and generates an appropriate wrapper.
 *
 * Supported adapters (auto-detected):
 *   - supabase  (supabase-js already used / SUPABASE_URL env var)
 *   - postgres  (pg package in package.json)
 *   - mongoose  (mongoose package — MongoDB)
 *   - sqlite    (better-sqlite3 / sqlite3)
 *   - generic   (fallback in-memory store with same interface)
 *
 * @param {import('./types').RepairContext} ctx
 * @returns {import('./types').RepairIssueResult[]}
 */
function repairDatabase(ctx) {
  const { fileMap, filePaths, issues, decisions, intent } = ctx;
  /** @type {import('./types').RepairIssueResult[]} */
  const results = [];

  if (!intent.needsDatabase) return results;

  const dbIssues = issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair && (
      i.id === 'missing_db_client'       ||
      i.id === 'missing_db_schema'       ||
      i.id === 'missing_crud_operations'
    );
  });

  if (dbIssues.length === 0) return results;

  const issueIds = new Set(dbIssues.map(i => i.id));

  // ── Detect adapter ─────────────────────────────────────────────────────────
  const adapter = _detectAdapter(fileMap, filePaths);

  // ── 1. db.js wrapper ───────────────────────────────────────────────────────
  const dbPath = _resolveDbPath(filePaths);
  if ((issueIds.has('missing_db_client') || issueIds.has('missing_crud_operations')) && !filePaths.has(dbPath)) {
    const content = _generateDbWrapper(adapter);
    fileMap.set(dbPath, content);
    filePaths.add(dbPath);
    results.push({
      issueId:    'missing_db_client',
      action:     'created_file',
      path:       dbPath,
      reason:     `Created ${dbPath} — ${adapter} database client wrapper with CRUD helpers`,
      safety:     'conditional_auto_repair',
      confidence: 0.78,
    });
  }

  // ── 2. schema.js (when adapter is generic / sqlite) ───────────────────────
  if (issueIds.has('missing_db_schema') && adapter === 'generic') {
    const schemaPath = _resolveSchemaPath(filePaths);
    if (!filePaths.has(schemaPath)) {
      fileMap.set(schemaPath, _generateGenericSchema());
      filePaths.add(schemaPath);
      results.push({
        issueId:    'missing_db_schema',
        action:     'created_file',
        path:       schemaPath,
        reason:     `Created ${schemaPath} — generic data model definitions`,
        safety:     'conditional_auto_repair',
        confidence: 0.72,
      });
    }
  }

  return results;
}

// ── Adapter detection ──────────────────────────────────────────────────────────

function _detectAdapter(fileMap, filePaths) {
  const pkgContent = fileMap.get('package.json') || '';
  let deps = {};
  try { deps = JSON.parse(pkgContent).dependencies || {}; } catch { /* */ }

  if (deps['@supabase/supabase-js'] || [...filePaths].some(p => /supabase/i.test(p))) return 'supabase';
  if (deps['mongoose'])                                                                  return 'mongoose';
  if (deps['pg'] || deps['postgres'])                                                    return 'postgres';
  if (deps['better-sqlite3'] || deps['sqlite3'])                                        return 'sqlite';

  // Check file content for adapter hints
  const allContent = [...fileMap.values()].join('\n');
  if (/mongoose\.connect|require\('mongoose'\)/.test(allContent)) return 'mongoose';
  if (/new Pool\(|require\('pg'\)/.test(allContent))              return 'postgres';
  if (/createClient.*supabase/.test(allContent))                  return 'supabase';

  return 'generic';
}

// ── Path resolution ────────────────────────────────────────────────────────────

function _resolveDbPath(filePaths) {
  const candidates = ['db.js', 'database.js', 'src/db.js', 'src/database.js', 'lib/db.js'];
  for (const c of candidates) if (filePaths.has(c)) return c;
  return [...filePaths].some(p => p.startsWith('src/')) ? 'src/db.js' : 'db.js';
}

function _resolveSchemaPath(filePaths) {
  return [...filePaths].some(p => p.startsWith('src/')) ? 'src/schema.js' : 'schema.js';
}

// ── Generator dispatch ─────────────────────────────────────────────────────────

function _generateDbWrapper(adapter) {
  switch (adapter) {
    case 'supabase':  return _generateSupabaseWrapper();
    case 'mongoose':  return _generateMongooseWrapper();
    case 'postgres':  return _generatePostgresWrapper();
    case 'sqlite':    return _generateSqliteWrapper();
    default:          return _generateGenericWrapper();
  }
}

// ── Supabase wrapper ──────────────────────────────────────────────────────────

function _generateSupabaseWrapper() {
  return `'use strict';

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
);

/**
 * Query rows from a table.
 * @param {string} table
 * @param {Object} [filters]
 * @returns {Promise<Object[]>}
 */
async function findMany(table, filters = {}) {
  let q = supabase.from(table).select('*');
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Find a single row by ID.
 * @param {string} table
 * @param {string|number} id
 */
async function findById(table, id) {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

/**
 * Insert a new row.
 * @param {string} table
 * @param {Object} row
 */
async function create(table, row) {
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

/**
 * Update rows matching a filter.
 * @param {string} table
 * @param {Object} filter
 * @param {Object} updates
 */
async function update(table, filter, updates) {
  let q = supabase.from(table).update(updates);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data, error } = await q.select();
  if (error) throw error;
  return data;
}

/**
 * Delete rows matching a filter.
 * @param {string} table
 * @param {Object} filter
 */
async function remove(table, filter) {
  let q = supabase.from(table).delete();
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { error } = await q;
  if (error) throw error;
}

module.exports = { supabase, findMany, findById, create, update, remove };
`;
}

// ── Mongoose wrapper ──────────────────────────────────────────────────────────

function _generateMongooseWrapper() {
  return `'use strict';

const mongoose = require('mongoose');

let _connected = false;

/**
 * Connect to MongoDB. Safe to call multiple times.
 */
async function connect() {
  if (_connected) return;
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('Missing MONGODB_URI environment variable');
  await mongoose.connect(uri);
  _connected = true;
  console.log('[db] MongoDB connected');
}

/**
 * Disconnect (useful for tests).
 */
async function disconnect() {
  await mongoose.disconnect();
  _connected = false;
}

module.exports = { connect, disconnect, mongoose };
`;
}

// ── PostgreSQL wrapper ────────────────────────────────────────────────────────

function _generatePostgresWrapper() {
  return `'use strict';

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL is not set — database features unavailable');
}

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false })
  : null;

/**
 * Run a parameterised query.
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<Object[]>}
 */
async function query(sql, params = []) {
  if (!pool) throw new Error('Database pool not initialised — set DATABASE_URL');
  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Run a query and return the first row.
 * @param {string} sql
 * @param {any[]} [params]
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * Execute a query within a transaction.
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 */
async function transaction(fn) {
  if (!pool) throw new Error('Database pool not initialised');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, queryOne, transaction };
`;
}

// ── SQLite wrapper ────────────────────────────────────────────────────────────

function _generateSqliteWrapper() {
  return `'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

/**
 * Run a SELECT statement and return all rows.
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Object[]}
 */
function query(sql, params = []) {
  return db.prepare(sql).all(params);
}

/**
 * Run a SELECT and return the first row.
 * @param {string} sql
 * @param {any[]} [params]
 */
function queryOne(sql, params = []) {
  return db.prepare(sql).get(params) || null;
}

/**
 * Run an INSERT/UPDATE/DELETE statement.
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {import('better-sqlite3').RunResult}
 */
function run(sql, params = []) {
  return db.prepare(sql).run(params);
}

module.exports = { db, query, queryOne, run };
`;
}

// ── Generic in-memory wrapper (fallback) ──────────────────────────────────────

function _generateGenericWrapper() {
  return `'use strict';

/**
 * Minimal in-memory data store.
 * Replace with a real database adapter (Supabase, PostgreSQL, MongoDB, SQLite).
 *
 * WARNING: Data is lost on server restart.
 */

/** @type {Map<string, Map<string, Object>>} */
const _store = new Map();

function _table(name) {
  if (!_store.has(name)) _store.set(name, new Map());
  return _store.get(name);
}

let _counter = 0;
function _genId() { return String(++_counter); }

/**
 * Find all records in a table, optionally filtered.
 * @param {string} table
 * @param {Object} [filters]
 * @returns {Object[]}
 */
function findMany(table, filters = {}) {
  const rows = [..._table(table).values()];
  return rows.filter(row =>
    Object.entries(filters).every(([k, v]) => row[k] === v)
  );
}

/**
 * Find a record by id.
 * @param {string} table
 * @param {string} id
 */
function findById(table, id) {
  return _table(table).get(String(id)) || null;
}

/**
 * Insert a record (auto-assigns id if not present).
 * @param {string} table
 * @param {Object} data
 */
function create(table, data) {
  const record = { id: _genId(), createdAt: new Date().toISOString(), ...data };
  _table(table).set(String(record.id), record);
  return record;
}

/**
 * Update a record by id.
 * @param {string} table
 * @param {string} id
 * @param {Object} updates
 */
function update(table, id, updates) {
  const existing = findById(table, id);
  if (!existing) throw new Error(\`Record \${id} not found in \${table}\`);
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  _table(table).set(String(id), updated);
  return updated;
}

/**
 * Delete a record by id.
 * @param {string} table
 * @param {string} id
 */
function remove(table, id) {
  _table(table).delete(String(id));
}

module.exports = { findMany, findById, create, update, remove };
`;
}

// ── Generic schema ────────────────────────────────────────────────────────────

function _generateGenericSchema() {
  return `'use strict';

/**
 * Data model definitions.
 * Update these to match your actual data requirements.
 */

const SCHEMAS = {
  users: {
    fields: ['id', 'email', 'name', 'passwordHash', 'role', 'createdAt', 'updatedAt'],
    required: ['email', 'passwordHash'],
  },
  // TODO: add your application-specific models here
};

module.exports = { SCHEMAS };
`;
}

module.exports = { repairDatabase };
