'use strict';

/**
 * FINAL PACKAGING / OUTPUT ASSEMBLY / DELIVERY — Public API
 *
 * Stage 10 of the Zyra pipeline. Runs after all generation, validation, and
 * repair stages to produce a clean, structured, user-facing final deliverable.
 *
 * Pipeline position:
 *   Stage 9  (repair / self-healing) →
 *   Stage 10 (this module) →
 *   final result returned to user / UI / export layer
 *
 * Usage:
 *   const { assembleFinalProjectPackage } = require('../lib/packaging');
 *
 *   const finalPackage = assembleFinalProjectPackage({
 *     intent,
 *     product,
 *     stack,
 *     blueprint,
 *     complexityReport,
 *     files,               // final repaired files
 *     fileArtifacts,       // from buildGeneratedProjectFiles (Stage 5.5)
 *     validationReport,    // from validateGeneratedProject (Stage 6.5)
 *     structuralRepairReport, // from repairGeneratedProject (Stage 7.1)
 *     repairReport,        // from repairFiles (Stage 7, LLM repair)
 *     projectName,         // optional override
 *     generatedAt,         // optional ISO timestamp
 *   });
 */

const { assembleFinalProjectPackage, determinePackageStatus } = require('./assemble-final-package');
const { buildProjectManifest }    = require('./build-manifest');
const { buildReadinessSummary, summarizeReadiness } = require('./build-readiness-summary');
const { buildSetupInstructions }  = require('./build-setup-instructions');
const { buildRunInstructions }    = require('./build-run-instructions');
const { buildWarningSummary }     = require('./build-warning-summary');
const { buildFinalSummary, buildFinalDeliveryReport, getFinalNextSteps } = require('./build-final-report');
const { buildExports, exportArtifactsToFiles, buildUiPayload } = require('./build-exports');

// ── Helper: one-line summary for server logs ───────────────────────────────────

/**
 * Produce a compact one-line server log summary of the final package.
 *
 * @param {import('./types').FinalProjectPackage} pkg
 * @returns {string}
 */
function summarizeFinalPackage(pkg) {
  const m = pkg.manifest;
  const r = pkg.readiness;
  const readyFlags = [
    r.architectureReady  && 'arch',
    r.runReady           && 'run',
    r.deployReady        && 'deploy',
    r.authReady          && 'auth',
    r.billingReady       && 'billing',
    r.integrationReady   && 'integrations',
  ].filter(Boolean).join('+');

  return [
    `packaging: ${pkg.packageStatus}`,
    `project="${m.projectName}"`,
    `type="${m.appType}"`,
    `tier="${m.complexityTier}"`,
    `files=${m.fileCount}`,
    `envVars=${m.requiredEnvVars.length}`,
    `integrations=${m.integrationCount}`,
    `ready=[${readyFlags}]`,
    `warnings=${pkg.warnings.length}`,
    `manualReview=${pkg.manualReviewRequired.length}`,
  ].join(' ');
}

module.exports = {
  // ── Primary entry point ───────────────────────────────────────────────────
  assembleFinalProjectPackage,

  // ── Individual builders (for orchestrator / testing / UI) ─────────────────
  buildProjectManifest,
  buildReadinessSummary,
  buildSetupInstructions,
  buildRunInstructions,
  buildWarningSummary,
  buildFinalSummary,
  buildFinalDeliveryReport,
  buildExports,

  // ── Helpers ───────────────────────────────────────────────────────────────
  determinePackageStatus,
  getFinalNextSteps,
  summarizeFinalPackage,
  summarizeReadiness,
  exportArtifactsToFiles,
  buildUiPayload,
};
