/**
 * Entitlements
 *
 * Single-source-of-truth for plan feature gates.
 * Use these helpers anywhere in the codebase to check what a plan allows.
 */

const { PLAN_FEATURES, PLAN_CREDITS } = require('../config/billing');

/**
 * Returns the full feature set for a given plan.
 * Falls back to 'free' if plan is unrecognised.
 */
function getEntitlements(plan) {
  return PLAN_FEATURES[plan] ?? PLAN_FEATURES.free;
}

function canUseDeploy(plan)        { return getEntitlements(plan).deploy; }
function canUsePremiumModels(plan) { return getEntitlements(plan).premium_models; }
function canUseAdvancedDebug(plan) { return getEntitlements(plan).advanced_debug; }
function hasPrioritySupport(plan)  { return getEntitlements(plan).priority_support; }

function getMonthlyCredits(plan)    { return PLAN_CREDITS[plan] ?? PLAN_CREDITS.free; }
function getMaxOutputTokens(plan)   { return getEntitlements(plan).max_output_tokens; }
function getMaxProjects(plan)       { return getEntitlements(plan).max_projects; } // null = unlimited

/**
 * Returns a safe model identifier for a given plan.
 * Downgrades premium model requests for free users.
 *
 * @param {string} requestedModel - the model the user or system wants to use
 * @param {string} plan           - user's current plan
 * @returns {string} model to actually use
 */
function resolveModel(requestedModel, plan) {
  const PREMIUM_MODELS = new Set(['claude-opus-4-6', 'gpt-4o', 'gpt-4-turbo']);
  const FREE_FALLBACK  = 'claude-sonnet-4-6';

  if (PREMIUM_MODELS.has(requestedModel) && !canUsePremiumModels(plan)) {
    return FREE_FALLBACK;
  }
  return requestedModel;
}

module.exports = {
  getEntitlements,
  canUseDeploy,
  canUsePremiumModels,
  canUseAdvancedDebug,
  hasPrioritySupport,
  getMonthlyCredits,
  getMaxOutputTokens,
  getMaxProjects,
  resolveModel,
};
