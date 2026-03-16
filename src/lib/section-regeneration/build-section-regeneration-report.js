'use strict';

/**
 * Section Regeneration Report Builder
 *
 * Assembles the final SectionRegenerationReport from all pipeline outputs.
 * This is the authoritative output of the section-regeneration system.
 */

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the final SectionRegenerationReport.
 *
 * @param {Object} input
 * @param {string}   input.userPrompt
 * @param {import('./types').ChangeDetection}          input.changeDetection
 * @param {import('./types').SectionImpactAnalysis}    input.impact
 * @param {import('./types').RegenerationPlan}         input.plan
 * @param {import('./types').RegenerationStrategy}     input.strategy
 * @param {import('./types').MergeResult|null}         [input.mergeResult]
 * @param {Object|null}   [input.validationResult]
 * @param {Object|null}   [input.repairResult]
 * @param {string[]}      [input.warnings]
 * @returns {import('./types').SectionRegenerationReport}
 */
function buildSectionRegenerationReport(input) {
  const {
    userPrompt      = '',
    changeDetection,
    impact,
    plan,
    strategy,
    mergeResult     = null,
    validationResult = null,
    repairResult     = null,
    warnings:       extraWarnings = [],
  } = input;

  // Determine status
  const status = _computeStatus(strategy, mergeResult, extraWarnings);

  // Collect all warnings
  const allWarnings = [
    ...(mergeResult?.warnings || []),
    ...(validationResult?.warnings || []),
    ...extraWarnings,
  ];

  // Collect placeholder conversions (sections using placeholder mode)
  const placeholderConversions = _collectPlaceholderConversions(plan, strategy);

  const regeneratedFiles = mergeResult?.replaced || [];
  const patchedFiles     = mergeResult?.patched   || [];
  const preservedFiles   = mergeResult?.preserved || [];
  const createdFiles     = mergeResult?.created   || [];
  const impactedFiles    = [...new Set([...regeneratedFiles, ...patchedFiles, ...createdFiles])];

  return {
    status,
    changeType:        changeDetection.changeType,
    requestedChange:   userPrompt.slice(0, 200),
    primarySections:   impact.primarySections,
    secondarySections: impact.secondarySections,
    preservedSections: impact.preserveSections,
    impactedFiles,
    regeneratedFiles,
    patchedFiles,
    preservedFiles,
    createdFiles,
    validationScope:   plan.validationScope || [],
    repairScope:       plan.repairScope     || [],
    placeholderConversions,
    warnings:          allWarnings,
    summary:           _buildSummary(
      changeDetection, impact, strategy, impactedFiles, preservedFiles, allWarnings,
    ),
    plan,
    strategy,
    fullRegenerationRequired: impact.fullRegenerationRequired,
    fullRegenerationReason:   impact.fullRegenerationReason || '',
  };
}

/**
 * Build a UI-safe payload from a SectionRegenerationReport.
 *
 * @param {import('./types').SectionRegenerationReport} report
 * @returns {Object}
 */
function buildUiSectionRegenerationPayload(report) {
  if (!report) return null;
  return {
    status:                   report.status,
    changeType:               report.changeType,
    requestedChange:          report.requestedChange,
    primarySections:          report.primarySections,
    preservedSections:        report.preservedSections,
    impactedFilesCount:       report.impactedFiles.length,
    preservedFilesCount:      report.preservedFiles.length,
    regeneratedFilesCount:    report.regeneratedFiles.length,
    patchedFilesCount:        report.patchedFiles.length,
    createdFilesCount:        report.createdFiles.length,
    validationScope:          report.validationScope,
    repairScope:              report.repairScope,
    warnings:                 report.warnings.slice(0, 5),
    summary:                  report.summary,
    fullRegenerationRequired: report.fullRegenerationRequired,
    fullRegenerationReason:   report.fullRegenerationReason,
    savingsRationale:         _buildSavingsRationale(report),
  };
}

/**
 * One-line log summary of a section regeneration report.
 *
 * @param {import('./types').SectionRegenerationReport} report
 * @returns {string}
 */
function summarizeSectionRegeneration(report) {
  const { changeType, primarySections, impactedFiles, preservedFiles, status } = report;
  return (
    `status="${status}" change="${changeType}" ` +
    `sections=[${primarySections.join(',')}] ` +
    `impacted=${impactedFiles.length} preserved=${preservedFiles.length}`
  );
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _computeStatus(strategy, mergeResult, warnings) {
  if (strategy?.strategy === 'full_regeneration') {
    return 'full_regeneration_required';
  }
  if (strategy?.strategy === 'no_regeneration_needed') {
    return 'no_regeneration_needed';
  }
  if (!mergeResult) {
    return 'section_regeneration_planned';
  }
  if (warnings.length > 0) {
    return 'section_regeneration_completed_with_warnings';
  }
  return 'section_regeneration_completed';
}

function _buildSummary(changeDetection, impact, strategy, impacted, preserved, warnings) {
  const { changeType } = changeDetection;
  const primary = impact.primarySections.join(', ') || 'none';

  if (strategy?.strategy === 'full_regeneration') {
    return `Full regeneration required: ${impact.fullRegenerationReason}`;
  }
  if (strategy?.strategy === 'no_regeneration_needed') {
    return 'No regeneration needed — the change does not affect generated files';
  }

  let msg = `${changeType}: ${primary} section(s) regenerated. `;
  msg    += `${impacted.length} file(s) updated, ${preserved.length} file(s) preserved. `;

  if (warnings.length > 0) {
    msg += `${warnings.length} warning(s): ${warnings[0]}`;
  } else {
    msg += 'No warnings.';
  }
  return msg;
}

function _collectPlaceholderConversions(plan, strategy) {
  if (!plan?.fileMapping) return [];
  const conversions = [];
  for (const mapping of plan.fileMapping) {
    if (mapping.section === 'integrations' || mapping.section === 'billing') {
      conversions.push(`${mapping.section}: may require environment variable configuration`);
    }
  }
  return conversions;
}

function _buildSavingsRationale(report) {
  if (report.fullRegenerationRequired) return 'Full regeneration — no savings';
  const total     = report.impactedFiles.length + report.preservedFiles.length;
  const preserved = report.preservedFiles.length;
  if (total === 0) return 'No files processed';
  const pct = Math.round((preserved / total) * 100);
  return `${pct}% of files preserved — ${preserved}/${total} files untouched`;
}

module.exports = {
  buildSectionRegenerationReport,
  buildUiSectionRegenerationPayload,
  summarizeSectionRegeneration,
};
