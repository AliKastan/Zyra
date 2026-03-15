'use strict';

/**
 * BUILD REPAIR REPORT
 *
 * Assembles the final RepairReport from all module results. Computes:
 *   - before/after score delta (re-uses scoring logic from validator)
 *   - per-issue result summary
 *   - overall repair status
 *   - skipped issues (manual_review / do_not_touch)
 *
 * @param {Object} opts
 * @param {import('./types').RepairIssueResult[][]} opts.moduleResults   - array of result arrays from each repair module
 * @param {import('./types').RepairIssueDecision[]} opts.decisions       - flat array from classifyRepairability
 * @param {import('../validator/types').ProjectValidationReport} opts.beforeReport
 * @param {import('../validator/types').ProjectValidationReport} [opts.afterReport]  - optional post-repair re-validation
 * @param {Map<string,string>} opts.fileMap     - final mutable file map
 * @param {Set<string>} opts.filePaths
 * @param {number} opts.durationMs
 * @returns {import('./types').RepairReport}
 */
function buildRepairReport({ moduleResults, decisions, beforeReport, afterReport, fileMap, filePaths, durationMs }) {
  // Flatten all results
  /** @type {import('./types').RepairIssueResult[]} */
  const allResults = moduleResults.flat();

  // Build decisions map for quick lookup
  const decisionMap = new Map(decisions.map(d => [d.issueId, d]));

  // ── Score delta ────────────────────────────────────────────────────────────
  const scoreBefore = beforeReport.score ?? 0;
  const scoreAfter  = afterReport  ? (afterReport.score ?? scoreBefore) : _estimateAfterScore(scoreBefore, allResults, beforeReport);
  const scoreDelta  = scoreAfter - scoreBefore;

  // ── Counts ─────────────────────────────────────────────────────────────────
  const repairedCount = allResults.filter(r => r.action !== 'skipped').length;
  const skippedIssues = _collectSkipped(beforeReport.issues || [], decisionMap);

  // ── Status ─────────────────────────────────────────────────────────────────
  const status = _computeStatus(scoreAfter, afterReport, repairedCount, skippedIssues.length);

  // ── Files modified/created ─────────────────────────────────────────────────
  const filesCreated  = [...new Set(allResults.filter(r => r.action === 'created_file').map(r => r.path))];
  const filesModified = [...new Set(allResults.filter(r => r.action === 'updated_file' || r.action === 'injected_code').map(r => r.path))];

  // ── Readiness delta ────────────────────────────────────────────────────────
  const readinessBefore = beforeReport.readiness || _emptyReadiness();
  const readinessAfter  = afterReport?.readiness  || _estimateReadiness(afterReport || beforeReport, allResults);

  return {
    status,

    scoreBefore,
    scoreAfter,
    scoreDelta,

    repairedCount,
    skippedCount: skippedIssues.length,

    results:        allResults,
    skippedIssues,
    decisions,

    filesCreated,
    filesModified,

    readinessBefore,
    readinessAfter,

    durationMs,

    summary: _buildSummary(status, repairedCount, skippedIssues.length, scoreDelta, filesCreated.length, filesModified.length),
  };
}

// ── Score estimation ───────────────────────────────────────────────────────────

const ISSUE_DEDUCTIONS = { critical: 15, major: 8, medium: 3, minor: 1 };

/**
 * Estimate the post-repair score by removing deductions for repaired issues.
 */
function _estimateAfterScore(scoreBefore, results, beforeReport) {
  if (!beforeReport.issues) return scoreBefore;

  const repairedIssueIds = new Set(results.filter(r => r.action !== 'skipped').map(r => r.issueId));

  let bonus = 0;
  for (const issue of beforeReport.issues) {
    if (repairedIssueIds.has(issue.id)) {
      bonus += ISSUE_DEDUCTIONS[issue.severity] || 0;
    }
  }

  return Math.min(100, scoreBefore + bonus);
}

// ── Status computation ────────────────────────────────────────────────────────

function _computeStatus(scoreAfter, afterReport, repairedCount, skippedCount) {
  const hasCritical = afterReport ? (afterReport.criticalIssues?.length > 0) : false;

  if (hasCritical)          return 'critical_remaining';
  if (scoreAfter >= 85)     return 'fully_repaired';
  if (scoreAfter >= 70)     return 'mostly_repaired';
  if (repairedCount > 0)    return 'partially_repaired';
  if (skippedCount > 0)     return 'manual_review_required';
  return 'no_repairs_needed';
}

// ── Skipped issues ────────────────────────────────────────────────────────────

function _collectSkipped(allIssues, decisionMap) {
  return allIssues
    .filter(issue => {
      const d = decisionMap.get(issue.id);
      return !d || !d.willAutoRepair;
    })
    .map(issue => {
      const d = decisionMap.get(issue.id);
      return {
        issueId:          issue.id,
        severity:         issue.severity,
        message:          issue.message,
        file:             issue.file || null,
        repairability:    d?.repairability || 'manual_review_required',
        reason:           d?.reason || 'Requires manual intervention',
        suggestion:       issue.suggestion || null,
      };
    });
}

// ── Readiness helpers ──────────────────────────────────────────────────────────

function _emptyReadiness() {
  return {
    architectureReady: false,
    deployReady:       false,
    authReady:         false,
    billingReady:      false,
    integrationReady:  false,
  };
}

function _estimateReadiness(report, results) {
  // Start from beforeReport readiness and flip flags where repairs fixed things
  const r = report.readiness || _emptyReadiness();
  const repairedIds = new Set(results.filter(r2 => r2.action !== 'skipped').map(r2 => r2.issueId));

  return {
    architectureReady: r.architectureReady || repairedIds.has('missing_auth_file') || repairedIds.has('js_broken_require'),
    deployReady:       r.deployReady       || repairedIds.has('missing_health_route') || repairedIds.has('hardcoded_port'),
    authReady:         r.authReady         || repairedIds.has('missing_auth_file') || repairedIds.has('missing_login_page'),
    billingReady:      r.billingReady      || repairedIds.has('missing_billing_file') || repairedIds.has('missing_billing_checkout'),
    integrationReady:  r.integrationReady  || [...repairedIds].some(id => id.startsWith('missing_integration_file:')),
  };
}

// ── Summary string ────────────────────────────────────────────────────────────

function _buildSummary(status, repaired, skipped, delta, created, modified) {
  const statusLabels = {
    fully_repaired:         'Fully repaired',
    mostly_repaired:        'Mostly repaired',
    partially_repaired:     'Partially repaired',
    critical_remaining:     'Critical issues remain',
    manual_review_required: 'Manual review required',
    no_repairs_needed:      'No repairs needed',
  };
  const label = statusLabels[status] || status;
  const parts = [`${label}.`];
  if (repaired > 0) parts.push(`${repaired} issue${repaired !== 1 ? 's' : ''} fixed`);
  if (created  > 0) parts.push(`${created} file${created !== 1 ? 's' : ''} created`);
  if (modified > 0) parts.push(`${modified} file${modified !== 1 ? 's' : ''} updated`);
  if (delta    > 0) parts.push(`score +${delta}`);
  if (skipped  > 0) parts.push(`${skipped} require manual review`);
  return parts.join('. ') + (parts.length > 1 ? '.' : '');
}

module.exports = { buildRepairReport };
