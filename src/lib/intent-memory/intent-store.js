'use strict';

/**
 * Intent Store
 *
 * In-memory session store for UserIntentMemory objects.
 * Keyed by sessionId. Sessions persist for the server process lifetime.
 *
 * For multi-server deployments the store could be swapped for Redis/DB,
 * but in-memory is sufficient for single-server Zyra.
 */

/** @type {Map<string, import('./types').UserIntentMemory>} */
const _store = new Map();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the current intent memory for a session, or null if none exists.
 * @param {string} sessionId
 * @returns {import('./types').UserIntentMemory | null}
 */
function getIntentMemory(sessionId) {
  return _store.get(sessionId) || null;
}

/**
 * Save (create or replace) intent memory for a session.
 * @param {string} sessionId
 * @param {import('./types').UserIntentMemory} memory
 */
function setIntentMemory(sessionId, memory) {
  _store.set(sessionId, memory);
}

/**
 * Delete intent memory for a session (hard reset).
 * @param {string} sessionId
 */
function deleteIntentMemory(sessionId) {
  _store.delete(sessionId);
}

/**
 * Create a fresh, empty intent memory for a session.
 * @param {string} sessionId
 * @returns {import('./types').UserIntentMemory}
 */
function createFreshMemory(sessionId) {
  const now = new Date().toISOString();
  return {
    sessionId,
    appGoal:          '',
    appType:          'generic',
    coreFeatures:     [],
    platforms:        ['web'],
    targetUsers:      [],
    roles:            [],
    integrations:     [],
    databaseEntities: [],
    designIntent:     '',
    adminRequired:    false,
    billingRequired:  false,
    authRequired:     false,
    mobileRequired:   false,
    promptCount:      0,
    createdAt:        now,
    lastUpdated:      now,
    lastPromptUpdate: '',
    intentHistory:    [],
  };
}

/**
 * Get or create intent memory for a session.
 * @param {string} sessionId
 * @returns {import('./types').UserIntentMemory}
 */
function getOrCreateMemory(sessionId) {
  return _store.get(sessionId) || createFreshMemory(sessionId);
}

/**
 * Return all active session IDs (for diagnostics).
 * @returns {string[]}
 */
function listSessions() {
  return [..._store.keys()];
}

/**
 * Return count of active sessions.
 * @returns {number}
 */
function sessionCount() {
  return _store.size;
}

module.exports = {
  getIntentMemory,
  setIntentMemory,
  deleteIntentMemory,
  createFreshMemory,
  getOrCreateMemory,
  listSessions,
  sessionCount,
};
