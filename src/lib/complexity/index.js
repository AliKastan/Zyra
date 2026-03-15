'use strict';

/**
 * App Complexity Scorer — Public API
 *
 * Consumes an enriched GenerationIntent (post requirement-inference) and
 * returns a structured complexity report used to calibrate all downstream
 * pipeline stages: planning depth, blueprint depth, code generation passes,
 * validation strictness, and repair aggressiveness.
 *
 * Integration point: between Stage 1.5 (inference) and Stage 2 (productPlanner)
 * in orchestrator.js.
 *
 * Usage:
 *   const report = await scoreAppComplexity(enrichedIntent, cost);
 *   const strategyHints = getGenerationStrategyForComplexity(report);
 *   const withComplexity = mergeComplexityIntoSpec(enrichedIntent, report);
 */

const { buildComplexityReport, buildScoringContext } = require('./buildComplexityReport');
const { llmRefineComplexity }                         = require('./llmRefinement');
const { getTier, TIER_RANGES }                        = require('./thresholds');
const { recommendStrategy }                           = require('./recommendStrategy');
const logger                                          = require('../../utils/logger');

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score app complexity and return a full complexity report.
 * Main entry point — async to support optional LLM refinement.
 *
 * @param {import('../../generation/types').GenerationIntent} intent
 * @param {object} [cost] - cost tracker instance
 * @returns {Promise<import('./types').AppComplexityReport>}
 */
async function scoreAppComplexity(intent, cost) {
  let report = buildComplexityReport(intent);

  // Optional LLM refinement pass (gated by COMPLEXITY_LLM_ENABLED=true)
  const ctx = buildScoringContext(intent);
  report = await llmRefineComplexity(report, ctx, cost);

  logger.info(`complexityScorer: score=${report.totalScore} tier="${report.complexityTier}" confidence=${report.confidence} features=${report.signals.featureCount} roles=${report.signals.roleCount} integrations=${report.signals.integrationCount}`);

  return report;
}

/**
 * Get the complexity tier for a given numeric score.
 *
 * @param {number} score
 * @returns {import('./types').ComplexityTier}
 */
function getComplexityTier(score) {
  return getTier(score);
}

/**
 * Get generation strategy recommendation from a complexity report.
 *
 * @param {import('./types').AppComplexityReport} report
 * @returns {import('./types').GenerationStrategyRecommendation}
 */
function getGenerationStrategyForComplexity(report) {
  return report.recommendedStrategy;
}

/**
 * Produce a human-readable one-paragraph summary of the complexity report.
 *
 * @param {import('./types').AppComplexityReport} report
 * @returns {string}
 */
function summarizeComplexity(report) {
  const { totalScore, complexityTier, signals, recommendedStrategy } = report;
  const tierLabel = complexityTier.replace('_', '-');

  const highlights = [];
  if (signals.hasAuth)         highlights.push('authentication');
  if (signals.hasPayments)     highlights.push('payments');
  if (signals.hasAI)           highlights.push('AI integration');
  if (signals.hasAdmin)        highlights.push('admin dashboard');
  if (signals.hasAnalytics)    highlights.push('analytics');
  if (signals.hasMobile)       highlights.push('mobile');
  if (signals.hasRealTime)     highlights.push('real-time features');
  if (signals.hasBackgroundJobs) highlights.push('background jobs');

  const highlightStr = highlights.length > 0
    ? ` Key drivers: ${highlights.join(', ')}.`
    : '';

  return `Complexity score: ${totalScore}/90 (${tierLabel}).${highlightStr} ` +
    `${signals.featureCount} features, ${signals.roleCount} roles, ${signals.integrationCount} integrations. ` +
    `Recommended: ${recommendedStrategy.generationMode} generation, ${recommendedStrategy.planningDepth} planning.`;
}

/**
 * Merge complexity report into the intent object for downstream consumption.
 *
 * @param {import('../../generation/types').GenerationIntent} intent
 * @param {import('./types').AppComplexityReport} report
 * @returns {import('../../generation/types').GenerationIntent & { _complexityReport: import('./types').AppComplexityReport }}
 */
function mergeComplexityIntoSpec(intent, report) {
  return {
    ...intent,
    _complexityReport: report,
  };
}

module.exports = {
  scoreAppComplexity,
  getComplexityTier,
  getGenerationStrategyForComplexity,
  summarizeComplexity,
  mergeComplexityIntoSpec,
};
