'use strict';

/**
 * Prevention Report Builder
 *
 * Assembles all detected issues, injected defaults, and adjustments into
 * a structured PreventionReport with status determination and a human-readable summary.
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the final prevention report from all check results.
 *
 * @param {import('./types').PreventionIssue[]}         issues
 * @param {import('./types').SafeDefaultInjection[]}    injectedDefaults
 * @param {import('./types').GenerationAdjustment[]}    generationAdjustments
 * @param {import('./types').PreventionIssue[]}         inFlightIssues
 * @returns {import('./types').PreventionReport}
 */
function buildPreventionReport(issues, injectedDefaults, generationAdjustments, inFlightIssues = []) {
  const allIssues = [...issues, ...inFlightIssues];

  // Split into prevented vs warnings vs unresolved
  const preventedIssues = allIssues.filter(i =>
    i.action === 'prevented_automatically' ||
    i.action === 'safe_default_injected'   ||
    i.action === 'generation_hint_added',
  );

  const warnings = allIssues
    .filter(i => i.action === 'warning_only')
    .map(i => ({
      id:       i.id,
      severity: i.severity,
      message:  i.reason,
      category: i.category,
    }));

  const unresolvedRisks = allIssues
    .filter(i => i.action === 'manual_review_required')
    .map(i => ({
      id:           i.id,
      severity:     i.severity,
      message:      i.reason,
      manualAction: i.fix,
    }));

  // Status determination
  const status = _determineStatus(preventedIssues, warnings, unresolvedRisks, generationAdjustments);

  // Summary
  const summary = _buildSummary(status, preventedIssues, warnings, unresolvedRisks, generationAdjustments);

  return {
    status,
    preventedIssues,
    warnings,
    generationAdjustments,
    unresolvedRisks,
    injectedDefaults,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * One-line summary for logs.
 * @param {import('./types').PreventionReport} report
 * @returns {string}
 */
function summarizePreventionReport(report) {
  return [
    `status="${report.status}"`,
    `prevented=${report.preventedIssues.length}`,
    `warnings=${report.warnings.length}`,
    `adjustments=${report.generationAdjustments.length}`,
    `injected=${report.injectedDefaults.length}`,
    `unresolved=${report.unresolvedRisks.length}`,
  ].join(' ');
}

/**
 * Build a lean UI payload from the prevention report.
 * @param {import('./types').PreventionReport} report
 * @returns {Object}
 */
function buildUiPreventionPayload(report) {
  return {
    status:               report.status,
    preventedCount:       report.preventedIssues.length,
    warningCount:         report.warnings.length,
    adjustmentCount:      report.generationAdjustments.length,
    unresolvedCount:      report.unresolvedRisks.length,
    adjustments:          report.generationAdjustments.slice(0, 8),
    warnings:             report.warnings.map(w => w.message).slice(0, 5),
    unresolvedRisks:      report.unresolvedRisks.map(r => r.message).slice(0, 3),
    injectedFiles:        report.injectedDefaults.filter(d => d.file).map(d => d.file),
    summary:              report.summary,
  };
}

// ── Private helpers ─────────────────────────────────────────────────────────

/**
 * @param {import('./types').PreventionIssue[]} prevented
 * @param {import('./types').PreventionWarning[]} warnings
 * @param {import('./types').UnresolvedRisk[]} unresolved
 * @param {import('./types').GenerationAdjustment[]} adjustments
 * @returns {import('./types').PreventionStatus}
 */
function _determineStatus(prevented, warnings, unresolved, adjustments) {
  if (unresolved.some(r => r.severity === 'critical')) return 'manual_review_risk_present';
  if (adjustments.length === 0 && warnings.length === 0 && prevented.length === 0) return 'no_risks_detected';
  if (unresolved.length > 0) return 'manual_review_risk_present';
  if (prevented.some(i => i.severity === 'high' || i.severity === 'critical')) return 'adjusted_with_preventions';
  if (adjustments.length > 0) return 'adjusted_with_preventions';
  if (warnings.length > 0) return 'warnings_only';
  return 'no_risks_detected';
}

function _buildSummary(status, prevented, warnings, unresolved, adjustments) {
  const parts = [];

  if (prevented.length > 0) {
    const high = prevented.filter(i => i.severity === 'high' || i.severity === 'critical');
    parts.push(`${prevented.length} issue${prevented.length > 1 ? 's' : ''} prevented (${high.length} high-severity)`);
  }

  if (adjustments.length > 0) {
    parts.push(`${adjustments.length} generation adjustment${adjustments.length > 1 ? 's' : ''} applied`);
  }

  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning${warnings.length > 1 ? 's' : ''} remain`);
  }

  if (unresolved.length > 0) {
    parts.push(`${unresolved.length} risk${unresolved.length > 1 ? 's' : ''} require manual review`);
  }

  if (parts.length === 0) return 'No structural risks detected — generation plan looks sound.';

  const statusLabel = {
    no_risks_detected:           'No risks detected.',
    adjusted_with_preventions:   'Several predictable structural issues were prevented before generation.',
    warnings_only:               'Minor risks detected — review warnings.',
    generation_adjustment_required: 'Generation plan requires adjustment.',
    manual_review_risk_present:  'Some risks require manual review after generation.',
  }[status] || status;

  return `${statusLabel} ${parts.join(', ')}.`;
}

module.exports = { buildPreventionReport, summarizePreventionReport, buildUiPreventionPayload };
