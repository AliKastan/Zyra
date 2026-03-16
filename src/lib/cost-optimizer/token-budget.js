'use strict';

/**
 * Token Budget Management
 *
 * Assigns per-stage token budgets based on pipeline mode and project complexity.
 * Prevents expensive models from consuming unnecessary output tokens.
 *
 * Budgets represent maximum completion (output) tokens per stage.
 * Prompt limits are enforced separately by prompt-compression.js.
 */

// Max output tokens per stage per mode
const STAGE_BUDGETS = {
  fast: {
    'intent-analysis':   400,
    'product-planning':  600,
    'stack-planning':    300,
    'blueprint':         800,
    'html-scaffold':    3000,
    'css-design':       1500,
    'js-core':          3500,
    'admin-ops':           0,    // skipped in fast mode
    'billing':             0,    // skipped in fast mode
    'polish':              0,    // skipped in fast mode
    'design-system':     200,
    'content-extract':   200,
    'normalization':     300,
    'validation':          0,    // static — no LLM
    'repair':           2000,
    'ranking':             0,    // static — no LLM
    'complexity':          0,    // static — no LLM
  },
  balanced: {
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
    'design-system':    400,
    'content-extract':  300,
    'normalization':    400,
    'validation':          0,
    'repair':           4000,
    'ranking':             0,
    'complexity':          0,
  },
  quality: {
    'intent-analysis':  1200,
    'product-planning': 2500,
    'stack-planning':    900,
    'blueprint':        4000,
    'html-scaffold':   10000,
    'css-design':       7000,
    'js-core':         14000,
    'admin-ops':        5000,
    'billing':          3500,
    'polish':           2000,
    'design-system':    600,
    'content-extract':  400,
    'normalization':    600,
    'validation':          0,
    'repair':           8000,
    'ranking':             0,
    'complexity':          0,
  },
};

// Complexity multipliers — scale up budgets for complex projects
const COMPLEXITY_MULTIPLIERS = {
  simple:  0.6,
  medium:  1.0,
  complex: 1.4,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the token budget for a pipeline stage.
 *
 * @param {string} stage
 * @param {string} [mode='balanced']
 * @param {string} [complexityLevel='medium']
 * @returns {{ maxOutputTokens: number, scaledTokens: number }}
 */
function getBudgetForStage(stage, mode = 'balanced', complexityLevel = 'medium') {
  const modeBudgets  = STAGE_BUDGETS[mode] || STAGE_BUDGETS.balanced;
  const base         = modeBudgets[stage] ?? 4000;
  const multiplier   = COMPLEXITY_MULTIPLIERS[complexityLevel] ?? 1.0;
  return {
    maxOutputTokens: base,
    scaledTokens:    Math.round(base * multiplier),
  };
}

/**
 * Check whether a token count is within budget for a stage.
 *
 * @param {number} tokens
 * @param {string} stage
 * @param {string} [mode='balanced']
 * @param {string} [complexityLevel='medium']
 * @returns {boolean}
 */
function isWithinBudget(tokens, stage, mode = 'balanced', complexityLevel = 'medium') {
  const { scaledTokens } = getBudgetForStage(stage, mode, complexityLevel);
  return scaledTokens === 0 || tokens <= scaledTokens;
}

/**
 * Total token budget across all stages for a full pipeline run.
 *
 * @param {string} [mode='balanced']
 * @param {string} [complexityLevel='medium']
 * @returns {number}
 */
function getTotalPipelineBudget(mode = 'balanced', complexityLevel = 'medium') {
  const modeBudgets = STAGE_BUDGETS[mode] || STAGE_BUDGETS.balanced;
  const multiplier  = COMPLEXITY_MULTIPLIERS[complexityLevel] ?? 1.0;
  return Math.round(Object.values(modeBudgets).reduce((s, v) => s + v, 0) * multiplier);
}

/**
 * Truncate text to stay within a token limit.
 * Appends a truncation notice.
 *
 * @param {string} text
 * @param {number} maxTokens
 * @returns {{ text: string, wasTruncated: boolean, originalTokens: number }}
 */
function enforceTokenBudget(text, maxTokens) {
  if (!text || maxTokens <= 0) return { text: text || '', wasTruncated: false, originalTokens: 0 };
  const originalTokens = Math.ceil((text || '').length / 4);
  if (originalTokens <= maxTokens) return { text, wasTruncated: false, originalTokens };
  const maxChars  = maxTokens * 4;
  const truncated = text.slice(0, maxChars).replace(/\s+\S*$/, '') + '\n[truncated]';
  return { text: truncated, wasTruncated: true, originalTokens };
}

/**
 * Build a full budget summary for all stages in a pipeline run.
 *
 * @param {string} mode
 * @param {string} complexityLevel
 * @returns {Object.<string, number>}
 */
function buildBudgetSummary(mode, complexityLevel) {
  const modeBudgets = STAGE_BUDGETS[mode] || STAGE_BUDGETS.balanced;
  const multiplier  = COMPLEXITY_MULTIPLIERS[complexityLevel] ?? 1.0;
  const summary     = {};
  for (const [stage, base] of Object.entries(modeBudgets)) {
    summary[stage] = Math.round(base * multiplier);
  }
  return summary;
}

module.exports = {
  STAGE_BUDGETS,
  COMPLEXITY_MULTIPLIERS,
  getBudgetForStage,
  isWithinBudget,
  getTotalPipelineBudget,
  enforceTokenBudget,
  buildBudgetSummary,
};
