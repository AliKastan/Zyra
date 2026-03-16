'use strict';

/**
 * Advanced AI Cost Optimizer — Public API
 *
 * Reduces AI token usage across the Zyra pipeline while preserving generation quality.
 *
 * Optimization strategies (16 total):
 *   1.  Prompt deduplication        — cache identical/near-identical LLM calls
 *   2.  Prompt compression          — remove filler, normalize whitespace
 *   3.  Context window pruning      — send only task-relevant context slices
 *   4.  Generation result caching   — reuse expensive stage outputs
 *   5.  Smart pass skipping         — skip stages when intent is unchanged
 *   6.  Token budget management     — per-stage limits per mode + complexity
 *   7.  Model tier selection        — cheapest capable model per task
 *   8.  File-level generation       — isolate context per file (lower cost)
 *   9.  Intent diff analysis        — detect what changed, regenerate only that
 *   10. Prompt token estimation     — estimate before sending; compress if over limit
 *   11. Pass cost tracking          — savings + actual spend per stage
 *   12. Adaptive pipeline depth     — simple prompts → shallow pipeline
 *   13. Result memoization          — deterministic tasks cached indefinitely
 *   14. Low-cost fallback mode      — switch to smaller models on budget overrun
 *   15. Context stub for large files — replace huge files with stubs in context
 *   16. Deduplication stats         — hit rate monitoring for tuning
 *
 * Runs:
 *   createOptimizerSession()  → returns a per-run optimizer handle
 *   All individual utilities are also exported for selective use
 */

const {
  estimatePromptTokens,
  compressPrompt,
  compressIfNeeded,
  truncateToTokenLimit,
} = require('./prompt-compression');

const {
  hashPrompt,
  getCachedResult:   getDedupResult,
  cacheResult:       cacheDedupResult,
  hasCachedResult:   hasDedupResult,
  clearCache:        clearDedupCache,
  getDeduplicationStats,
} = require('./prompt-deduplication');

const {
  pruneContextForTask,
  slicePromptByTask,
  estimateContextSize,
  pruneFileContext,
} = require('./context-pruning');

const {
  CacheManager,
  getCachedResult,
  setCachedResult,
  hasCachedResult,
  sharedCache,
} = require('./cache-manager');

const {
  shouldSkipPass,
  markPassComplete,
  isPassComplete,
  getPassOutput,
  resetPassTracker,
  getSkippableStages,
} = require('./pass-skipping');

const {
  getBudgetForStage,
  isWithinBudget,
  getTotalPipelineBudget,
  enforceTokenBudget,
  buildBudgetSummary,
} = require('./token-budget');

const {
  MODEL_TIERS,
  STAGE_TIER_MAP,
  selectModelForStage,
  selectModelForTask,
  getModelInfo,
  calculateModelSavings,
} = require('./model-selection');

const {
  computeIntentDiff,
  isIntentChanged,
  getAffectedStages,
  summarizeIntentDiff,
  GENERATIVE_FIELDS,
} = require('./intent-diff');

const {
  createPipelineCostTracker,
  recordOptimizationEvent,
  STAGE_BASELINE_TOKENS,
} = require('./cost-tracker');

// ── Primary factory ───────────────────────────────────────────────────────────

/**
 * Create an optimizer session for a single pipeline run.
 *
 * Returns a handle exposing all optimization strategies, pre-configured for
 * the given mode, complexity, and intent state.
 *
 * @param {Object} [opts]
 * @param {string} [opts.mode='balanced']           - Pipeline mode
 * @param {string} [opts.complexityLevel='medium']  - Complexity level
 * @param {Object} [opts.prevIntentMemory=null]     - Previous session IntentMemory
 * @param {Object} [opts.currentIntentMemory=null]  - This prompt's IntentMemory
 * @returns {OptimizerSession}
 */
