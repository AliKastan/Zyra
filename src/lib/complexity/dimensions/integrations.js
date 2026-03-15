'use strict';

const MAX = 14;

/**
 * Score integration complexity (third-party APIs and services).
 * @param {import('../types').ScoringContext} ctx
 * @returns {import('../types').DimensionResult}
 */
function scoreIntegrations(ctx) {
  const reasons = [];
  const signals = {};

  const integrationCount    = ctx.integrations.length;
  signals.integrationCount  = integrationCount;

  // Base: 2 pts per integration, capped at 10
  let score = Math.min(integrationCount * 2, 10);
  if (integrationCount >= 5) reasons.push(`${integrationCount} third-party integrations required`);
  else if (integrationCount >= 3) reasons.push(`${integrationCount} integrations required`);

  // AI/ML integration bonus (+2, significant complexity)
  const hasAI = ctx.integrations.some(r => /\b(ai|llm|gpt|openai|anthropic|claude|ml|model|generate)\b/.test(r.id || r.name || '')) ||
    /\b(ai|artificial intelligence|llm|gpt|openai|anthropic|claude|machine learning|generate)\b/.test(ctx.allText);
  signals.hasAI = hasAI;
  if (hasAI) {
    score = Math.min(score + 2, MAX);
    reasons.push('AI/ML integration adds significant technical complexity');
  }

  // External API complexity bonus (maps, calendar, shipping)
  const hasExternalApis = /\b(google maps|mapbox|twilio|sendgrid|mailchimp|shippo|fedex|usps|plaid|calendly)\b/.test(ctx.allText);
  signals.hasExternalApis = hasExternalApis;
  if (hasExternalApis && score < MAX) {
    score = Math.min(score + 2, MAX);
    reasons.push('Complex third-party API dependencies');
  }

  return { score: Math.min(score, MAX), max: MAX, reasons, signals };
}

module.exports = { scoreIntegrations };
