'use strict';

/**
 * Generation Validator — Public API
 *
 * Runs a comprehensive structural validation of the generated project and
 * produces a rich ProjectValidationReport.
 *
 * Architecture:
 *   1. Build ValidatorContext (fileMap, filePaths, intent, blueprint, etc.)
 *   2. Run all 14 deterministic check modules in sequence
 *   3. Assemble ProjectValidationReport via buildReport
 *   4. Optionally enhance with LLM semantic pass (VALIDATOR_LLM_ENABLED=true)
 *
 * Usage:
 *   const { validateGeneratedProject } = require('../lib/validator');
 *   const report = validateGeneratedProject({ files, blueprint, intent, complexityReport });
 */

const { validateFileMap }         = require('./validateFileMap');
const { validateImports }         = require('./validateImports');
const { validateDependencies }    = require('./validateDependencies');
const { validateScripts }         = require('./validateScripts');
const { validateEnv }             = require('./validateEnv');
const { validateAuth }            = require('./validateAuth');
const { validateDatabase }        = require('./validateDatabase');
const { validateBilling }         = require('./validateBilling');
const { validateIntegrations }    = require('./validateIntegrations');
const { validateRoutes }          = require('./validateRoutes');
const { validateUxStates }        = require('./validateUxStates');
const { validateAdminRoles }      = require('./validateAdminRoles');
const { validateDeployment }      = require('./validateDeployment');
const { validatePlatform }        = require('./validatePlatform');
const { buildReport }             = require('./buildReport');
const logger                      = require('../../utils/logger');

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the full generation validator on the generated project.
 *
 * @param {import('./types').ValidatorInput} input
 * @returns {import('./types').ProjectValidationReport}
 */
function validateGeneratedProject(input) {
  const ctx = _buildContext(input);

  const checks = {
    files:        _safe(() => validateFileMap(ctx),       'validateFileMap'),
    imports:      _safe(() => validateImports(ctx),       'validateImports'),
    dependencies: _safe(() => validateDependencies(ctx),  'validateDependencies'),
    scripts:      _safe(() => validateScripts(ctx),       'validateScripts'),
    env:          _safe(() => validateEnv(ctx),           'validateEnv'),
    auth:         _safe(() => validateAuth(ctx),          'validateAuth'),
    database:     _safe(() => validateDatabase(ctx),      'validateDatabase'),
    billing:      _safe(() => validateBilling(ctx),       'validateBilling'),
    integrations: _safe(() => validateIntegrations(ctx),  'validateIntegrations'),
    routes:       _safe(() => validateRoutes(ctx),        'validateRoutes'),
    uxStates:     _safe(() => validateUxStates(ctx),      'validateUxStates'),
    adminRoles:   _safe(() => validateAdminRoles(ctx),    'validateAdminRoles'),
    deployment:   _safe(() => validateDeployment(ctx),    'validateDeployment'),
    platform:     _safe(() => validatePlatform(ctx),      'validatePlatform'),
  };

  const report = buildReport(checks, ctx);

  logger.debug(`validator: score=${report.score} status="${report.status}" issues=${report.issues.length} critical=${report.criticalIssues.length}`);

  return report;
}

// ── Helper functions (exported for orchestrator, repair engine, UI) ───────────

/**
 * Returns all critical issues from a validation report.
 * @param {import('./types').ProjectValidationReport} report
 * @returns {import('./types').ValidationIssue[]}
 */
function getCriticalValidationIssues(report) {
  return report.criticalIssues || [];
}

/**
 * Returns suggested repair strings from a validation report.
 * @param {import('./types').ProjectValidationReport} report
 * @returns {string[]}
 */
function getSuggestedRepairs(report) {
  return report.suggestedRepairs || [];
}

/**
 * Returns a compact readiness summary for the orchestrator / UI.
 * @param {import('./types').ProjectValidationReport} report
 * @returns {{ score: number, status: string, readiness: import('./types').ValidationReadiness, criticalCount: number, warningCount: number }}
 */
function getReadinessSummary(report) {
  return {
    score:         report.score,
    status:        report.status,
    readiness:     report.readiness,
    criticalCount: report.criticalIssues.length,
    warningCount:  report.warnings.length,
  };
}

/**
 * Returns a single-line summary string suitable for server logs.
 * @param {import('./types').ProjectValidationReport} report
 * @returns {string}
 */
function summarizeValidationReport(report) {
  const r = report.readiness;
  const flags = [
    r.architectureReady  ? null : 'arch-broken',
    r.deployReady        ? null : 'not-deploy-ready',
    r.authReady          ? null : 'auth-incomplete',
    r.billingReady       ? null : 'billing-incomplete',
    r.integrationReady   ? null : 'integrations-incomplete',
  ].filter(Boolean);

  const flagStr = flags.length > 0 ? ` flags=[${flags.join(',')}]` : '';
  return `validator: score=${report.score} status="${report.status}" critical=${report.criticalIssues.length} warnings=${report.warnings.length}${flagStr}`;
}

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * @param {import('./types').ValidatorInput} input
 * @returns {import('./types').ValidatorContext}
 */
function _buildContext(input) {
  const files    = input.files || [];
  const fileMap  = new Map(files.map(f => [_normalizePath(f.path), f.content || '']));
  const filePaths = new Set(fileMap.keys());

  return {
    fileMap,
    filePaths,
    blueprint:       input.blueprint       || {},
    intent:          input.intent          || {},
    complexityReport: input.complexityReport || null,
    fileArtifacts:   input.fileArtifacts   || null,
  };
}

