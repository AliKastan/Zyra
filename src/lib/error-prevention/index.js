'use strict';

/**
 * Error Prevention Layer — Public API
 *
 * Stage 7 (preflight) and Stage 10.5 (in-flight) of the Zyra pipeline.
 *
 * Proactively prevents common structural, deployment, integration, and generation
 * mistakes before they turn into broken outputs.
 *
 * Primary entry points:
 *   runErrorPreventionPreflight(input)  — before code generation
 *   runInFlightPreventionChecks(input)  — after file generation, before packaging
 */

const { runErrorPreventionPreflight }    = require('./preflight-risk-analysis');
const { runInFlightPreventionChecks }    = require('./in-flight-checks');
const { buildPreventionReport,
        summarizePreventionReport,
        buildUiPreventionPayload }        = require('./build-prevention-report');
const { injectSafeDefaults }             = require('./inject-safe-defaults');
const { checkStackCoherence }            = require('./check-stack-coherence');
const { checkDeploymentPlanning }        = require('./check-deployment-planning');
const { checkEnvPlanning }               = require('./check-env-planning');
const { checkAuthPlanning }              = require('./check-auth-planning');
const { checkBillingPlanning }           = require('./check-billing-planning');
const { checkMobilePlanning }            = require('./check-mobile-planning');
const { checkPassCoverage }              = require('./check-pass-coverage');

// ── Convenience helpers ─────────────────────────────────────────────────────

/**
 * Get only the prevented issues (auto-resolved before generation).
 * @param {import('./types').PreventionReport} report
 * @returns {import('./types').PreventionIssue[]}
 */
function getPreventedIssues(report) {
  return report.preventedIssues || [];
}

/**
 * Get remaining risks that could not be prevented automatically.
 * @param {import('./types').PreventionReport} report
 * @returns {import('./types').UnresolvedRisk[]}
 */
function getRemainingRisks(report) {
  return [
    ...(report.unresolvedRisks || []),
    ...(report.warnings || []).filter(w => w.severity === 'high' || w.severity === 'critical'),
  ];
}

/**
 * Get generation adjustments made to the blueprint.
 * @param {import('./types').PreventionReport} report
 * @returns {import('./types').GenerationAdjustment[]}
 */
function getGenerationAdjustments(report) {
  return report.generationAdjustments || [];
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Primary entry points
  runErrorPreventionPreflight,
  runInFlightPreventionChecks,

  // Individual checks (for selective use)
  checkStackCoherence,
  checkDeploymentPlanning,
  checkEnvPlanning,
  checkAuthPlanning,
  checkBillingPlanning,
  checkMobilePlanning,
  checkPassCoverage,

  // Injection
  injectSafeDefaults,

  // Report
  buildPreventionReport,
  summarizePreventionReport,
  buildUiPreventionPayload,

  // Helpers
  getPreventedIssues,
  getRemainingRisks,
  getGenerationAdjustments,
};
