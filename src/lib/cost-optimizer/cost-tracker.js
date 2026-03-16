'use strict';

/**
 * Pipeline Cost Tracker (Optimization Layer)
 *
 * Tracks token savings and actual usage across the optimization layer.
 * Complements src/utils/costTracker.js — that module records actual LLM
 * call costs; this module records what was SAVED through optimization:
 *
 *   - Prompt cache hits          (tokens that would have been spent)
 *   - Skipped passes             (entire stage cost avoided)
 *   - Prompt compression savings (tokens removed before sending)
 *   - Context pruning savings    (context that was never sent)
 *   - Model tier downgrade       (cost difference vs Sonnet baseline)
 *
 * Returns a CostReport at the end of a pipeline run.
 */

// Estimated output token cost per stage (Sonnet baseline, balanced mode)
// Used to estimate savings when a stage is skipped entirely.
const STAGE_BASELINE_TOKENS = {
  'normalization':     300,
  'intent-analysis':   800,
  'product-planning': 1500,
  'stack-planning':    600,
  'blueprint':        2000,
  'html-scaffold':    6000,
  'css-design':       4000,
  'js-core':          8000,
  'admin-ops':        3000,
  'billing':          2000,
  'polish':           1000,
  'design-system':     400,
  'content-extract':   300,
  'validation':          0,
  'repair':           4000,
  'ranking':             0,
  'complexity':          0,
};

// Sonnet pricing: $15 per 1M output tokens
const SONNET_OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a new pipeline cost tracker instance.
 * One instance per pipeline run.
 *
 * @returns {Object} PipelineCostTracker
 */
function createPipelineCostTracker() {
  // Map<stageName, { actualTokens, savedTokens, skipped, strategies[] }>
  const _stages = {};
  let _totalSaved  = 0;
  let _totalActual = 0;

  function _ensureStage(stage) {
    if (!_stages[stage]) {
      _stages[stage] = { actualTokens: 0, savedTokens: 0, skipped: false, strategies: [] };
    }
  }

  return {
    /**
     * Record tokens actually consumed at a stage.
     *
     * @param {string}   stage
     * @param {number}   tokens  - Actual tokens used (prompt + completion)
     * @param {Object}   [meta]
     * @param {string[]} [meta.strategies] - Optimization strategies applied at this stage
     */
    trackStage(stage, tokens, meta = {}) {
      _ensureStage(stage);
      _stages[stage].actualTokens += tokens;
      _totalActual += tokens;
      if (meta.strategies) _stages[stage].strategies.push(...meta.strategies);
    },

    /**
     * Record tokens saved at a stage via an optimization strategy.
     *
     * @param {string} stage
     * @param {number} tokensSaved
     * @param {string} strategy - Strategy name (e.g. 'prompt-compression', 'cache-hit')
     */
    recordSavings(stage, tokensSaved, strategy) {
      _ensureStage(stage);
      _stages[stage].savedTokens     += tokensSaved;
      _stages[stage].strategies.push(strategy);
      _totalSaved += tokensSaved;
    },

    /**
     * Record that a stage was skipped entirely.
     * Uses the baseline token estimate for savings.
     *
     * @param {string} stage
     * @param {string} reason
     */
    recordSkip(stage, reason) {
      _ensureStage(stage);
      const baseline = STAGE_BASELINE_TOKENS[stage] || 0;
      _stages[stage].skipped = true;
      _stages[stage].savedTokens += baseline;
      _stages[stage].strategies.push(`skip: ${reason}`);
      _totalSaved += baseline;
    },

    /**
     * Build the final CostReport.
     * @returns {import('./types').CostReport}
     */
    buildCostReport() {
      const costByStage = {};
      for (const [stage, data] of Object.entries(_stages)) {
        costByStage[stage] = {
          actualTokens:  data.actualTokens,
          savedTokens:   data.savedTokens,
          skipped:       data.skipped,
          strategies:    [...new Set(data.strategies)],
          estimatedCost: Math.round(data.actualTokens * SONNET_OUTPUT_COST_PER_TOKEN * 1_000_000) / 1_000_000,
        };
      }

      const totalCostEstimate   = _totalActual * SONNET_OUTPUT_COST_PER_TOKEN;
      const optimizationSavings = _totalSaved  * SONNET_OUTPUT_COST_PER_TOKEN;
      const withoutOptimization = (_totalActual + _totalSaved) || 1;

      const strategiesApplied = [...new Set(
        Object.values(_stages).flatMap(s => s.strategies),
      )];

      return {
        totalTokensUsed:     _totalActual,
        totalCostEstimate:   Math.round(totalCostEstimate   * 1_000_000) / 1_000_000,
        costByStage,
        optimizationSavings: Math.round(optimizationSavings * 1_000_000) / 1_000_000,
        tokensSaved:         _totalSaved,
        savingsPercent:      Math.round((_totalSaved / withoutOptimization) * 100),
        strategiesApplied,
      };
    },

    /**
     * Mid-pipeline savings snapshot.
     * @returns {{ totalSaved: number, totalActual: number }}
     */
    getSavingsSoFar() {
      return { totalSaved: _totalSaved, totalActual: _totalActual };
    },
  };
}

/**
 * Bridge: record an optimization event on an existing base cost tracker
 * (from src/utils/costTracker.js) so it appears in the job-level cost record.
 *
 * @param {Object} baseCostTracker - Existing costTracker instance
 * @param {string} stage
 * @param {string} description
 */
function recordOptimizationEvent(baseCostTracker, stage, description) {
  if (baseCostTracker && typeof baseCostTracker.recordLocal === 'function') {
    baseCostTracker.recordLocal(stage, description);
  }
}

module.exports = {
  createPipelineCostTracker,
  recordOptimizationEvent,
  STAGE_BASELINE_TOKENS,
};
