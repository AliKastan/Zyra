'use strict';

/**
 * @typedef {'booking'|'marketplace'|'saas'|'restaurant'|'fitness'|'ecommerce'|'ai_tool'|'dashboard'|'social'|'landing_page'|'generic'} Domain
 */

/**
 * @typedef {'critical_missing'|'likely_needed'|'helpful_optional'|'domain_specific'} InferenceClass
 */

/**
 * @typedef {'must'|'should'|'could'} MvpTier
 */

/**
 * @typedef {'feature'|'flow'|'role'|'entity'|'integration'} InferenceCategory
 */

/**
 * @typedef {Object} InferredRequirement
 * @property {string}           id          - stable slug (e.g. 'auth_login')
 * @property {InferenceCategory} category
 * @property {string}           name        - short human name
 * @property {string}           description - why this is needed
 * @property {string}           rationale   - why inferred (e.g. 'booking apps need confirmation emails')
 * @property {InferenceClass}   classification
 * @property {MvpTier}          mvpTier
 * @property {boolean}          alreadyPresent - true if found in intent
 */

/**
 * @typedef {Object} InferenceContext
 * @property {import('../../generation/types').GenerationIntent} intent
 * @property {Domain}   domain
 * @property {string[]} detectedKeywords
 */

/**
 * @typedef {Object} InferenceReport
 * @property {Domain}                domain
 * @property {string[]}              detectedKeywords
 * @property {InferredRequirement[]} requirements  - ALL requirements (present + missing)
 * @property {InferredRequirement[]} missing       - requirements not already in intent
 * @property {InferredRequirement[]} critical      - classification === 'critical_missing' && !alreadyPresent
 * @property {InferredRequirement[]} mvpAdditions  - missing requirements where mvpTier === 'must' or 'should'
 * @property {boolean}               llmRefined    - whether LLM pass ran
 */
