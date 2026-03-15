'use strict';

const { callClaude, SONNET_MODEL } = require('../../providers/anthropicProvider');
const { safeJsonParse }            = require('../../utils/safeJsonParse');
const { getTier }                  = require('./thresholds');
const logger                       = require('../../utils/logger');

/**
 * Optional LLM refinement for the complexity report.
 *
 * Only runs when COMPLEXITY_LLM_ENABLED=true.
 * Claude can nudge the score up/down by at most ±10 points and add reasons.
 * It cannot override hard signals (auth, payments, role count).
 *
 * @param {import('./types').AppComplexityReport} report
 * @param {import('./types').ScoringContext} ctx
 * @param {object} [cost]
 * @returns {Promise<import('./types').AppComplexityReport>}
 */
async function llmRefineComplexity(report, ctx, cost) {
  if (process.env.COMPLEXITY_LLM_ENABLED !== 'true') return report;

  const system = `You are a software complexity analyst. Given an app description and its automated complexity score, assess whether the score seems accurate. You may suggest a score adjustment between -10 and +10, and add specific reasons. Respond with JSON only: { "scoreAdjustment": -5, "additionalReasons": ["reason1"] }`;

  const user = `App: ${ctx.intent.appType} — ${ctx.intent.category}
Domain: ${ctx.domain}
Current score: ${report.totalScore} (${report.complexityTier})
Signals: features=${ctx.features.length}, roles=${ctx.roles.length}, integrations=${ctx.integrations.length}, hasAuth=${report.signals.hasAuth}, hasPayments=${report.signals.hasPayments}
Main reasons: ${report.reasons.slice(0, 4).join('; ')}`;

  try {
    const raw = await callClaude(system, user, { model: SONNET_MODEL, maxTokens: 300 });
    if (cost) cost.record('complexity-llm', system, user, raw, { model: SONNET_MODEL });

    const { success, data } = safeJsonParse(raw);
    if (!success || !data) return report;

    const adjustment = typeof data.scoreAdjustment === 'number'
      ? Math.max(-10, Math.min(10, Math.round(data.scoreAdjustment))) // clamp ±10
      : 0;

    const adjustedScore = Math.max(0, report.totalScore + adjustment);
    const adjustedTier  = getTier(adjustedScore);

    const additionalReasons = Array.isArray(data.additionalReasons) ? data.additionalReasons : [];

    logger.info(`complexityLLM: adjustment=${adjustment} score=${report.totalScore}→${adjustedScore} tier=${report.complexityTier}→${adjustedTier}`);

    return {
      ...report,
      totalScore:      adjustedScore,
      complexityTier:  adjustedTier,
      reasons:         [...report.reasons, ...additionalReasons].slice(0, 10),
      llmRefined:      true,
    };
  } catch (err) {
    logger.warn(`complexityLLM: failed (${err.message}), keeping original report`);
    return report;
  }
}

module.exports = { llmRefineComplexity };
