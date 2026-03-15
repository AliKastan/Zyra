'use strict';

const { DOMAIN_RULES } = require('./domainRules');

/**
 * Infer missing features for the given domain context.
 * Returns all domain features (marked alreadyPresent or not).
 *
 * @param {import('./types').InferenceContext} ctx
 * @returns {import('./types').InferredRequirement[]}
 */
function inferFeatures(ctx) {
  const rules = DOMAIN_RULES[ctx.domain] || DOMAIN_RULES.generic;
  const existingNames = _getExistingNames(ctx.intent);

  return (rules.features || []).map(rule => ({
    ...rule,
    category:       'feature',
    alreadyPresent: _isPresent(rule, existingNames),
  }));
}

function _getExistingNames(intent) {
  const names = new Set();
  (intent.features || []).forEach(f => {
    if (f.name) names.add(f.name.toLowerCase());
    if (f.description) names.add(f.description.toLowerCase());
  });
  (intent.interactions || []).forEach(i => {
    if (typeof i === 'string') names.add(i.toLowerCase());
  });
  return names;
}

function _isPresent(rule, existingNames) {
  const keywords = rule.name.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  return keywords.some(kw => [...existingNames].some(n => n.includes(kw)));
}

module.exports = { inferFeatures };
