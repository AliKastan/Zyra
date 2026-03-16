'use strict';

/**
 * Intent Merger
 *
 * Merges an IntentUpdate into an existing UserIntentMemory.
 *
 * Rules:
 * - Additive by default: arrays are unioned, never replaced unless explicit
 * - Flags (authRequired, billingRequired, adminRequired, mobileRequired) are set to
 *   true when detected; only cleared by explicit REMOVE_FEATURE signals
 * - Single-value fields (designIntent, appType) are replaced when a new value is detected
 * - platform is replaced on CHANGE_PLATFORM, otherwise unioned
 * - appGoal is only replaced on NEW_PROJECT
 */

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Merge an IntentUpdate into a copy of the existing memory.
 * Returns a new memory object (does not mutate the original).
 *
 * @param {import('./types').UserIntentMemory} memory
 * @param {import('./types').IntentUpdate}     update
 * @param {string}                             rawPrompt
 * @returns {import('./types').UserIntentMemory}
 */
function mergeIntent(memory, update, rawPrompt) {
  // Clone — do not mutate the existing memory
  const m = _clone(memory);

  // ── App goal ─────────────────────────────────────────────────────────────
  if (update.changeType === 'NEW_PROJECT' && update.appGoal) {
    m.appGoal = update.appGoal;
  }

  // ── App type (only upgrade if more specific) ──────────────────────────────
  if (update.appType && update.appType !== 'generic' && m.appType === 'generic') {
    m.appType = update.appType;
  }

  // ── Features ─────────────────────────────────────────────────────────────
  if (update.changeType === 'REMOVE_FEATURE' && update.removeFeatures?.length > 0) {
    const toRemove = new Set(update.removeFeatures);
    m.coreFeatures = m.coreFeatures.filter(f => !toRemove.has(f));
  } else if (update.features?.length > 0) {
    m.coreFeatures = _union(m.coreFeatures, update.features);
  }

  // ── Platforms ─────────────────────────────────────────────────────────────
  if (update.changeType === 'CHANGE_PLATFORM' && update.platforms?.length > 0) {
    // Explicit platform change replaces existing platforms
    m.platforms = [...update.platforms];
  } else if (update.platforms?.length > 0) {
    m.platforms = _union(m.platforms, update.platforms);
  }

  // ── Integrations ─────────────────────────────────────────────────────────
  if (update.integrations?.length > 0) {
    m.integrations = _union(m.integrations, update.integrations);
  }

  // ── Roles ─────────────────────────────────────────────────────────────────
  if (update.roles?.length > 0) {
    m.targetUsers = _union(m.targetUsers, update.roles);
    m.roles       = _union(m.roles, update.roles);
  }

  // ── Entities ─────────────────────────────────────────────────────────────
  if (update.entities?.length > 0) {
    m.databaseEntities = _union(m.databaseEntities, update.entities);
  }

  // ── Design intent ─────────────────────────────────────────────────────────
  if (update.designIntent) {
    m.designIntent = update.designIntent;
  }

  // ── Boolean flags (only set true; cleared by REMOVE_FEATURE explicitly) ──
  if (update.authRequired)    m.authRequired    = true;
  if (update.billingRequired) m.billingRequired = true;
  if (update.adminRequired)   m.adminRequired   = true;
  if (update.mobileRequired)  m.mobileRequired  = true;

  // Clear flags on explicit removal
  if (update.changeType === 'REMOVE_FEATURE') {
    if (update.removeFeatures?.includes('auth'))     m.authRequired    = false;
    if (update.removeFeatures?.includes('payments')) m.billingRequired = false;
    if (update.removeFeatures?.includes('admin'))    m.adminRequired   = false;
  }

  // ── Also derive flags from feature list ──────────────────────────────────
  m.authRequired    = m.authRequired    || m.coreFeatures.includes('auth');
  m.billingRequired = m.billingRequired || m.coreFeatures.includes('payments');
  m.adminRequired   = m.adminRequired   || m.coreFeatures.includes('admin') || m.coreFeatures.includes('dashboard');
  m.mobileRequired  = m.mobileRequired  || m.platforms.includes('mobile');

  // ── Metadata ─────────────────────────────────────────────────────────────
  m.promptCount     += 1;
  m.lastUpdated      = new Date().toISOString();
  m.lastPromptUpdate = rawPrompt;

  return m;
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _union(existing, incoming) {
  return [...new Set([...existing, ...incoming])];
}

function _clone(memory) {
  return {
    ...memory,
    coreFeatures:     [...memory.coreFeatures],
    platforms:        [...memory.platforms],
    targetUsers:      [...memory.targetUsers],
    roles:            [...memory.roles],
    integrations:     [...memory.integrations],
    databaseEntities: [...memory.databaseEntities],
    intentHistory:    [...memory.intentHistory],
  };
}

module.exports = { mergeIntent };
