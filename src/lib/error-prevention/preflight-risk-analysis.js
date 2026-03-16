'use strict';

/**
 * Preflight Risk Analysis — Stage 7
 *
 * Orchestrates all preflight checks against the planned spec,
 * injects safe defaults into the blueprint, and returns an
 * enriched blueprint + prevention report.
 *
 * Run this AFTER blueprint + design system, BEFORE code generation.
 */

const { checkStackCoherence }      = require('./check-stack-coherence');
const { checkDeploymentPlanning }  = require('./check-deployment-planning');
const { checkEnvPlanning }         = require('./check-env-planning');
const { checkAuthPlanning }        = require('./check-auth-planning');
const { checkBillingPlanning }     = require('./check-billing-planning');
const { checkMobilePlanning }      = require('./check-mobile-planning');
const { checkPassCoverage }        = require('./check-pass-coverage');
const { injectSafeDefaults }       = require('./inject-safe-defaults');
const { buildPreventionReport }    = require('./build-prevention-report');

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Run all preflight prevention checks and inject safe defaults.
 *
 * @param {import('./types').PreventionInput} input
 * @returns {import('./types').PreventionAugmentedBlueprint}
 */
function runErrorPreventionPreflight(input) {
  const { blueprint = {} } = input;

  // ── Run all checks ────────────────────────────────────────────────────────
  const issues = [
    ...checkStackCoherence(input),
    ...checkDeploymentPlanning(input),
    ...checkEnvPlanning(input),
    ...checkAuthPlanning(input),
    ...checkBillingPlanning(input),
    ...checkMobilePlanning(input),
    ...checkPassCoverage(input),
  ];

  // Deduplicate issues by id (multiple checks can flag the same thing)
  const seen = new Set();
  const dedupedIssues = issues.filter(issue => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });

  // ── Inject safe defaults ───────────────────────────────────────────────────
  const { blueprint: adjustedBlueprint, injectedDefaults, generationAdjustments } =
    injectSafeDefaults(blueprint, dedupedIssues, input);

  // ── Build report ───────────────────────────────────────────────────────────
  const preventionReport = buildPreventionReport(
    dedupedIssues,
    injectedDefaults,
    generationAdjustments,
    [], // in-flight issues added later
  );

  return {
    blueprint: adjustedBlueprint,
    preventionReport,
  };
}

module.exports = { runErrorPreventionPreflight };
