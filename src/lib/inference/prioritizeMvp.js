'use strict';

/**
 * Assign MVP tier to each requirement based on classification and category.
 *
 * Tiers:
 *   must  — critical_missing features/flows/entities; the app is broken without these
 *   should — likely_needed items; significantly degrades quality if absent
 *   could  — helpful_optional / domain_specific; nice-to-have
 *
 * @param {import('./types').InferredRequirement[]} requirements
 * @returns {import('./types').InferredRequirement[]}
 */
function prioritizeMvp(requirements) {
  return requirements.map(req => {
    let mvpTier = req.mvpTier; // keep domain rule default

    // Re-derive tier from classification when classification was overridden
    if (req.classification === 'critical_missing') {
      mvpTier = 'must';
    } else if (req.classification === 'likely_needed') {
      mvpTier = 'should';
    } else if (req.classification === 'helpful_optional' || req.classification === 'domain_specific') {
      mvpTier = 'could';
    }

    // Roles and entities that are critical are always must
    if (
      (req.category === 'role' || req.category === 'entity') &&
      req.classification === 'critical_missing'
    ) {
      mvpTier = 'must';
    }

    return { ...req, mvpTier };
  });
}

module.exports = { prioritizeMvp };