function createOptimizerSession(opts = {}) {
  const {
    mode                 = 'balanced',
    complexityLevel      = 'medium',
    prevIntentMemory     = null,
    currentIntentMemory  = null,
  } = opts;

  const costTracker = createPipelineCostTracker();
  const intentDiff  = computeIntentDiff(prevIntentMemory, currentIntentMemory);

  return {
    mode,
    complexityLevel,
    intentDiff,

    // ── 1 & 2. Prompt estimation + compression ────────────────────────────
    estimateTokens:   (text)              => estimatePromptTokens(text),
    compress:         (text, opts2)       => compressPrompt(text, opts2),
    compressIfNeeded: (text, maxTok)      => compressIfNeeded(text, maxTok),
    truncate:         (text, maxTok)      => truncateToTokenLimit(text, maxTok),

    // ── 3. Context pruning ────────────────────────────────────────────────
    pruneContext:     (ctx, taskType)     => pruneContextForTask(ctx, taskType),
    slicePrompt:      (text, taskType)    => slicePromptByTask(text, taskType),
    pruneFiles:       (files, maxChars)   => pruneFileContext(files, maxChars),

    // ── 1. Prompt deduplication ───────────────────────────────────────────
    getCached:        (prompt, dedupOpts) => getDedupResult(prompt, dedupOpts),
    setCached:        (prompt, result, ttlMs) => cacheDedupResult(prompt, result, ttlMs),
    hasCached:        (prompt)            => hasDedupResult(prompt),

    // ── 4. Stage result cache ─────────────────────────────────────────────
    getStageCached:   (stage, inputs)     => getCachedResult(stage, inputs),
    setStageCached:   (stage, inputs, result, ttlMs) => setCachedResult(stage, inputs, result, ttlMs),
    hasStageCached:   (stage, inputs)     => hasCachedResult(stage, inputs),

    // ── 5. Pass skipping ─────────────────────────────────────────────────
    shouldSkip:       (stage, extraOpts)  => shouldSkipPass(stage, intentDiff, { mode, ...extraOpts }),
    markDone:         (stage, output)     => markPassComplete(stage, output),
    getStageOutput:   (stage)             => getPassOutput(stage),
    skippable:        (cached)            => getSkippableStages(mode, intentDiff, cached),

    // ── 6. Token budget ───────────────────────────────────────────────────
    budget:           (stage)             => getBudgetForStage(stage, mode, complexityLevel),
    withinBudget:     (tokens, stage)     => isWithinBudget(tokens, stage, mode, complexityLevel),
    enforceBudget:    (text, maxTok)      => enforceTokenBudget(text, maxTok),
    totalBudget:      ()                  => getTotalPipelineBudget(mode, complexityLevel),
    budgetSummary:    ()                  => buildBudgetSummary(mode, complexityLevel),

    // ── 7. Model tier selection ───────────────────────────────────────────
    selectModel:      (stage, extraOpts)  => selectModelForStage(stage, { mode, complexityLevel, ...extraOpts }),
    modelForTask:     (task)              => selectModelForTask(task, complexityLevel),
    modelSavings:     (stage, pTok, oTok, tier) => calculateModelSavings(stage, pTok, oTok, tier),

    // ── 9. Intent diff ────────────────────────────────────────────────────
    intentDiffSummary: ()                 => summarizeIntentDiff(intentDiff),
    affectedStages:    ()                 => getAffectedStages(intentDiff.changedFields),

    // ── 11. Cost tracking ─────────────────────────────────────────────────
    trackStage:       (stage, tokens, meta) => costTracker.trackStage(stage, tokens, meta),
    recordSavings:    (stage, saved, strategy) => costTracker.recordSavings(stage, saved, strategy),
    recordSkip:       (stage, reason)     => costTracker.recordSkip(stage, reason),
    buildCostReport:  ()                  => costTracker.buildCostReport(),
    savingsSoFar:     ()                  => costTracker.getSavingsSoFar(),
  };
}

/**
 * Build a UI-safe cost payload from a CostReport.
 *
 * @param {import('./types').CostReport | null} report
 * @returns {Object | null}
 */
function buildUiCostPayload(report) {
  if (!report) return null;
  return {
    totalTokens:       report.totalTokensUsed,
    estimatedCostUSD:  report.totalCostEstimate,
    savingsUSD:        report.optimizationSavings,
    savingsPercent:    report.savingsPercent,
    tokensSaved:       report.tokensSaved,
    strategiesApplied: report.strategiesApplied,
    stageBreakdown:    Object.fromEntries(
      Object.entries(report.costByStage || {}).map(([stage, data]) => [
        stage,
        { tokens: data.actualTokens, saved: data.savedTokens, skipped: data.skipped },
      ]),
    ),
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // Primary factory
  createOptimizerSession,
  buildUiCostPayload,

  // Prompt optimization
  estimatePromptTokens,
  compressPrompt,
  compressIfNeeded,
  truncateToTokenLimit,

  // Context pruning
  pruneContextForTask,
  slicePromptByTask,
  estimateContextSize,
  pruneFileContext,

  // Prompt deduplication
  hashPrompt,
  getDedupResult,
  cacheDedupResult,
  hasDedupResult,
  clearDedupCache,
  getDeduplicationStats,

  // Stage cache
  getCachedResult,
  setCachedResult,
  hasCachedResult,
  sharedCache,
  CacheManager,

  // Pass skipping
  shouldSkipPass,
  markPassComplete,
  isPassComplete,
  getPassOutput,
  resetPassTracker,
  getSkippableStages,

  // Token budget
  getBudgetForStage,
  isWithinBudget,
  getTotalPipelineBudget,
  enforceTokenBudget,
  buildBudgetSummary,

  // Model selection
  MODEL_TIERS,
  STAGE_TIER_MAP,
  selectModelForStage,
  selectModelForTask,
  getModelInfo,
  calculateModelSavings,

  // Intent diff
  computeIntentDiff,
  isIntentChanged,
  getAffectedStages,
  summarizeIntentDiff,
  GENERATIVE_FIELDS,

  // Cost tracking
  createPipelineCostTracker,
  recordOptimizationEvent,
  STAGE_BASELINE_TOKENS,
};
