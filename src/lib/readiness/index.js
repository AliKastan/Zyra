'use strict';

/**
 * Production Readiness Checker + Deployment Intelligence Layer — Public API
 *
 * Stage 12 of the Zyra pipeline.
 * Runs after Final Packaging (Stage 11), before final output is returned.
 *
 * Primary entry point: checkProductionReadiness(input)
 */

const { buildReadinessReport, summarizeReadinessReport, buildUiReadinessPayload } = require('./build-readiness-report');
const { checkRuntime }      = require('./check-runtime');
const { checkDeployment, detectProjectType } = require('./check-deployment');
const { checkEnv }          = require('./check-env');
const { checkIntegrations, INTEGRATION_CATALOG } = require('./check-integrations');
const { checkBuild }        = require('./check-build');
const { checkDatabase }     = require('./check-database');
const { checkBilling }      = require('./check-billing');
const { checkSecurity }     = require('./check-security');

// ── Primary entry point ─────────────────────────────────────────────────────

/**
 * Run the full Production Readiness Check (Stage 12).
 *
 * Accepts the orchestrator's output context and returns a ProductionReadinessReport.
 *
 * @param {import('./types').ReadinessInput} input
 * @returns {import('./types').ProductionReadinessReport}
 */
function checkProductionReadiness(input) {
  return buildReadinessReport(input);
}

// ── Convenience helpers ─────────────────────────────────────────────────────

/**
 * Get only the critical readiness issues from a report.
 * @param {import('./types').ProductionReadinessReport} report
 * @returns {import('./types').ReadinessIssue[]}
 */
function getCriticalReadinessIssues(report) {
  return report.criticalIssues || [];
}

/**
 * Get deployment compatibility summary for all platforms.
 * @param {import('./types').ProductionReadinessReport} report
 * @returns {Array<{ platform: string, compatible: boolean, issues: string[] }>}
 */
function getDeploymentCompatibility(report) {
  return (report.deployment?.targets || []).map(t => ({
    platform:   t.name,
    compatible: t.compatible,
    issues:     t.issues,
  }));
}

/**
 * Get prioritized setup steps for the user.
 * @param {import('./types').ProductionReadinessReport} report
 * @returns {import('./types').SuggestedFix[]}
 */
function getRecommendedSetupSteps(report) {
  return report.nextSteps || [];
}

/**
 * Quick check — is this project deployable without any further work?
 * @param {import('./types').ProductionReadinessReport} report
 * @returns {boolean}
 */
function isDeploymentReady(report) {
  return report.status === 'ready' || report.status === 'ready_with_warnings';
}

/**
 * Quick check — does this project need env/key setup before it can run?
 * @param {import('./types').ProductionReadinessReport} report
 * @returns {boolean}
 */
function needsSetup(report) {
  return report.status === 'ready_with_setup_required' ||
         report.status === 'manual_configuration_required' ||
         report.status === 'not_ready';
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Primary entry
  checkProductionReadiness,

  // Individual checks (for selective use)
  checkRuntime,
  checkDeployment,
  checkEnv,
  checkIntegrations,
  checkBuild,
  checkDatabase,
  checkBilling,
  checkSecurity,

  // Report assembly
  buildReadinessReport,
  summarizeReadinessReport,
  buildUiReadinessPayload,

  // Helpers
  getCriticalReadinessIssues,
  getDeploymentCompatibility,
  getRecommendedSetupSteps,
  isDeploymentReady,
  needsSetup,
  detectProjectType,

  // Catalog (for external reference)
  INTEGRATION_CATALOG,
};
