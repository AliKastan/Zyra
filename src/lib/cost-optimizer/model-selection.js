'use strict';

/**
 * Model Tier Selection
 *
 * Automatically selects the cheapest model capable of handling each task.
 * Avoids using the largest (most expensive) model for work a smaller model can do.
 *
 * Tiers:
 *   small  → claude-haiku-4-5-20251001  ($0.80/1M input,  $4/1M output)
 *   medium → claude-sonnet-4-6          ($3/1M input,    $15/1M output)
 *   large  → claude-opus-4-6            ($15/1M input,   $75/1M output)
 *
 * Principle:
 *   - Normalization, extraction, classification → small (structured I/O, low creativity needed)
 *   - Planning, blueprint, code generation → medium (requires reasoning + long output)
 *   - Complex multi-system integration → medium/large (quality mode only)
 */

const MODEL_TIERS = {
  small: {
    id:              'claude-haiku-4-5-20251001',
    name:            'Haiku',
    inputCostPer1M:  0.80,
    outputCostPer1M: 4.00,
    maxContextTokens: 200_000,
  },
  medium: {
    id:              'claude-sonnet-4-6',
    name:            'Sonnet',
    inputCostPer1M:  3.00,
    outputCostPer1M: 15.00,
    maxContextTokens: 200_000,
  },
  large: {
    id:              'claude-opus-4-6',
    name:            'Opus',
    inputCostPer1M:  15.00,
    outputCostPer1M: 75.00,
    maxContextTokens: 200_000,
  },
};

// Default tier per pipeline stage
const STAGE_TIER_MAP = {
  'normalization':    'small',
  'complexity':       'small',    // local computation — no LLM
  'content-extract':  'small',
  'intent-analysis':  'small',    // structured extraction
  'design-system':    'small',    // rule-based lookup
  'product-planning': 'medium',
  'stack-planning':   'medium',
  'blueprint':        'medium',
  'html-scaffold':    'medium',
  'css-design':       'medium',
  'js-core':          'medium',
  'admin-ops':        'medium',
  'billing':          'medium',
  'polish':           'medium',
  'repair':           'medium',
  'validation':       'small',    // static — no LLM
  'ranking':          'small',    // static — no LLM
};

// Minimum tier per complexity level (floor)
const COMPLEXITY_TIER_FLOOR = {
  simple:  'small',
  medium:  'small',
  complex: 'medium',
};

const TIER_ORDER = ['small', 'medium', 'large'];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Select the optimal model tier for a pipeline stage.
 *
 * @param {string} stage
 * @param {Object} [opts]
 * @param {string} [opts.complexityLevel='medium']
 * @param {string} [opts.mode='balanced']
 * @param {boolean} [opts.forceQuality=false]
 * @returns {{ tier: string, modelId: string, modelName: string, rationale: string }}
 */
function selectModelForStage(stage, opts = {}) {
  const { complexityLevel = 'medium', mode = 'balanced', forceQuality = false } = opts;

  // Quality mode: minimum medium for all LLM stages
  if (forceQuality || mode === 'quality') {
    const base = STAGE_TIER_MAP[stage] || 'medium';
    const tier = _atLeast(base, 'medium');
    return _result(tier, `quality mode — minimum medium tier`);
  }

  // Fast mode: code-generation stages stay medium; everything else uses small
  if (mode === 'fast') {
    const codeStages = new Set(['html-scaffold', 'css-design', 'js-core', 'repair', 'blueprint']);
    const tier = codeStages.has(stage) ? 'medium' : 'small';
    return _result(tier, `fast mode — ${tier} for ${stage}`);
  }

  // Balanced: use stage map, apply complexity floor
  const base  = STAGE_TIER_MAP[stage] || 'medium';
  const floor = COMPLEXITY_TIER_FLOOR[complexityLevel] || 'small';
  const tier  = _atLeast(base, floor);
  return _result(tier, `${stage} → ${tier} (complexity: ${complexityLevel})`);
}

/**
 * Select a model ID for a free-form task description.
 *
 * @param {string} taskType
 * @param {string} [complexityLevel='medium']
 * @returns {string} model ID
 */
function selectModelForTask(taskType, complexityLevel = 'medium') {
  const lower = (taskType || '').toLowerCase();

  if (/generat|code|html|css|javascript|scaffold|blueprint|plan/i.test(lower)) {
    return MODEL_TIERS.medium.id;
  }
  if (/normaliz|extract|classif|analyz|rank|validat|complexit|intent|design.?system/i.test(lower)) {
    return complexityLevel === 'complex' ? MODEL_TIERS.medium.id : MODEL_TIERS.small.id;
  }

  return MODEL_TIERS.medium.id;
}

/**
 * Get the full model info object for a tier.
 * @param {string} tier  'small' | 'medium' | 'large'
 * @returns {Object}
 */
function getModelInfo(tier) {
  return MODEL_TIERS[tier] || MODEL_TIERS.medium;
}

/**
 * Estimate savings from using a smaller model instead of the medium (Sonnet) default.
 *
 * @param {string} stage
 * @param {number} promptTokens
 * @param {number} outputTokens
 * @param {string} [recommendedTier]
 * @returns {{ savings: number, savingsPercent: number, recommendedModel: string, defaultModel: string }}
 */
function calculateModelSavings(stage, promptTokens, outputTokens, recommendedTier) {
  const defaultModel  = MODEL_TIERS.medium;
  const recommended   = MODEL_TIERS[recommendedTier] || defaultModel;

  const defaultCost     = (promptTokens  / 1_000_000 * defaultModel.inputCostPer1M) +
                          (outputTokens  / 1_000_000 * defaultModel.outputCostPer1M);
  const recommendedCost = (promptTokens  / 1_000_000 * recommended.inputCostPer1M) +
                          (outputTokens  / 1_000_000 * recommended.outputCostPer1M);

  const savings = Math.max(0, defaultCost - recommendedCost);
  return {
    savings:          Math.round(savings * 1_000_000) / 1_000_000,
    savingsPercent:   defaultCost > 0 ? Math.round((savings / defaultCost) * 100) : 0,
    recommendedModel: recommended.id,
    defaultModel:     defaultModel.id,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _atLeast(current, floor) {
  return TIER_ORDER.indexOf(current) >= TIER_ORDER.indexOf(floor) ? current : floor;
}

function _result(tier, rationale) {
  const model = MODEL_TIERS[tier] || MODEL_TIERS.medium;
  return { tier, modelId: model.id, modelName: model.name, rationale };
}

module.exports = {
  MODEL_TIERS,
  STAGE_TIER_MAP,
  COMPLEXITY_TIER_FLOOR,
  selectModelForStage,
  selectModelForTask,
  getModelInfo,
  calculateModelSavings,
};
