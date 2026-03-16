'use strict';

/**
 * Smart Pass Skipping
 *
 * Determines whether a pipeline stage can safely be skipped, based on:
 *   1. Whether a cached output from a previous run exists
 *   2. Whether the intent diff shows any change relevant to this stage
 *   3. Pipeline mode (fast mode skips non-core stages)
 *
 * Stage sensitivity defines which IntentMemory fields matter for each stage.
 * If none of those fields changed, and a cached output exists, the stage is skippable.
 */

// Which IntentMemory fields affect each pipeline stage.
// Stages with an empty array use their own "always run" logic.
const STAGE_SENSITIVITY = {
  'intent-analysis':   ['appType', 'appGoal', 'changeType'],
  'product-planning':  ['coreFeatures', 'entities', 'userRoles', 'authRequired', 'billingRequired'],
  'stack-planning':    ['appType', 'platforms', 'integrations'],
  'blueprint':         ['designIntent', 'coreFeatures', 'platforms'],
  'html-scaffold':     ['coreFeatures', 'authRequired', 'adminRequired'],
  'css-design':        ['designIntent'],
  'js-core':           ['coreFeatures', 'authRequired', 'billingRequired', 'integrations'],
  'admin-ops':         ['adminRequired'],
  'billing':           ['billingRequired'],
  'polish':            ['appGoal'],
  'design-system':     ['designIntent'],
  'normalization':     ['appType', 'appGoal'],
  'validation':        [],   // always run
  'repair':            [],   // always run when issues found
  'ranking':           [],   // always run
};

// Stages that are always executed regardless of cache or intent
const ALWAYS_RUN = new Set(['validation', 'repair', 'ranking']);

// Core stages kept alive in fast mode (all others are skipped if cached)
const FAST_MODE_CORE = new Set(['intent-analysis', 'html-scaffold', 'css-design', 'js-core']);

// In-memory pass completion record for the current pipeline run
// Map<stageName, { completedAt, output, inputHash }>
const _completedPasses = new Map();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Decide whether a pipeline stage should be skipped.
 *
 * @param {string} stageName
 * @param {import('./intent-diff').IntentDiff | null} intentDiff
 * @param {Object} [opts]
 * @param {boolean} [opts.hasCached=false]   - Whether a valid cached output exists
 * @param {string}  [opts.mode='balanced']   - Pipeline mode
 * @returns {{ skip: boolean, reason: string }}
 */
function shouldSkipPass(stageName, intentDiff, opts = {}) {
  const { hasCached = false, mode = 'balanced' } = opts;

  // Mandatory stages: always run
  if (ALWAYS_RUN.has(stageName)) {
    return { skip: false, reason: 'stage is mandatory' };
  }

  // Can't skip without a cached output to fall back on
  if (!hasCached) {
    return { skip: false, reason: 'no cached output available' };
  }

  // Fast mode: skip anything outside the core set if cached
  if (mode === 'fast' && !FAST_MODE_CORE.has(stageName)) {
    return { skip: true, reason: 'fast mode: non-core stage skipped (cached)' };
  }

  // No intent diff → nothing changed → safe to skip
  if (!intentDiff || intentDiff.changedFields.length === 0) {
    return { skip: true, reason: 'intent unchanged — cached output reused' };
  }

  // Check whether any changed field is relevant to this stage
  const sensitiveFields = STAGE_SENSITIVITY[stageName] || [];
  const relevantChange  = intentDiff.changedFields.some(f => sensitiveFields.includes(f));

  if (!relevantChange) {
    return { skip: true, reason: `intent changed but not in fields that affect ${stageName}` };
  }

  return { skip: false, reason: `intent changed in fields that affect ${stageName}` };
}

/**
 * Record that a pass completed successfully.
 * @param {string} stageName
 * @param {*}      output
 * @param {string} [inputHash]
 */
function markPassComplete(stageName, output, inputHash = '') {
  _completedPasses.set(stageName, {
    completedAt: Date.now(),
    output,
    inputHash,
  });
}

/**
 * Check if a stage has already been completed in this run.
 * @param {string} stageName
 * @returns {boolean}
 */
function isPassComplete(stageName) {
  return _completedPasses.has(stageName);
}

/**
 * Retrieve the output of a completed stage.
 * @param {string} stageName
 * @returns {* | null}
 */
function getPassOutput(stageName) {
  return _completedPasses.get(stageName)?.output ?? null;
}

/**
 * Clear all pass completion records (call between pipeline runs).
 */
function resetPassTracker() {
  _completedPasses.clear();
}

/**
 * List all stages that could be skipped given a mode, intent diff, and available cache.
 *
 * @param {string}   mode
 * @param {import('./intent-diff').IntentDiff | null} intentDiff
 * @param {string[]} cachedStages - Stage names for which cached outputs exist
 * @returns {string[]}
 */
function getSkippableStages(mode, intentDiff, cachedStages = []) {
  const cachedSet = new Set(cachedStages);
  return Object.keys(STAGE_SENSITIVITY).filter(stage => {
    const { skip } = shouldSkipPass(stage, intentDiff, {
      hasCached: cachedSet.has(stage),
      mode,
    });
    return skip;
  });
}

module.exports = {
  shouldSkipPass,
  markPassComplete,
  isPassComplete,
  getPassOutput,
  resetPassTracker,
  getSkippableStages,
  STAGE_SENSITIVITY,
  ALWAYS_RUN,
  FAST_MODE_CORE,
};
