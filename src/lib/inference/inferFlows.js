'use strict';

const { DOMAIN_RULES } = require('./domainRules');

/**
 * Infer missing user flows for the given domain context.
 * Returns all domain flows (marked alreadyPresent or not).
 *
 * @param {import('./types').InferenceContext} ctx
 * @returns {import('./types').InferredRequirement[]}
 */
function inferFlows(ctx) {
  const rules = DOMAIN_RULES[ctx.domain] || DOMAIN_RULES.generic;
  const existingFlowNames = new Set(
    (ctx.intent.userFlows || []).map(f => (f.name || f).toLowerCase())
  );

  return (rules.flows || []).map(rule => ({
    ...rule,
    category:       'flow',
    alreadyPresent: _isFlowPresent(rule, existingFlowNames),
  }));
}

function _isFlowPresent(rule, existingNames) {
  const keywords = rule.name.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  return keywords.some(kw => [...existingNames].some(n => n.includes(kw)));
}

module.exports = { inferFlows };
