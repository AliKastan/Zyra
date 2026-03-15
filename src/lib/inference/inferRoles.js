'use strict';

const { DOMAIN_RULES } = require('./domainRules');

/**
 * Infer missing roles for the given domain context.
 * Returns all domain roles (marked alreadyPresent or not).
 *
 * @param {import('./types').InferenceContext} ctx
 * @returns {import('./types').InferredRequirement[]}
 */
function inferRoles(ctx) {
  const rules = DOMAIN_RULES[ctx.domain] || DOMAIN_RULES.generic;
  // Roles aren't typically enumerated in intent — check features/target text
  const targetText  = (ctx.intent.target || '').toLowerCase();
  const featureText = (ctx.intent.features || []).map(f => f.name || '').join(' ').toLowerCase();
  const existingText = targetText + ' ' + featureText;

  return (rules.roles || []).map(rule => ({
    ...rule,
    category:       'role',
    alreadyPresent: existingText.includes(rule.name.replace('role_', '').replace(/_/g, ' ')),
  }));
}

module.exports = { inferRoles };
