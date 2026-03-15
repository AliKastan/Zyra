'use strict';

/**
 * Map complexity tier to generation strategy recommendations.
 *
 * @param {import('./types').ComplexityTier} tier
 * @param {number} score
 * @returns {import('./types').GenerationStrategyRecommendation}
 */
function recommendStrategy(tier, score) {
  const strategies = {
    simple: {
      planningDepth:      'light',
      blueprintDepth:     'minimal',
      generationMode:     'compact',
      validationDepth:    'basic',
      repairMode:         'light',
      suggestedMaxFiles:  6,
      suggestedTokenBudget: 6000,
    },
    medium: {
      planningDepth:      'standard',
      blueprintDepth:     'normal',
      generationMode:     'structured',
      validationDepth:    'standard',
      repairMode:         'standard',
      suggestedMaxFiles:  14,
      suggestedTokenBudget: 16000,
    },
    advanced: {
      planningDepth:      'deep',
      blueprintDepth:     'full',
      generationMode:     'multi_pass',
      validationDepth:    'strong',
      repairMode:         'comprehensive',
      suggestedMaxFiles:  22,
      suggestedTokenBudget: 28000,
    },
    production_heavy: {
      planningDepth:      'very_deep',
      blueprintDepth:     'exhaustive',
      generationMode:     'segmented_multi_pass',
      validationDepth:    'strict',
      repairMode:         'aggressive_safe_completion',
      suggestedMaxFiles:  30,
      suggestedTokenBudget: 36000,
    },
  };

  return strategies[tier] || strategies.medium;
}

module.exports = { recommendStrategy };
