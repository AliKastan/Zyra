'use strict';

const { callClaude, SONNET_MODEL } = require('../../providers/anthropicProvider');
const { safeJsonParse }            = require('../../utils/safeJsonParse');
const logger                       = require('../../utils/logger');

/**
 * Optional LLM refinement pass.
 *
 * Only runs when INFERENCE_LLM_ENABLED=true in env.
 * Sends the inference report to Claude to:
 *   1. Validate: are any inferred items clearly wrong for this specific app?
 *   2. Add: are there important items the rules missed for this specific prompt?
 *
 * Returns the (potentially modified) report. On failure, returns original report unchanged.
 *
 * @param {import('./types').InferenceReport} report
 * @param {import('./types').InferenceContext} ctx
 * @param {object} [cost] - cost tracker instance
 * @returns {Promise<import('./types').InferenceReport>}
 */
async function llmRefineReport(report, ctx, cost) {
  if (process.env.INFERENCE_LLM_ENABLED !== 'true') return report;

  const system = `You are a requirements analyst. Given an app description and a list of inferred missing requirements, \
identify any requirements that are clearly wrong for this specific app (return their ids in "remove"), \
and add any critical missing requirements the rules missed (return in "add" with same schema).
Respond with JSON only: { "remove": ["id1",...], "add": [{id,category,name,description,rationale,classification,mvpTier},...] }`;

  const user = `App: ${ctx.intent.appType} — ${ctx.intent.category}
Prompt context: features=${(ctx.intent.features || []).map(f => f.name).join(', ')}
Missing requirements: ${report.missing.map(r => `${r.id}(${r.classification})`).join(', ')}`;

  try {
    const raw = await callClaude(system, user, { model: SONNET_MODEL, maxTokens: 800 });
    if (cost) cost.record('inference-llm', system, user, raw, { model: SONNET_MODEL });

    const { success, data } = safeJsonParse(raw);
    if (!success || !data) return report;

    let { requirements } = report;

    // Remove flagged items
    const removeIds = new Set(Array.isArray(data.remove) ? data.remove : []);
    if (removeIds.size > 0) {
      requirements = requirements.filter(r => !removeIds.has(r.id));
    }

    // Add new items (only if they have required fields)
    if (Array.isArray(data.add)) {
      const additions = data.add
        .filter(a => a.id && a.name && a.classification)
        .map(a => ({ ...a, alreadyPresent: false }));
      requirements = [...requirements, ...additions];
    }

    const missing      = requirements.filter(r => !r.alreadyPresent);
    const critical     = missing.filter(r => r.classification === 'critical_missing');
    const mvpAdditions = missing.filter(r => r.mvpTier === 'must' || r.mvpTier === 'should');

    logger.info(`inferLLM: removed=${removeIds.size} added=${(data.add || []).length}`);

    return { ...report, requirements, missing, critical, mvpAdditions, llmRefined: true };
  } catch (err) {
    logger.warn(`inferLLM: failed (${err.message}), keeping original report`);
    return report;
  }
}

module.exports = { llmRefineReport };
