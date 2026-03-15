'use strict';

/**
 * File-Level Generation — Public API
 *
 * Enriches raw {path, content}[] files from the multi-pass generator into
 * structured FileArtifacts with type classification, dependency detection,
 * and quality validation.
 *
 * Usage after multi-pass generation:
 *   const { buildGeneratedProjectFiles } = require('../lib/file-generator');
 *   const projectFiles = buildGeneratedProjectFiles(rawFiles, context);
 *   // projectFiles.artifacts has full metadata per file
 *   // projectFiles.issues has validation warnings
 */

const { buildFileArtifacts }    = require('./buildFileArtifacts');
const { validateFileArtifacts } = require('./validateFileArtifacts');
const { buildFileMap }          = require('./buildFileMap');
const { sortByDependencyOrder } = require('./resolveFileDependencies');
const logger                    = require('../../utils/logger');

/**
 * Main entry point. Takes raw generated files, enriches into FileArtifacts, validates.
 *
 * @param {Array<{path:string, content:string}>} rawFiles
 * @param {import('./types').FileGenerationContext} [context]
 * @returns {import('./types').GeneratedProjectFiles}
 */
function buildGeneratedProjectFiles(rawFiles, context) {
  // Sort by dependency order before enrichment
  const sorted    = sortByDependencyOrder(rawFiles);
  const artifacts = buildFileArtifacts(sorted, context);
  const issues    = validateFileArtifacts(artifacts);

  const totalBytes = artifacts.reduce((sum, a) => sum + a.sizeBytes, 0);

  /** @type {Partial<Record<import('./types').FileType, number>>} */
  const filesByType = {};
  for (const a of artifacts) {
    filesByType[a.type] = (filesByType[a.type] || 0) + 1;
  }

  const hasErrors = issues.some(i => i.severity === 'error');

  logger.info(`fileGenerator: ${artifacts.length} artifacts — ${JSON.stringify(filesByType)} — ${issues.length} issues (errors=${issues.filter(i => i.severity === 'error').length})`);

  return {
    artifacts,
    issues,
    totalFiles:  artifacts.length,
    totalBytes,
    filesByType,
    valid:       !hasErrors,
  };
}

/**
 * Get artifacts of a specific type.
 * @param {import('./types').GeneratedProjectFiles} projectFiles
 * @param {import('./types').FileType} type
 * @returns {import('./types').FileArtifact[]}
 */
function getArtifactsByType(projectFiles, type) {
  return projectFiles.artifacts.filter(a => a.type === type);
}

/**
 * Get only error-level issues.
 * @param {import('./types').GeneratedProjectFiles} projectFiles
 * @returns {import('./types').FileValidationIssue[]}
 */
function getErrors(projectFiles) {
  return projectFiles.issues.filter(i => i.severity === 'error');
}

/**
 * Produce a human-readable summary.
 * @param {import('./types').GeneratedProjectFiles} projectFiles
 * @returns {string}
 */
function summarizeProjectFiles(projectFiles) {
  const typeStr = Object.entries(projectFiles.filesByType)
    .map(([t, n]) => `${n} ${t}`)
    .join(', ');
  const issueStr = projectFiles.issues.length > 0
    ? ` | ${projectFiles.issues.length} issues (${getErrors(projectFiles).length} errors)`
    : ' | no issues';
  return `${projectFiles.totalFiles} files (${typeStr}) — ${Math.round(projectFiles.totalBytes / 1024)}KB${issueStr}`;
}

module.exports = {
  buildGeneratedProjectFiles,
  buildFileMap,
  getArtifactsByType,
  getErrors,
  summarizeProjectFiles,
};
