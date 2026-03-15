'use strict';

/** @type {Record<import('./types').ComplexityTier, {min: number, max: number}>} */
const TIER_RANGES = {
  simple:           { min: 0,  max: 24 },
  medium:           { min: 25, max: 49 },
  advanced:         { min: 50, max: 74 },
  production_heavy: { min: 75, max: Infinity },
};

const DIMENSION_MAX = {
  productScope:     20,
  platform:          8,
  dataBackend:      14,
  rolesPermissions: 12,
  integrations:     14,
  operations:       10,
  deployment:       12,
};

const TOTAL_MAX = Object.values(DIMENSION_MAX).reduce((a, b) => a + b, 0); // 90

/**
 * @param {number} score
 * @returns {import('./types').ComplexityTier}
 */
function getTier(score) {
  if (score >= 75) return 'production_heavy';
  if (score >= 50) return 'advanced';
  if (score >= 25) return 'medium';
  return 'simple';
}

module.exports = { TIER_RANGES, DIMENSION_MAX, TOTAL_MAX, getTier };
