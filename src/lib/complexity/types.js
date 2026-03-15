'use strict';

/**
 * @typedef {'simple'|'medium'|'advanced'|'production_heavy'} ComplexityTier
 */

/**
 * @typedef {Object} ComplexityDimensionBreakdown
 * @property {number} productScope   - 0-20
 * @property {number} platform       - 0-8
 * @property {number} dataBackend    - 0-14
 * @property {number} rolesPermissions - 0-12
 * @property {number} integrations   - 0-14
 * @property {number} operations     - 0-10
 * @property {number} deployment     - 0-12
 */

/**
 * @typedef {Object} ComplexitySignals
 * @property {number} featureCount
 * @property {number} inferredFlowCount
 * @property {number} entityCount
 * @property {number} roleCount
 * @property {number} integrationCount
 * @property {number} platformCount
 * @property {boolean} hasAuth
 * @property {boolean} hasPayments
 * @property {boolean} hasAI
 * @property {boolean} hasAdmin
 * @property {boolean} hasAnalytics
 * @property {boolean} hasRealTime
 * @property {boolean} hasBackgroundJobs
 * @property {boolean} hasMobile
 */

/**
 * @typedef {Object} GenerationStrategyRecommendation
 * @property {'light'|'standard'|'deep'|'very_deep'} planningDepth
 * @property {'minimal'|'normal'|'full'|'exhaustive'} blueprintDepth
 * @property {'compact'|'structured'|'multi_pass'|'segmented_multi_pass'} generationMode
 * @property {'basic'|'standard'|'strong'|'strict'} validationDepth
 * @property {'light'|'standard'|'comprehensive'|'aggressive_safe_completion'} repairMode
 * @property {number} suggestedMaxFiles
 * @property {number} suggestedTokenBudget
 */

/**
 * @typedef {Object} DimensionResult
 * @property {number}   score
 * @property {number}   max
 * @property {string[]} reasons
 * @property {Object}   signals
 */

/**
 * @typedef {Object} AppComplexityReport
 * @property {number}                         totalScore
 * @property {ComplexityTier}                 complexityTier
 * @property {number}                         confidence      - 0-1
 * @property {ComplexityDimensionBreakdown}   dimensionBreakdown
 * @property {string[]}                       reasons         - human-readable explanations
 * @property {ComplexitySignals}              signals
 * @property {GenerationStrategyRecommendation} recommendedStrategy
 * @property {boolean}                        llmRefined
 */

/**
 * @typedef {Object} ScoredAppSpec
 * @property {import('../../generation/types').GenerationIntent} intent  - enriched intent
 * @property {AppComplexityReport} complexityReport
 */

/**
 * @typedef {Object} ScoringContext
 * @property {import('../../generation/types').GenerationIntent} intent
 * @property {import('../inference/types').InferenceReport|null} inferenceReport
 * @property {Array}  features
 * @property {Array}  flows
 * @property {Array}  entities
 * @property {Array}  roles
 * @property {Array}  integrations
 * @property {string} domain
 * @property {string} allText  - lowercased concat of all spec text for keyword matching
 */

module.exports = {};
