'use strict';

/**
 * Build Export Artifacts
 *
 * Produces the machine-readable and human-readable export files that will be
 * written alongside generated project files. Currently implements:
 *   - project-manifest.json  (machine-readable)
 *   - final-report.md        (human-readable markdown)
 *
 * Architecture is designed to support future exports:
 *   - project-manifest.json  ✓ (implemented)
 *   - final-report.md        ✓ (implemented)
 *   - zyra-bundle.zip        (future)
 *   - ui-payload.json        (future — UI-optimised subset)
 *   - deployment-vars.env    (future — env file with all required vars)
 */

const { buildFinalDeliveryReport } = require('./build-final-report');

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build all export artifacts for the final package.
 *
 * @param {import('./types').FinalProjectPackage} pkg
 * @param {import('./types').PackagingInput} input
 * @returns {import('./types').ExportArtifacts}
 */
function buildExports(pkg, input) {
  const manifestJson    = _buildManifestJson(pkg);
  const reportMarkdown  = buildFinalDeliveryReport(pkg, input);

  return {
    manifestFile:  'project-manifest.json',
    reportFile:    'final-report.md',
    manifestJson,
    reportMarkdown,
  };
}

/**
 * Convert export artifacts to file entries that can be written to disk
 * alongside generated project files.
 *
 * @param {import('./types').ExportArtifacts} exports
 * @returns {Array<{path: string, content: string}>}
 */
function exportArtifactsToFiles(exports) {
  return [
    { path: exports.manifestFile, content: exports.manifestJson },
    { path: exports.reportFile,   content: exports.reportMarkdown },
  ];
}

/**
 * Produce a compact UI-safe payload — strips large markdown / raw file content
 * to keep the API response lean for frontend consumption.
 *
 * @param {import('./types').FinalProjectPackage} pkg
 * @returns {Object}
 */
function buildUiPayload(pkg) {
  return {
    packageStatus:       pkg.packageStatus,
    projectName:         pkg.manifest.projectName,
    projectId:           pkg.manifest.projectId,
    appType:             pkg.manifest.appType,
    platforms:           pkg.manifest.platforms,
    stack:               pkg.manifest.stack,
    complexityTier:      pkg.manifest.complexityTier,
    complexityScore:     pkg.manifest.complexityScore,
    features:            pkg.manifest.features,
    integrations:        pkg.manifest.integrations,
    fileCount:           pkg.manifest.fileCount,
    generatedAt:         pkg.manifest.generatedAt,
    packagedAt:          pkg.manifest.packagedAt,

    readiness:           pkg.readiness,

    summary:             pkg.summary,

    installCommand:      pkg.setup.installCommand,
    devCommand:          pkg.setup.devCommand,
    buildCommand:        pkg.setup.buildCommand,
    startCommand:        pkg.setup.startCommand,
    deployNotes:         pkg.setup.deployNotes,

    requiredEnvVars:     pkg.setup.requiredEnvVars.map(v => ({
      name:        v.name,
      description: v.description,
      required:    v.required,
      hasDefault:  v.hasDefault,
      category:    v.category,
    })),
    optionalEnvVars:     pkg.setup.optionalEnvVars.map(v => v.name),

    integrations:        pkg.setup.integrations.map(i => ({
      name:        i.name,
      requiresKey: i.requiresKey,
      configured:  i.configured,
      setupNote:   i.setupNote,
    })),

    warnings:            pkg.warnings.slice(0, 10),
    manualReviewCount:   pkg.manualReviewRequired.length,
    manualReviewRequired: pkg.manualReviewRequired.slice(0, 5),

    exportFiles: [
      pkg.exports.manifestFile,
      pkg.exports.reportFile,
    ],
  };
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _buildManifestJson(pkg) {
  // Strip the large file content array and markdown report from the JSON manifest
  // — those are stored separately on disk
  const manifestData = {
    packageStatus: pkg.packageStatus,
    manifest:      pkg.manifest,
    readiness:     pkg.readiness,
    summary:       pkg.summary,
    setup: {
      ...pkg.setup,
      // Omit the verbose envSetupSteps (they're in the markdown report)
    },
    warnings:             pkg.warnings,
    manualReviewRequired: pkg.manualReviewRequired,
    exports: {
      manifestFile: pkg.exports.manifestFile,
      reportFile:   pkg.exports.reportFile,
    },
  };

  try {
    return JSON.stringify(manifestData, null, 2);
  } catch (_) {
    return JSON.stringify({ error: 'Could not serialize manifest', packageStatus: pkg.packageStatus }, null, 2);
  }
}

module.exports = { buildExports, exportArtifactsToFiles, buildUiPayload };
