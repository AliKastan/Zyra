'use strict';

/**
 * REPAIR ENGINE — Public API
 *
 * Stage 7.1 deterministic structural repair system.
 * Runs before the existing LLM repair pass (Stage 7).
 *
 * Architecture:
 *   1. classifyRepairability — tag each issue with a repair tier
 *   2. Run 11 repair modules in dependency order (env → deps → scripts →
 *      deployment → missing files → auth → billing → integrations → database →
 *      routes → ux states → consistency)
 *   3. Optionally re-validate to compute score delta
 *   4. buildRepairReport — assemble the final RepairReport
 *
 * Usage:
 *   const { repairGeneratedProject } = require('../lib/repair');
 *   const result = repairGeneratedProject({ files, validationReport, blueprint, intent, complexityReport });
 */

const { classifyAllIssues }      = require('./classifyRepairability');
const { repairEnv }              = require('./repairEnv');
const { repairDependencies }     = require('./repairDependencies');
const { repairScripts }          = require('./repairScripts');
const { repairDeployment }       = require('./repairDeployment');
const { repairMissingFiles }     = require('./repairMissingFiles');
const { repairAuth }             = require('./repairAuth');
const { repairBilling }          = require('./repairBilling');
const { repairIntegrations }     = require('./repairIntegrations');
const { repairDatabase }         = require('./repairDatabase');
const { repairRoutes }           = require('./repairRoutes');
const { repairUxStates }         = require('./repairUxStates');
const { repairConsistency }      = require('./repairConsistency');
const { buildRepairReport }      = require('./buildRepairReport');
const logger                     = require('../../utils/logger');

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the full deterministic repair pass on the generated project.
 *
 * @param {import('./types').RepairInput} input
 * @returns {import('./types').RepairResult}
 */
function repairGeneratedProject(input) {
  const startMs = Date.now();

  const {
    files            = [],
    validationReport,
    blueprint        = {},
    intent           = {},
    complexityReport = null,
  } = input;

  // ── Build mutable context ──────────────────────────────────────────────────
  const fileMap   = new Map(files.map(f => [_normalizePath(f.path), f.content || '']));
  const filePaths = new Set(fileMap.keys());

  const issues  = validationReport.issues || [];
  const decisions = classifyAllIssues(issues, { intent, fileMap, filePaths, blueprint, complexityReport });

  /** @type {import('./types').RepairContext} */
  const ctx = {
    fileMap,
    filePaths,
    issues,
    decisions,
    blueprint,
    intent,
    complexityReport,
  };

  // ── Run modules in dependency order ───────────────────────────────────────
  const moduleResults = [
    _safe(() => repairEnv(ctx),           'repairEnv'),
    _safe(() => repairDependencies(ctx),  'repairDependencies'),
    _safe(() => repairScripts(ctx),       'repairScripts'),
    _safe(() => repairDeployment(ctx),    'repairDeployment'),
    _safe(() => repairMissingFiles(ctx),  'repairMissingFiles'),
    _safe(() => repairAuth(ctx),          'repairAuth'),
    _safe(() => repairBilling(ctx),       'repairBilling'),
    _safe(() => repairIntegrations(ctx),  'repairIntegrations'),
    _safe(() => repairDatabase(ctx),      'repairDatabase'),
    _safe(() => repairRoutes(ctx),        'repairRoutes'),
    _safe(() => repairUxStates(ctx),      'repairUxStates'),
    _safe(() => repairConsistency(ctx),   'repairConsistency'),
  ];

  const totalRepaired = moduleResults.flat().filter(r => r.action !== 'skipped').length;
  logger.debug(`repair: ${totalRepaired} repairs applied across ${moduleResults.flat().length} results`);

  // ── Assemble output files ──────────────────────────────────────────────────
  const repairedFiles = [...fileMap.entries()].map(([path, content]) => ({ path, content }));

  // ── Build report ───────────────────────────────────────────────────────────
  const durationMs    = Date.now() - startMs;
  const decisionsArr  = [...decisions.values()];

  const repairReport = buildRepairReport({
    moduleResults,
    decisions: decisionsArr,
    beforeReport: validationReport,
    afterReport:  null, // orchestrator may supply post-repair re-validation
    fileMap,
    filePaths,
    durationMs,
  });

  logger.debug(`repair: score ${repairReport.scoreBefore} → ~${repairReport.scoreAfter} (+${repairReport.scoreDelta}) in ${durationMs}ms — status="${repairReport.status}"`);

  return {
    repairedFiles,
    repairReport,
    fileMap,
    filePaths,
  };
}

