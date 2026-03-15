'use strict';

const { DOMAIN_RULES } = require('./domainRules');

/**
 * Infer missing data entities for the given domain context.
 * Returns all domain entities (marked alreadyPresent or not).
 *
 * @param {import('./types').InferenceContext} ctx
 * @returns {import('./types').InferredRequirement[]}
 */
function inferEntities(ctx) {
  const rules = DOMAIN_RULES[ctx.domain] || DOMAIN_RULES.generic;
  const coreEntityLower = (ctx.intent.coreEntity || '').toLowerCase();

  return (rules.entities || []).map(rule => {
    // Mark as already present if the entity name appears in coreEntity or features
    const entityKeyword = rule.name.replace('entity_', '').replace(/_/g, ' ');
    const alreadyPresent =
      coreEntityLower.includes(entityKeyword) ||
      (ctx.intent.features || []).some(f => (f.name || '').toLowerCase().includes(entityKeyword));
    return { ...rule, category: 'entity', alreadyPresent };
  });
}

module.exports = { inferEntities };
