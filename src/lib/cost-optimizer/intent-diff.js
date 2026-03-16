'use strict';

/**
 * Intent Diff Analysis
 *
 * Computes the semantic difference between two IntentMemory snapshots.
 * The result drives smart pass skipping: only stages whose inputs changed
 * need to re-run.
 *
 * Compares only fields that affect generation output — tracking fields
 * (promptCount, history, updatedAt) are intentionally ignored.
 */

// Fields that semantically affect what gets generated
const GENERATIVE_FIELDS = [
  'appType',
  'appGoal',
  'coreFeatures',
  'designIntent',
  'platforms',
  'authRequired',
  'billingRequired',
  'adminRequired',
  'userRoles',
  'entities',
  'integrations',
  'changeType',
];

// Which pipeline stages each intent field affects
const STAGE_FIELD_MAP = {
  'intent-analysis':   ['appType', 'appGoal', 'changeType'],
  'product-planning':  ['coreFeatures', 'entities', 'userRoles', 'authRequired', 'billingRequired'],
  'stack-planning':    ['appType', 'platforms', 'integrations'],
  'blueprint':         ['designIntent', 'coreFeatures', 'platforms'],
  'html-scaffold':     ['coreFeatures', 'authRequired', 'adminRequired'],
  'css-design':        ['designIntent'],
  'js-core':           ['coreFeatures', 'authRequired', 'billingRequired', 'integrations'],
  'admin-ops':         ['adminRequired'],
  'billing':           ['billingRequired'],
  'design-system':     ['designIntent'],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute the diff between two IntentMemory objects.
 *
 * @param {Object | null} prev    - Previous IntentMemory (null if first prompt)
 * @param {Object | null} current - Current IntentMemory
 * @returns {import('./types').IntentDiff}
 */
function computeIntentDiff(prev, current) {
  // First-ever prompt: everything is "new"
  if (!prev) {
    return {
      changedFields:   current ? GENERATIVE_FIELDS.slice() : [],
      addedFeatures:   current?.coreFeatures ? [...current.coreFeatures] : [],
      removedFeatures: [],
      platformChanged: false,
      designChanged:   false,
      authChanged:     false,
      billingChanged:  false,
      isFirstPrompt:   true,
      affectedStages:  Object.keys(STAGE_FIELD_MAP),
    };
  }

  if (!current) {
    return {
      changedFields:   [],
      addedFeatures:   [],
      removedFeatures: [],
      platformChanged: false,
      designChanged:   false,
      authChanged:     false,
      billingChanged:  false,
      isFirstPrompt:   false,
      affectedStages:  [],
    };
  }

  // Detect changed generative fields
  const changedFields = GENERATIVE_FIELDS.filter(
    field => !_deepEqual(prev[field], current[field]),
  );

  // Feature-level delta
  const prevFeatures = new Set(prev.coreFeatures  || []);
  const currFeatures = new Set(current.coreFeatures || []);
  const addedFeatures   = [...currFeatures].filter(f => !prevFeatures.has(f));
  const removedFeatures = [...prevFeatures].filter(f => !currFeatures.has(f));

  const platformChanged = !_deepEqual(prev.platforms,       current.platforms);
  const designChanged   = prev.designIntent  !== current.designIntent;
  const authChanged     = prev.authRequired  !== current.authRequired;
  const billingChanged  = prev.billingRequired !== current.billingRequired;

  return {
    changedFields,
    addedFeatures,
    removedFeatures,
    platformChanged,
    designChanged,
    authChanged,
    billingChanged,
    isFirstPrompt:  false,
    affectedStages: _getAffectedStages(changedFields),
  };
}

/**
 * Quick boolean check: did the intent change in any meaningful way?
 *
 * @param {Object | null} prev
 * @param {Object | null} current
 * @returns {boolean}
 */
function isIntentChanged(prev, current) {
  return computeIntentDiff(prev, current).changedFields.length > 0;
}

/**
 * Given a list of changed fields, return the affected pipeline stages.
 *
 * @param {string[]} changedFields
 * @returns {string[]}
 */
function getAffectedStages(changedFields) {
  return _getAffectedStages(changedFields);
}

/**
 * Human-readable summary of an intent diff.
 *
 * @param {import('./types').IntentDiff} diff
 * @returns {string}
 */
function summarizeIntentDiff(diff) {
  if (!diff || diff.changedFields.length === 0) return 'No intent changes detected';

  const parts = [];
  if (diff.addedFeatures.length > 0)   parts.push(`+features: ${diff.addedFeatures.join(', ')}`);
  if (diff.removedFeatures.length > 0) parts.push(`-features: ${diff.removedFeatures.join(', ')}`);
  if (diff.designChanged)   parts.push('design changed');
  if (diff.authChanged)     parts.push('auth changed');
  if (diff.billingChanged)  parts.push('billing changed');
  if (diff.platformChanged) parts.push('platform changed');

  return parts.join('; ') || diff.changedFields.join(', ');
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((v, i) => v === sb[i]);
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length) return false;
    return ka.every(k => _deepEqual(a[k], b[k]));
  }
  return false;
}

function _getAffectedStages(changedFields) {
  const affected = new Set();
  for (const [stage, fields] of Object.entries(STAGE_FIELD_MAP)) {
    if (fields.some(f => changedFields.includes(f))) affected.add(stage);
  }
  return [...affected];
}

module.exports = {
  computeIntentDiff,
  isIntentChanged,
  getAffectedStages,
  summarizeIntentDiff,
  GENERATIVE_FIELDS,
  STAGE_FIELD_MAP,
};