// ── Helper exports (for orchestrator / UI) ────────────────────────────────────

/**
 * Classify issues from a validation report (without running repairs).
 * @param {import('../validator/types').ValidationIssue[]} issues
 * @param {Object} intent
 * @returns {Map<string, import('./types').RepairIssueDecision>}
 */
function classifyIssues(issues, intent) {
  return classifyAllIssues(issues, { intent, fileMap: new Map(), filePaths: new Set(), blueprint: {}, complexityReport: null });
}

/**
 * Filter issues to only those that will be auto-repaired.
 * @param {import('../validator/types').ValidationIssue[]} issues
 * @param {Object} intent
 * @returns {import('../validator/types').ValidationIssue[]}
 */
function getAutoRepairableIssues(issues, intent) {
  const decisions = classifyAllIssues(issues, { intent, fileMap: new Map(), filePaths: new Set(), blueprint: {}, complexityReport: null });
  return issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair;
  });
}

/**
 * Filter issues that require manual review.
 * @param {import('../validator/types').ValidationIssue[]} issues
 * @param {Object} intent
 * @returns {import('../validator/types').ValidationIssue[]}
 */
function getManualReviewIssues(issues, intent) {
  const decisions = classifyAllIssues(issues, { intent, fileMap: new Map(), filePaths: new Set(), blueprint: {}, complexityReport: null });
  return issues.filter(i => {
    const d = decisions.get(i.id);
    return !d || !d.willAutoRepair;
  });
}

/**
 * One-line string for server logs.
 * @param {import('./types').RepairReport} report
 * @returns {string}
 */
function summarizeRepairReport(report) {
  return `repair: ${report.status} score=${report.scoreBefore}→${report.scoreAfter}(+${report.scoreDelta}) repaired=${report.repairedCount} skipped=${report.skippedCount} files_created=${report.filesCreated.length} files_modified=${report.filesModified.length} duration=${report.durationMs}ms`;
}

/**
 * Merge repair results back into a project artifacts structure.
 * @param {Object} projectArtifacts  - from buildGeneratedProjectFiles
 * @param {import('./types').RepairResult} repairResult
 * @returns {Object}
 */
function mergeRepairResultsIntoProjectArtifacts(projectArtifacts, repairResult) {
  if (!projectArtifacts) return { files: repairResult.repairedFiles, repairReport: repairResult.repairReport };

  return {
    ...projectArtifacts,
    files:       repairResult.repairedFiles,
    repairReport: repairResult.repairReport,
    totalFiles:  repairResult.repairedFiles.length,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _normalizePath(p) {
  let n = (p || '').replace(/\\/g, '/');
  if (n.startsWith('./')) n = n.slice(2);
  return n;
}

/**
 * Safe wrapper — prevents one module crash from stopping the pipeline.
 */
function _safe(fn, name) {
  try {
    return fn();
  } catch (err) {
    logger.warn(`repair: ${name} threw unexpectedly (${err.message}) — module skipped`);
    return [];
  }
}

module.exports = {
  repairGeneratedProject,
  classifyIssues,
  getAutoRepairableIssues,
  getManualReviewIssues,
  summarizeRepairReport,
  mergeRepairResultsIntoProjectArtifacts,
};
