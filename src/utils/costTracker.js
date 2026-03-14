/**
 * Per-job token and cost tracking with tier/context observability.
 *
 * Estimates only — actual billing depends on the provider.
 * Uses per-model pricing; defaults to Sonnet if model unknown.
 */

// Pricing per million tokens (USD) — updated to reflect actual model tiers used
const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0  },
  'claude-sonnet-4-6':         { input: 3.0,  output: 15.0 },
  'claude-opus-4-6':           { input: 15.0, output: 75.0 },
};
const DEFAULT_PRICING = MODEL_PRICING['claude-sonnet-4-6']; // most common model

function estimateTokens(str) {
  if (!str || typeof str !== 'string') return 0;
  return Math.ceil(str.length / 4);
}

function createCostTracker() {
  const calls = [];
  let localTransforms = 0;
  let totalContextChars = 0;

  return {
    /**
     * Record a model call.
     * @param {string} stage  - 'planner' | 'coder' | 'coder-retry' | 'reviewer' | 'edit-coder' | 'content-extract'
     * @param {string} systemPrompt
     * @param {string} userPrompt
     * @param {string} response
     * @param {object} [meta]  - optional { tier, contextChars, filesInContext, model }
     */
    record(stage, systemPrompt, userPrompt, response, meta = {}) {
      const promptTokens     = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
      const completionTokens = estimateTokens(response);
      if (meta.contextChars) totalContextChars += meta.contextChars;
      const pricing  = MODEL_PRICING[meta.model] || DEFAULT_PRICING;
      const stageCost =
        (promptTokens     / 1_000_000) * pricing.input +
        (completionTokens / 1_000_000) * pricing.output;
      calls.push({ stage, promptTokens, completionTokens, model: meta.model || 'sonnet', stageCostUSD: parseFloat(stageCost.toFixed(5)), ...meta });
    },

    /**
     * Record a zero-cost local transform (no model call).
     * @param {string} stage
     * @param {string} description
     */
    recordLocal(stage, description) {
      localTransforms++;
      calls.push({ stage, promptTokens: 0, completionTokens: 0, local: true, description });
    },

    summary() {
      let totalPrompt = 0, totalCompletion = 0, estimatedCostUSD = 0;
      for (const c of calls) {
        totalPrompt        += c.promptTokens;
        totalCompletion    += c.completionTokens;
        estimatedCostUSD   += c.stageCostUSD || 0;
      }
      const totalTokens = totalPrompt + totalCompletion;

      return {
        calls:             calls.length,
        promptTokens:      totalPrompt,
        completionTokens:  totalCompletion,
        totalTokens,
        estimatedCostUSD:  parseFloat(estimatedCostUSD.toFixed(5)),
        localTransforms,
        totalContextChars,
        breakdown:         calls,
      };
    },
  };
}

module.exports = { createCostTracker, estimateTokens };
