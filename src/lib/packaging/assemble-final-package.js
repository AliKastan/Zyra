'use strict';

/**
 * Assemble Final Package
 *
 * Stage 10 of the Zyra pipeline. Orchestrates all packaging builders and
 * produces the FinalProjectPackage from all prior pipeline outputs.
 *
 * Call order:
 *   1. buildProjectManifest    — extracts metadata into a structured manifest
 *   2. buildReadinessSummary   — derives readiness flags from validator + repair
 *   3. buildSetupInstructions  — env vars, integrations, install/run commands
 *   4. buildWarningSummary     — collects warnings + manual review items
 *   5. buildRunInstructions    — platform-aware run/build/deploy instructions
 *   6. buildFinalSummary       — structured description + next steps
 *   7. determinePackageStatus  — selects the final package status level
 *   8. assembleFileList        — merges file artifacts with file-generator metadata
 *   9. buildExports            — generates JSON manifest + markdown report
 */

const { buildProjectManifest }     = require('./build-manifest');
const { buildReadinessSummary }    = require('./build-readiness-summary');
const { buildSetupInstructions }   = require('./build-setup-instructions');
const { buildRunInstructions }     = require('./build-run-instructions');
const { buildWarningSummary }      = require('./build-warning-summary');
const { buildFinalSummary }        = require('./build-final-report');
const { buildExports }             = require('./build-exports');

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Assemble the complete final project package from all pipeline outputs.
 *
 * @param {import('./types').PackagingInput} input
 * @returns {import('./types').FinalProjectPackage}
 */
function assembleFinalProjectPackage(input) {
  const { files = [], fileArtifacts = null } = input;

  // ── 1. Project manifest ─────────────────────────────────────────────────────
  const manifest = buildProjectManifest(input);

  // ── 2. Readiness summary ────────────────────────────────────────────────────
  const readiness = buildReadinessSummary(input);

  // ── 3. Setup instructions ───────────────────────────────────────────────────
  const setup = buildSetupInstructions(input, manifest);

  // Merge run instructions into setup (shared devCommand, deployNotes etc.)
  const runInstructions = buildRunInstructions(input, manifest);
  if (runInstructions.devCommand   && !setup.devCommand)   setup.devCommand   = runInstructions.devCommand;
  if (runInstructions.buildCommand && !setup.buildCommand) setup.buildCommand = runInstructions.buildCommand;
  if (runInstructions.startCommand && !setup.startCommand) setup.startCommand = runInstructions.startCommand;
  if (runInstructions.deployNotes?.length > 0 && setup.deployNotes.length === 0) {
    setup.deployNotes = runInstructions.deployNotes;
  }
  // Merge env setup steps and mobile command from run instructions into setup
  setup.envSetupSteps  = runInstructions.envSetupSteps  || [];
  if (runInstructions.mobileCommand) setup.mobileCommand = runInstructions.mobileCommand;

  // ── 4. Warning summary ──────────────────────────────────────────────────────
  const warningSummary = buildWarningSummary(input, readiness);

  // ── 5. Final summary + next steps ───────────────────────────────────────────
  const summary = buildFinalSummary(input, manifest, readiness, warningSummary, setup);

  // ── 6. Package status ───────────────────────────────────────────────────────
  const packageStatus = determinePackageStatus(readiness, warningSummary, setup, input.validationReport);

  // ── 7. File list ────────────────────────────────────────────────────────────
  const packagedFiles = _assembleFileList(files, fileArtifacts);

  // ── 8. Assemble partial package (needed for export builders) ────────────────
  /** @type {import('./types').FinalProjectPackage} */
  const partialPkg = {
    packageStatus,
    manifest,
    readiness,
    files: packagedFiles,
    summary,
    setup,
    warnings:             warningSummary.warnings,
    manualReviewRequired: warningSummary.manualReviewRequired,
    exports: {
      manifestFile:  'project-manifest.json',
      reportFile:    'final-report.md',
      manifestJson:  '',
      reportMarkdown: '',
    },
  };

  // ── 9. Build exports ─────────────────────────────────────────────────────────
  const exports = buildExports(partialPkg, input);
  partialPkg.exports = exports;

  return partialPkg;
}

/**
 * Determine the final package status level.
 *
 * Priority (most severe first):
 *   incomplete > manual_review_required > ready_with_setup_required > ready_with_warnings > ready
 *
 * @param {import('./types').ReadinessSummary} readiness
 * @param {import('./types').FinalWarningSummary} warningSummary
 * @param {import('./types').FinalSetupInstructions} setup
 * @param {Object} validationReport
 * @returns {import('./types').FinalPackageStatus}
 */
function determinePackageStatus(readiness, warningSummary, setup, validationReport) {
  const score = typeof validationReport?.score === 'number' ? validationReport.score : 50;

  // ── incomplete ──────────────────────────────────────────────────────────────
  // Score below 40, or architecture completely broken (not runnable at all)
  if (score < 40 && !readiness.architectureReady) {
    return 'incomplete';
  }
  if (validationReport?.status === 'failed' && !readiness.runReady && !readiness.architectureReady) {
    return 'incomplete';
  }

  // ── manual_review_required ──────────────────────────────────────────────────
  // Unresolved critical issues or items that need developer decision
  if (warningSummary.manualReviewRequired.length > 0) {
    return 'manual_review_required';
  }
  if (warningSummary.unresolvedIssues.length > 0 && score < 60) {
    return 'manual_review_required';
  }

  // ── ready_with_setup_required ───────────────────────────────────────────────
  // Structurally complete but missing keys / env vars before it can run
  const missingRequired = setup.requiredEnvVars.filter(v => v.required && !v.hasDefault);
  const unconfiguredIntegrations = setup.integrations.filter(i => i.requiresKey && !i.configured);

  if (missingRequired.length > 0 || unconfiguredIntegrations.length > 0 || warningSummary.missingCredentials.length > 0) {
    return 'ready_with_setup_required';
  }

  // ── ready_with_warnings ─────────────────────────────────────────────────────
  // Runnable but has non-critical concerns
  if (warningSummary.warnings.length > 0 || warningSummary.unresolvedIssues.length > 0) {
    return 'ready_with_warnings';
  }

  // ── ready ───────────────────────────────────────────────────────────────────
  return 'ready';
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Merge raw files with file artifact metadata to produce PackagedFileEntry[].
 */
function _assembleFileList(files, fileArtifacts) {
  const artifactMap = new Map();

  if (fileArtifacts && Array.isArray(fileArtifacts.artifacts)) {
    for (const artifact of fileArtifacts.artifacts) {
      artifactMap.set(_normPath(artifact.path), artifact);
    }
  }

  return files.map(f => {
    const normPath = _normPath(f.path);
    const artifact = artifactMap.get(normPath);

    /** @type {import('./types').PackagedFileEntry} */
    const entry = {
      path:    f.path,
      content: f.content || '',
    };

    if (artifact) {
      if (artifact.type)      entry.type      = artifact.type;
      if (artifact.operation) entry.operation = artifact.operation;
      if (artifact.sizeBytes) entry.sizeBytes = artifact.sizeBytes;
    } else {
      entry.sizeBytes = Buffer.byteLength(f.content || '', 'utf8');
    }

    return entry;
  });
}

function _normPath(p) {
  let n = (p || '').replace(/\\/g, '/');
  if (n.startsWith('./')) n = n.slice(2);
  return n;
}

module.exports = { assembleFinalProjectPackage, determinePackageStatus };