function _normalizePath(p) {
  // Normalize backslashes and strip leading ./
  let normalized = (p || '').replace(/\\/g, '/');
  if (normalized.startsWith('./')) normalized = normalized.slice(2);
  return normalized;
}

// ── Safe wrapper for individual checks ────────────────────────────────────────

/**
 * Runs a check function and returns a pass result on error to prevent one
 * failing check from breaking the entire validation run.
 * @param {() => import('./types').ValidationCheckResult} fn
 * @param {string} name
 * @returns {import('./types').ValidationCheckResult}
 */
function _safe(fn, name) {
  try {
    return fn();
  } catch (err) {
    logger.warn(`validator: ${name} threw unexpectedly (${err.message}) — check skipped`);
    return { status: 'pass', issues: [] };
  }
}

// ── Optional LLM refinement ───────────────────────────────────────────────────

/**
 * Async variant that also runs an optional LLM semantic refinement pass.
 * Gated by VALIDATOR_LLM_ENABLED=true.
 *
 * @param {import('./types').ValidatorInput} input
 * @param {Object} [cost] - cost tracker instance
 * @returns {Promise<import('./types').ProjectValidationReport>}
 */
async function validateGeneratedProjectAsync(input, cost) {
  const report = validateGeneratedProject(input);

  if (process.env.VALIDATOR_LLM_ENABLED !== 'true') {
    return report;
  }

  try {
    const refined = await _runLlmRefinement(report, input, cost);
    return refined;
  } catch (err) {
    logger.warn(`validator: LLM refinement failed (${err.message}), returning deterministic report`);
    return report;
  }
}

/**
 * LLM refinement: asks Claude to identify semantic issues that the
 * deterministic checks cannot catch. Only APPENDS issues — never removes them.
 *
 * @param {import('./types').ProjectValidationReport} report
 * @param {import('./types').ValidatorInput} input
 * @param {Object} [cost]
 * @returns {Promise<import('./types').ProjectValidationReport>}
 */
async function _runLlmRefinement(report, input, cost) {
  const { callClaude, SONNET_MODEL } = require('../../providers/anthropicProvider');
  const { safeJsonParse }            = require('../../utils/safeJsonParse');

  // Build a concise snapshot of the project for Claude to review
  const fileNames  = (input.files || []).map(f => f.path).join(', ');
  const issuesSoFar = report.issues.map(i => `[${i.severity}] ${i.message}`).slice(0, 20).join('\n');

  const system = `You are a code quality reviewer. Analyze the provided project file list and existing issues, then identify any ADDITIONAL semantic issues not already caught.
Return ONLY a JSON array of new issues (may be empty []).
Each issue: {"id": string, "severity": "major"|"medium"|"minor", "message": string, "file"?: string, "suggestion"?: string, "llmRefined": true}
Focus on: logical inconsistencies, missing wiring between related files, architectural gaps.
Do NOT repeat issues already listed. Do NOT add critical issues (only deterministic checks may do that).`;

  const user = `Project files: ${fileNames}

Existing detected issues:
${issuesSoFar || '(none)'}

App type: ${input.intent?.appType || 'unknown'}
Auth required: ${input.intent?.needsAuth || false}
Database required: ${input.intent?.needsDatabase || false}
Payments required: ${input.intent?.needsPayments || false}

Return additional semantic issues as a JSON array. Return [] if none found.`;

  const raw = await callClaude(system, user, { model: SONNET_MODEL, maxTokens: 1000 });
  if (cost) cost.record('validator_llm', system, user, raw, { model: SONNET_MODEL });

  // Extract JSON array from response
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return report;

  const { success, data } = safeJsonParse(arrayMatch[0]);
  if (!success || !Array.isArray(data)) return report;

  const llmIssues = data
    .filter(i => i && typeof i.message === 'string' && i.severity)
    .map(i => ({ ...i, llmRefined: true }));

  if (llmIssues.length === 0) return report;

  logger.debug(`validator: LLM refinement added ${llmIssues.length} additional issue(s)`);

  // Rebuild report with added LLM issues in the appropriate check
  const enrichedReport = {
    ...report,
    issues: [...report.issues, ...llmIssues],
  };

  // Re-compute score and status with added issues
  let newScore = report.score;
  const DEDUCTIONS = { critical: 15, major: 8, medium: 3, minor: 1 };
  for (const issue of llmIssues) {
    newScore -= DEDUCTIONS[issue.severity] || 0;
  }
  newScore = Math.max(0, Math.min(100, newScore));

  enrichedReport.score = newScore;
  enrichedReport.warnings = [...report.warnings, ...llmIssues.filter(i => i.severity === 'medium' || i.severity === 'minor').map(i => `[${i.file || 'project'}] ${i.message}`)];
  enrichedReport.suggestedRepairs = [...report.suggestedRepairs, ...llmIssues.filter(i => i.severity === 'major').map(i => i.suggestion || i.message)];

  return enrichedReport;
}

module.exports = {
  validateGeneratedProject,
  validateGeneratedProjectAsync,
  getCriticalValidationIssues,
  getSuggestedRepairs,
  getReadinessSummary,
  summarizeValidationReport,
};
