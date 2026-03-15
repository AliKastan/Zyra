'use strict';

/**
 * Re-classify inferred requirements based on additional context signals.
 * The base classification comes from domainRules; this function may promote
 * or demote based on user prompt signals.
 *
 * Rules:
 *   - If the intent already mentions payments → demote payment-integration to helpful_optional
 *   - If needsAuth === false explicitly → demote auth requirements
 *   - If isMultiUser === false → demote multi-user/team requirements
 *
 * @param {import('./types').InferredRequirement[]} requirements
 * @param {import('./types').InferenceContext} ctx
 * @returns {import('./types').InferredRequirement[]}
 */
function classifyInference(requirements, ctx) {
  return requirements.map(req => {
    let { classification } = req;

    // Explicit no-auth signal → downgrade auth items
    if (ctx.intent.needsAuth === false && req.id.includes('auth')) {
      classification = 'helpful_optional';
    }

    // Single-user app → downgrade team/multi-user items
    if (
      ctx.intent.isMultiUser === false &&
      (req.id.includes('team') || req.id.includes('invite') || req.id.includes('workspace'))
    ) {
      classification = 'helpful_optional';
    }

    // Payments explicitly not needed → demote payment items
    if (req.id.includes('payment') && ctx.intent.needsPayments === false) {
      classification = 'helpful_optional';
    }

    return { ...req, classification };
  });
}

module.exports = { classifyInference };
