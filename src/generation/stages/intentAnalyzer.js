'use strict';

const { callClaude, SONNET_MODEL } = require('../../providers/anthropicProvider');
const { buildIntentPrompt }         = require('../prompts/intent');
const { safeJsonParse }             = require('../../utils/safeJsonParse');
const logger                        = require('../../utils/logger');

/** @type {import('../types').GenerationIntent} */
const FALLBACK_INTENT = {
  appType:           'generic',
  category:          'Web application',
  coreEntity:        'Item',
  features:          [],
  userFlows:         [],
  uiStates:          ['empty state', 'loading', 'error'],
  realContent:       { appName: 'My App', tagline: '', primaryCTA: 'Get started', emptyStateMessages: {}, sectionHeadings: [], bodyParagraphs: [] },
  interactions:      [],
  needsAuth:         false,
  needsDatabase:     true,
  needsPayments:     false,
  isMultiUser:       false,
  tone:              'professional',
  target:            'General users',
  potentialPitfalls: [],
};

/**
 * Stage 1 — Deep Intent Analysis.
 *
 * Uses Sonnet to extract both explicit and implicit requirements, real app copy,
 * complete user flows, and pitfall warnings for the specific app type.
 *
 * Token budget: 1500 — this stage produces the richest possible intent spec.
 * Every downstream stage quality depends on what this stage produces.
 *
 * @param {string} userPrompt
 * @param {object} cost  - cost tracker instance
 * @param {{ level: string, appType: string }} [complexity]  - pre-computed hint
 * @returns {Promise<import('../types').GenerationIntent>}
 */
async function analyzeIntent(userPrompt, cost, complexity) {
  const { system, user } = buildIntentPrompt(userPrompt);

  try {
    const raw = await callClaude(system, user, { model: SONNET_MODEL, maxTokens: 1500 });

    if (cost) cost.record('intent', system, user, raw, { model: SONNET_MODEL });

    const { success, data: parsed } = safeJsonParse(raw);
    if (!success || !parsed || typeof parsed !== 'object' || !parsed.appType) {
      logger.warn('intentAnalyzer: invalid JSON shape, using fallback');
      return _applyComplexityHints(FALLBACK_INTENT, complexity, userPrompt);
    }

    // Ensure every field present — merge over fallback to fill any gaps
    const intent = {
      ...FALLBACK_INTENT,
      ...parsed,
      features:     Array.isArray(parsed.features)     ? parsed.features     : [],
      userFlows:    Array.isArray(parsed.userFlows)     ? parsed.userFlows    : [],
      uiStates:     Array.isArray(parsed.uiStates)      ? parsed.uiStates     : FALLBACK_INTENT.uiStates,
      interactions: Array.isArray(parsed.interactions)  ? parsed.interactions : [],
      realContent:  parsed.realContent || FALLBACK_INTENT.realContent,
      potentialPitfalls: Array.isArray(parsed.potentialPitfalls) ? parsed.potentialPitfalls : [],
    };

    logger.info(`intentAnalyzer: appType=${intent.appType} features=${intent.features.length} flows=${intent.userFlows.length}`);

    return _applyComplexityHints(intent, complexity, userPrompt);
  } catch (err) {
    logger.warn(`intentAnalyzer: failed (${err.message}), using fallback`);
    return _applyComplexityHints(FALLBACK_INTENT, complexity, userPrompt);
  }
}

/**
 * Seed the intent with known complexity classifier results and extract
 * an appName hint from the user prompt as a last resort.
 */
function _applyComplexityHints(intent, complexity, userPrompt) {
  let result = { ...intent };

  // Classifier appType is more reliable than a generic LLM guess
  if (complexity?.appType && complexity.appType !== 'generic' && result.appType === 'generic') {
    result = { ...result, appType: complexity.appType };
  }

  // If realContent.appName is still generic, try to extract a name from the prompt
  if (!result.realContent?.appName || result.realContent.appName === 'My App') {
    const nameMatch = userPrompt?.match(/(?:called|named|for)\s+["']?([A-Z][a-zA-Z0-9 ]{1,30})["']?/);
    if (nameMatch) {
      result = {
        ...result,
        realContent: { ...result.realContent, appName: nameMatch[1].trim() },
      };
    }
  }

  return result;
}

module.exports = { analyzeIntent };
