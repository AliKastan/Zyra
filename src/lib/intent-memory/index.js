'use strict';

/**
 * User Intent Memory System — Public API
 *
 * Persists and evolves the user's development intent across multiple
 * prompts within a session. Runs as Stage 0 (before the requirement
 * normalizer) in the Zyra pipeline.
 *
 * Primary entry point:
 *   updateIntentMemory(sessionId, prompt)  — update memory and return enriched context
 *
 * Session lifecycle:
 *   - Memory is created on first prompt for a sessionId
 *   - Memory updates on each subsequent prompt
 *   - Memory resets explicitly via resetIntentMemory() or on NEW_PROJECT detection
 */

const {
  getOrCreateMemory,
  setIntentMemory,
  deleteIntentMemory,
  createFreshMemory,
  getIntentMemory,
  listSessions,
  sessionCount,
} = require('./intent-store');

const { extractIntentUpdate }  = require('./update-intent');
const { mergeIntent }          = require('./merge-intent');
const { resolveConflicts }     = require('./conflict-resolution');
const { appendHistoryEntry, formatHistoryLog } = require('./intent-history');

// ── Primary entry point ──────────────────────────────────────────────────────

/**
 * Process a new user prompt: update the session's intent memory.
 *
 * @param {string} sessionId - Unique session identifier
 * @param {string} prompt    - Raw user prompt
 * @returns {import('./types').IntentMemoryResult}
 */
function updateIntentMemory(sessionId, prompt) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('updateIntentMemory: sessionId is required');
  }
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('updateIntentMemory: prompt is required');
  }

  const existing = getOrCreateMemory(sessionId);

  // 1. Extract intent signals from the new prompt
  const update = extractIntentUpdate(prompt, existing);

  // 2. Handle NEW_PROJECT reset
  let base = existing;
  let wasReset = false;
  if (update.changeType === 'NEW_PROJECT' && existing.promptCount > 0) {
    base = createFreshMemory(sessionId);
    wasReset = true;
  }

  // 3. Resolve conflicts between update and existing memory
  const { update: resolvedUpdate, conflicts } = resolveConflicts(update, base);

  // 4. Append history entry (uses original update so history is accurate)
  const updatedHistory = appendHistoryEntry(base.intentHistory, prompt, resolvedUpdate, conflicts);

  // 5. Merge update into memory
  const merged = mergeIntent(base, resolvedUpdate, prompt);
  merged.intentHistory = updatedHistory;

  // 6. Persist
  setIntentMemory(sessionId, merged);

  return { intentMemory: merged, update: resolvedUpdate, wasReset };
}

// ── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Get the current intent memory for a session without updating it.
 * Returns null if no session exists.
 *
 * @param {string} sessionId
 * @returns {import('./types').UserIntentMemory | null}
 */
function getIntentMemoryForSession(sessionId) {
  return getIntentMemory(sessionId);
}

/**
 * Build a concise human-readable summary of what the user is building.
 * Suitable for injecting into downstream prompts.
 *
 * @param {import('./types').UserIntentMemory} memory
 * @returns {string}
 */
function getIntentSummary(memory) {
  if (!memory || !memory.appGoal) return '';

  const parts = [`App: ${memory.appGoal}`];
  if (memory.coreFeatures.length > 0)    parts.push(`Features: ${memory.coreFeatures.join(', ')}`);
  if (memory.platforms.length > 0)       parts.push(`Platform: ${memory.platforms.join(' + ')}`);
  if (memory.integrations.length > 0)    parts.push(`Integrations: ${memory.integrations.join(', ')}`);
  if (memory.roles.length > 0)           parts.push(`Roles: ${memory.roles.join(', ')}`);
  if (memory.designIntent)               parts.push(`Design: ${memory.designIntent}`);
  if (memory.databaseEntities.length > 0) parts.push(`Entities: ${memory.databaseEntities.join(', ')}`);

  const flags = [];
  if (memory.authRequired)    flags.push('auth');
  if (memory.billingRequired) flags.push('billing');
  if (memory.adminRequired)   flags.push('admin');
  if (flags.length > 0)       parts.push(`Required: ${flags.join(', ')}`);

  return parts.join(' | ');
}

/**
 * Get the full intent history for a session.
 * @param {string} sessionId
 * @returns {import('./types').IntentHistoryEntry[]}
 */
function getIntentHistory(sessionId) {
  const memory = getIntentMemory(sessionId);
  return memory?.intentHistory || [];
}

/**
 * Hard-reset a session's intent memory (start fresh).
 * Triggered by user: "start new app" or explicit API call.
 *
 * @param {string} sessionId
 * @returns {import('./types').UserIntentMemory} - Fresh empty memory
 */
function resetIntentMemory(sessionId) {
  const fresh = createFreshMemory(sessionId);
  setIntentMemory(sessionId, fresh);
  return fresh;
}

/**
 * Build a lean UI payload from intent memory for the Zyra dashboard.
 * @param {import('./types').UserIntentMemory} memory
 * @returns {Object}
 */
function buildUiIntentPayload(memory) {
  if (!memory) return null;
  return {
    appGoal:          memory.appGoal,
    appType:          memory.appType,
    features:         memory.coreFeatures,
    platforms:        memory.platforms,
    integrations:     memory.integrations,
    roles:            memory.roles,
    entities:         memory.databaseEntities,
    designIntent:     memory.designIntent,
    adminRequired:    memory.adminRequired,
    billingRequired:  memory.billingRequired,
    authRequired:     memory.authRequired,
    mobileRequired:   memory.mobileRequired,
    promptCount:      memory.promptCount,
    lastUpdated:      memory.lastUpdated,
    recentHistory:    memory.intentHistory.slice(-5).map(e => ({
      changeType:  e.changeType,
      description: e.description,
      timestamp:   e.timestamp,
    })),
    summary:          getIntentSummary(memory),
  };
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Primary
  updateIntentMemory,

  // Session management
  getIntentMemoryForSession,
  resetIntentMemory,

  // Derived data
  getIntentSummary,
  getIntentHistory,
  buildUiIntentPayload,
  formatHistoryLog,

  // Store access (for diagnostic use)
  listSessions,
  sessionCount,

  // Sub-module re-exports (for selective use)
  extractIntentUpdate,
  mergeIntent,
  resolveConflicts,
  appendHistoryEntry,
};
