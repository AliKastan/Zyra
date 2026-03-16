'use strict';

/**
 * Intent History
 *
 * Manages the intentHistory log on a UserIntentMemory.
 * Each entry records what changed and why, enabling debugging
 * of generation decisions across a multi-prompt session.
 */

const MAX_HISTORY_ENTRIES = 50; // cap to prevent unbounded growth

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append a new history entry to the memory's intentHistory array.
 * Returns the modified history (does not mutate the original).
 *
 * @param {import('./types').IntentHistoryEntry[]} history
 * @param {string}                                 prompt
 * @param {import('./types').IntentUpdate}          update
 * @param {string[]}                               conflicts - Conflict messages from resolveConflicts
 * @returns {import('./types').IntentHistoryEntry[]}
 */
function appendHistoryEntry(history, prompt, update, conflicts = []) {
  const entry = {
    timestamp:   new Date().toISOString(),
    prompt:      prompt.length > 200 ? prompt.slice(0, 197) + '...' : prompt,
    changeType:  update.changeType,
    description: update.description,
    changes: {
      added:    _buildAdded(update),
      updated:  _buildUpdated(update),
      removed:  _buildRemoved(update),
      conflicts,
    },
  };

  const updated = [...history, entry];
  // Keep only the latest N entries
  return updated.slice(-MAX_HISTORY_ENTRIES);
}

/**
 * Get a plain-text summary of recent history (last N entries).
 * @param {import('./types').IntentHistoryEntry[]} history
 * @param {number} [limit=10]
 * @returns {string}
 */
function formatHistoryLog(history, limit = 10) {
  return history
    .slice(-limit)
    .map((e, i) =>
      `  ${i + 1}. [${e.changeType}] ${e.description} (${_relativeTime(e.timestamp)})`,
    )
    .join('\n') || '  (no history yet)';
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _buildAdded(update) {
  const added = {};
  if (update.features?.length)      added.features      = update.features;
  if (update.integrations?.length)  added.integrations  = update.integrations;
  if (update.platforms?.length)     added.platforms     = update.platforms;
  if (update.roles?.length)         added.roles         = update.roles;
  if (update.entities?.length)      added.entities      = update.entities;
  if (update.appGoal)               added.appGoal       = update.appGoal;
  if (update.designIntent)          added.designIntent  = update.designIntent;
  return added;
}

function _buildUpdated(update) {
  const updated = {};
  if (update.changeType === 'CHANGE_STYLE' && update.designIntent) {
    updated.designIntent = update.designIntent;
  }
  if (update.changeType === 'CHANGE_PLATFORM' && update.platforms?.length) {
    updated.platforms = update.platforms;
  }
  if (update.authRequired)    updated.authRequired    = true;
  if (update.billingRequired) updated.billingRequired = true;
  if (update.adminRequired)   updated.adminRequired   = true;
  if (update.mobileRequired)  updated.mobileRequired  = true;
  return updated;
}

function _buildRemoved(update) {
  const removed = {};
  if (update.changeType === 'REMOVE_FEATURE' && update.removeFeatures?.length) {
    removed.features = update.removeFeatures;
  }
  return removed;
}

function _relativeTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 1000)    return 'just now';
  if (ms < 60000)   return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  return new Date(iso).toLocaleTimeString();
}

module.exports = { appendHistoryEntry, formatHistoryLog };
