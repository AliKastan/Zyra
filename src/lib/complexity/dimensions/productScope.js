'use strict';

const MAX = 20;

/**
 * Score product scope: features + flows + entities.
 * @param {import('../types').ScoringContext} ctx
 * @returns {import('../types').DimensionResult}
 */
function scoreProductScope(ctx) {
  const reasons = [];
  const signals = {};

  // Features: each feature = 1.2 pts, capped at 12
  const featureCount    = ctx.features.length;
  const featureScore    = Math.min(featureCount * 1.2, 12);
  signals.featureCount  = featureCount;
  if (featureCount >= 10) reasons.push(`${featureCount} features indicate a rich product scope`);
  else if (featureCount >= 6) reasons.push(`${featureCount} features suggest moderate product scope`);

  // Flows: each flow = 0.8 pts, capped at 5
  const flowCount     = ctx.flows.length;
  const flowScore     = Math.min(flowCount * 0.8, 5);
  signals.flowCount   = flowCount;
  if (flowCount >= 5) reasons.push(`${flowCount} user flows detected`);

  // Entities: each entity = 0.5 pts, capped at 3
  const entityCount    = ctx.entities.length;
  const entityScore    = Math.min(entityCount * 0.5, 3);
  signals.entityCount  = entityCount;
  if (entityCount >= 5) reasons.push(`${entityCount} data entities increase structural complexity`);

  const score = Math.min(Math.round(featureScore + flowScore + entityScore), MAX);

  return { score, max: MAX, reasons, signals };
}

module.exports = { scoreProductScope };
