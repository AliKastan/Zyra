'use strict';

/**
 * Cost Optimizer — Type Definitions (JSDoc)
 *
 * @module cost-optimizer/types
 */

/**
 * @typedef {Object} TokenBudget
 * @property {number} maxOutputTokens   - Maximum completion tokens for the stage
 * @property {number} scaledTokens      - Budget after complexity multiplier applied
 * @property {string} recommendedModel  - Suggested model ID
 * @property {string} tier              - 'small' | 'medium' | 'large'
 */

/**
 * @typedef {Object} CostReport
 * @property {number} totalTokensUsed
 * @property {number} totalCostEstimate       - USD
 * @property {Object.<string,StageCost>} costByStage
 * @property {number} optimizationSavings     - USD saved vs unoptimized baseline
 * @property {number} tokensSaved
 * @property {number} savingsPercent          - 0–100
 * @property {string[]} strategiesApplied
 */

/**
 * @typedef {Object} StageCost
 * @property {number} actualTokens
 * @property {number} savedTokens
 * @property {boolean} skipped
 * @property {string[]} strategies
 * @property {number} estimatedCost  - USD
 */

/**
 * @typedef {Object} OptimizationStrategy
 * @property {string}  name
 * @property {boolean} applied
 * @property {number}  tokensSaved
 * @property {string}  description
 */

/**
 * @typedef {Object} PipelineCostStats
 * @property {number} totalCalls
 * @property {number} totalTokens
 * @property {number} cachedHits
 * @property {number} skippedPasses
 * @property {number} compressedPrompts
 * @property {number} tokensSaved
 * @property {Object.<string,number>} costByStage
 */

/**
 * @typedef {Object} IntentDiff
 * @property {string[]} changedFields    - Fields that changed vs previous intent
 * @property {string[]} addedFeatures
 * @property {string[]} removedFeatures
 * @property {boolean}  platformChanged
 * @property {boolean}  designChanged
 * @property {boolean}  authChanged
 * @property {boolean}  billingChanged
 * @property {boolean}  isFirstPrompt
 * @property {string[]} affectedStages   - Pipeline stages that need to re-run
 */

/**
 * @typedef {Object} ModelTierResult
 * @property {string} tier       - 'small' | 'medium' | 'large'
 * @property {string} modelId
 * @property {string} modelName
 * @property {string} rationale
 */

module.exports = {};
