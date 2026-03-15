'use strict';

const { inferFeatures }     = require('./inferFeatures');
const { inferFlows }        = require('./inferFlows');
const { inferRoles }        = require('./inferRoles');
const { inferEntities }     = require('./inferEntities');
const { inferIntegrations } = require('./inferIntegrations');
const { classifyInference } = require('./classifyInference');
const { prioritizeMvp }     = require('./prioritizeMvp');

/**
 * Build a full inference report for the given intent + domain context.
 *
 * @param {import('./types').InferenceContext} ctx
 * @returns {import('./types').InferenceReport}
 */
function buildInferenceReport(ctx) {
  // Collect all inferred requirements across categories
  const raw = [
    ...inferFeatures(ctx),
    ...inferFlows(ctx),
    ...inferRoles(ctx),
    ...inferEntities(ctx),
    ...inferIntegrations(ctx),
  ];

  // Apply context-aware classification adjustments
  const classified = classifyInference(raw, ctx);

  // Assign MVP tiers
  const requirements = prioritizeMvp(classified);

  // Derived views
  const missing      = requirements.filter(r => !r.alreadyPresent);
  const critical     = missing.filter(r => r.classification === 'critical_missing');
  const mvpAdditions = missing.filter(r => r.mvpTier === 'must' || r.mvpTier === 'should');

  return {
    domain:           ctx.domain,
    detectedKeywords: ctx.detectedKeywords,
    requirements,
    missing,
    critical,
    mvpAdditions,
    llmRefined: false,
  };
}

module.exports = { buildInferenceReport };
