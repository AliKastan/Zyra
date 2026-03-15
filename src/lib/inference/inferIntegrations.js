'use strict';

const { DOMAIN_RULES } = require('./domainRules');

/**
 * Infer missing third-party integrations for the given domain context.
 * Returns all domain integrations (marked alreadyPresent or not).
 *
 * @param {import('./types').InferenceContext} ctx
 * @returns {import('./types').InferredRequirement[]}
 */
function inferIntegrations(ctx) {
  const rules        = DOMAIN_RULES[ctx.domain] || DOMAIN_RULES.generic;
  const needsPayments = ctx.intent.needsPayments === true;
  const needsAuth     = ctx.intent.needsAuth === true;

  return (rules.integrations || []).map(rule => {
    // Integrations are never "already present" just because the intent flags needsPayments/needsAuth.
    // Those flags affect classification (in classifyInference), not presence.
    // alreadyPresent would only be true if the user specifically described the integration.
    return { ...rule, category: 'integration', alreadyPresent: false };
  });
}

module.exports = { inferIntegrations };
