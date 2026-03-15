'use strict';

/**
 * BUILD VALIDATION REPORT
 *
 * Assembles a ProjectValidationReport from the results of all 14 check modules.
 * Computes the score, overall status, readiness flags, and suggested repairs.
 *
 * Scoring (start at 100, deduct per issue):
 *   critical: −15
 *   major:    −8
 *   medium:   −3
 *   minor:    −1
 *   Clamped to 0–100.
 *
 * Overall status:
 *   passed               — score ≥ 85, no critical issues
 *   passed_with_warnings — score ≥ 70, no critical issues
 *   needs_repair         — score ≥ 50 OR has critical issues
 *   failed               — score < 50
 */

const DEDUCTIONS = { critical: 15, major: 8, medium: 3, minor: 1 };

/**
 * @param {import('./types').ValidationChecks}     checks
 * @param {import('./types').ValidatorContext}      ctx
 * @returns {import('./types').ProjectValidationReport}
 */
function buildReport(checks, ctx) {
  // ── Flat issues list ──────────────────────────────────────────────────────
  const allIssues = [
    ...checks.files.issues,
    ...checks.imports.issues,
    ...checks.dependencies.issues,
    ...checks.scripts.issues,
    ...checks.env.issues,
    ...checks.auth.issues,
    ...checks.database.issues,
    ...checks.billing.issues,
    ...checks.integrations.issues,
    ...checks.routes.issues,
    ...checks.uxStates.issues,
    ...checks.adminRoles.issues,
    ...checks.deployment.issues,
    ...checks.platform.issues,
  ];

  // ── Score ──────────────────────────────────────────────────────────────────
  let score = 100;
  for (const issue of allIssues) {
    score -= DEDUCTIONS[issue.severity] || 0;
  }
  score = Math.max(0, Math.min(100, score));

  // ── Overall status ────────────────────────────────────────────────────────
  const criticalIssues = allIssues.filter(i => i.severity === 'critical');
  const hasCritical    = criticalIssues.length > 0;

  /** @type {import('./types').ProjectStatus} */
  let status;
  if (!hasCritical && score >= 85) {
    status = 'passed';
  } else if (!hasCritical && score >= 70) {
    status = 'passed_with_warnings';
  } else if (score >= 50 || hasCritical) {
    status = 'needs_repair';
  } else {
    status = 'failed';
  }

  // ── Per-check statuses (already set on each check result) ─────────────────
  // Re-derive for clean output consistency
  const checksWithStatus = _normalizeChecks(checks);

  // ── Warnings list (human-readable strings) ────────────────────────────────
  const warnings = allIssues
    .filter(i => i.severity === 'medium' || i.severity === 'minor')
    .map(i => `[${i.file || 'project'}] ${i.message}`);

  // ── Missing collections ───────────────────────────────────────────────────
  const missingFiles = allIssues
    .filter(i => i.id.startsWith('missing_blueprint_file:') || i.id.startsWith('missing_spec_file:') || i.id.startsWith('missing_page:'))
    .map(i => i.file)
    .filter(Boolean);

  const missingDependencies = allIssues
    .filter(i => i.id.startsWith('missing_dependency:'))
    .map(i => i.id.replace('missing_dependency:', ''));

  const missingEnvVars = allIssues
    .filter(i => i.id.startsWith('undeclared_env_var:') || i.id.startsWith('missing_integration_env:'))
    .map(i => {
      const parts = i.id.split(':');
      return parts[parts.length - 1];
    });

  // ── Suggested repairs ─────────────────────────────────────────────────────
  const suggestedRepairs = _buildSuggestedRepairs(allIssues);

  // ── Readiness flags ───────────────────────────────────────────────────────
  const readiness = _buildReadiness(checks, ctx.intent);

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = _buildSummary(status, score, criticalIssues.length, allIssues.length);

  return {
    status,
    score,
    summary,
    checks:               checksWithStatus,
    issues:               allIssues,         // flat array — repair engine compatible
    criticalIssues,
    warnings,
    missingFiles:         [...new Set(missingFiles)],
    missingDependencies:  [...new Set(missingDependencies)],
    missingEnvVars:       [...new Set(missingEnvVars)],
    suggestedRepairs,
    readiness,
    passed:               status === 'passed' || status === 'passed_with_warnings',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Ensure each check result has the correct status derived from its issues.
 * @param {import('./types').ValidationChecks} checks
 * @returns {import('./types').ValidationChecks}
 */
function _normalizeChecks(checks) {
  const result = {};
  for (const [key, check] of Object.entries(checks)) {
    result[key] = {
      status: _deriveCheckStatus(check.issues),
      issues: check.issues,
    };
  }
  return /** @type {import('./types').ValidationChecks} */ (result);
}

/**
 * @param {import('./types').ValidationIssue[]} issues
 * @returns {import('./types').CheckStatus}
 */
function _deriveCheckStatus(issues) {
  if (!issues || issues.length === 0) return 'pass';
  if (issues.some(i => i.severity === 'critical' || i.severity === 'major')) return 'fail';
  return 'warning';
}

/**
 * Build human-readable repair suggestions from critical and major issues.
 * @param {import('./types').ValidationIssue[]} allIssues
 * @returns {string[]}
 */
function _buildSuggestedRepairs(allIssues) {
  return allIssues
    .filter(i => i.severity === 'critical' || i.severity === 'major')
    .map(i => i.suggestion || i.message)
    .filter(Boolean)
    .slice(0, 20); // cap at 20 for readability
}

/**
 * @param {import('./types').ValidationChecks} checks
 * @param {Object} intent
 * @returns {import('./types').ValidationReadiness}
 */
function _buildReadiness(checks, intent) {
  const isCheckOk = (check) => check.status === 'pass' || check.status === 'warning';

  return {
    architectureReady: isCheckOk(checks.files) && isCheckOk(checks.imports),
    deployReady:       isCheckOk(checks.deployment) && isCheckOk(checks.env) && isCheckOk(checks.scripts),
    authReady:         !intent.needsAuth || isCheckOk(checks.auth),
    billingReady:      !intent.needsPayments || isCheckOk(checks.billing),
    integrationReady:  isCheckOk(checks.integrations),
  };
}

/**
 * @param {import('./types').ProjectStatus} status
 * @param {number} score
 * @param {number} criticalCount
 * @param {number} totalCount
 * @returns {string}
 */
function _buildSummary(status, score, criticalCount, totalCount) {
  if (status === 'passed') {
    return `Project passed validation with score ${score}/100 and no issues.`;
  }
  if (status === 'passed_with_warnings') {
    return `Project is structurally sound (score ${score}/100) with ${totalCount} minor/medium issue${totalCount !== 1 ? 's' : ''} to address.`;
  }
  if (status === 'needs_repair') {
    const critStr = criticalCount > 0 ? ` including ${criticalCount} critical` : '';
    return `Project needs repair: score ${score}/100 with ${totalCount} issue${totalCount !== 1 ? 's' : ''}${critStr}.`;
  }
  return `Project failed validation: score ${score}/100 with ${totalCount} issues — significant structural gaps detected.`;
}

module.exports = { buildReport };
