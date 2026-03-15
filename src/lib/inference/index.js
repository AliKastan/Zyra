'use strict';

/**
 * Missing Requirement Inference Engine — Public API
 *
 * Examines a normalized GenerationIntent and infers what important requirements
 * are likely missing based on the app domain. Enriches the intent with inferred
 * features, flows, and entities so all downstream pipeline stages benefit.
 *
 * Integration point: between Stage 1 (intentAnalyzer) and Stage 2 (productPlanner)
 * in orchestrator.js.
 *
 * Usage:
 *   const enriched = await inferMissingRequirements(intent, cost);
 *   // pass enriched to planProduct, planStack, generateBlueprint instead of intent
 */

const { DOMAIN_RULES }         = require('./domainRules');
const { buildInferenceReport } = require('./buildInferenceReport');
const { llmRefineReport }      = require('./llmRefinement');
const logger                   = require('../../utils/logger');

// ── Domain detection ─────────────────────────────────────────────────────────

/**
 * Detect the domain from intent signals.
 *
 * @param {import('../../generation/types').GenerationIntent} intent
 * @returns {{ domain: import('./types').Domain, detectedKeywords: string[] }}
 */
function detectDomain(intent) {
  const corpus = [
    intent.appType    || '',
    intent.category   || '',
    intent.coreEntity || '',
    (intent.features || []).map(f => f.name || '').join(' '),
    (intent.realContent && intent.realContent.appName) || '',
  ].join(' ').toLowerCase();

  let bestDomain  = 'generic';
  let bestScore   = 0;
  const detectedKeywords = [];

  for (const [domain, rules] of Object.entries(DOMAIN_RULES)) {
    if (domain === 'generic') continue;
    const matched = (rules.keywords || []).filter(kw => corpus.includes(kw));
    if (matched.length > bestScore) {
      bestScore              = matched.length;
      bestDomain             = domain;
      detectedKeywords.length = 0;
      detectedKeywords.push(...matched);
    }
  }

  // Also honour explicit appType mapping
  const appTypeMap = {
    'booking':      'booking',
    'marketplace':  'marketplace',
    'saas':         'saas',
    'restaurant':   'restaurant',
    'fitness':      'fitness',
    'ecommerce':    'ecommerce',
    'ai-tool':      'ai_tool',
    'ai_tool':      'ai_tool',
    'dashboard':    'dashboard',
    'social':       'social',
    'landing-page': 'landing_page',
    'portfolio':    'landing_page',
  };

  if (appTypeMap[intent.appType] && bestScore === 0) {
    bestDomain = appTypeMap[intent.appType];
  }

  return {
    domain: /** @type {import('./types').Domain} */ (bestDomain),
    detectedKeywords,
  };
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

/**
 * Merge inferred requirements back into the intent object.
 * Only adds items that are missing (alreadyPresent === false) and are must/should tier.
 *
 * @param {import('../../generation/types').GenerationIntent} intent
 * @param {import('./types').InferenceReport} report
 * @returns {import('../../generation/types').GenerationIntent}
 */
function mergeInferenceIntoSpec(intent, report) {
  const additions = report.missing.filter(r => r.mvpTier === 'must' || r.mvpTier === 'should');
  if (additions.length === 0) return intent;

  // Add inferred features to intent.features
  const featureAdditions = additions
    .filter(r => r.category === 'feature')
    .map(r => ({
      name:         r.name,
      description:  r.description,
      priority:     r.mvpTier === 'must' ? 'high' : 'medium',
      implicit:     true,
      inferred:     true,
      inferredFrom: r.rationale,
    }));

  // Add inferred flows to intent.userFlows
  const flowAdditions = additions
    .filter(r => r.category === 'flow')
    .map(r => ({
      name:     r.name,
      steps:    [r.description],
      inferred: true,
    }));

  // Add inferred uiStates from entity/integration additions
  const newUiStates = additions
    .filter(r => r.category === 'entity' && r.mvpTier === 'must')
    .map(r => `${r.name} empty state`);

  // Extend potentialPitfalls with critical missing items
  const pitfallAdditions = report.critical
    .map(r => `Missing ${r.name}: ${r.rationale}`);

  const merged = {
    ...intent,
    features:          [...(intent.features          || []), ...featureAdditions],
    userFlows:         [...(intent.userFlows         || []), ...flowAdditions],
    uiStates:          [...new Set([...(intent.uiStates          || []), ...newUiStates])],
    potentialPitfalls: [...new Set([...(intent.potentialPitfalls || []), ...pitfallAdditions])],
    _inferenceReport:  report, // attach for downstream inspection
  };

  logger.info(`inference: merged ${featureAdditions.length} features + ${flowAdditions.length} flows into intent`);

  return merged;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Main entry point. Analyzes the intent, infers missing requirements,
 * optionally refines with LLM, and returns an enriched intent object.
 *
 * @param {import('../../generation/types').GenerationIntent} intent
 * @param {object} [cost] - cost tracker instance
 * @returns {Promise<import('../../generation/types').GenerationIntent>}
 */
async function inferMissingRequirements(intent, cost) {
  const { domain, detectedKeywords } = detectDomain(intent);

  logger.info(`inference: domain="${domain}" keywords=[${detectedKeywords.slice(0, 4).join(', ')}]`);

  /** @type {import('./types').InferenceContext} */
  const ctx = { intent, domain, detectedKeywords };

  let report = buildInferenceReport(ctx);

  // Optional LLM refinement pass (controlled by INFERENCE_LLM_ENABLED=true)
  report = await llmRefineReport(report, ctx, cost);

  logger.info(
    `inference: total=${report.requirements.length} missing=${report.missing.length} ` +
    `critical=${report.critical.length} mvpAdditions=${report.mvpAdditions.length}`
  );

  // Merge inferred requirements into intent
  return mergeInferenceIntoSpec(intent, report);
}

/**
 * Get only critical missing requirements from a report.
 *
 * @param {import('./types').InferenceReport} report
 * @returns {import('./types').InferredRequirement[]}
 */
function getCriticalMissingRequirements(report) {
  return report.critical;
}

/**
 * Get recommended MVP additions (must + should tier missing items).
 *
 * @param {import('./types').InferenceReport} report
 * @returns {import('./types').InferredRequirement[]}
 */
function getRecommendedMvpAdditions(report) {
  return report.mvpAdditions;
}

module.exports = {
  inferMissingRequirements,
  getCriticalMissingRequirements,
  getRecommendedMvpAdditions,
  mergeInferenceIntoSpec,
  detectDomain,
};
