'use strict';

/**
 * Regeneration Strategy Selector
 *
 * Decides the top-level regeneration approach for a given plan:
 *
 *   no_regeneration_needed   — nothing materially changed
 *   section_regeneration     — targeted: only affected sections
 *   full_regeneration        — too broad or architectural; entire project
 *
 * Also identifies skippable sections (cache hits, unchanged intent) and
 * estimates the number of files that will be touched.
 */

// Section counts that indicate broad impact
const BROAD_IMPACT_SECTION_COUNT = 6;  // ≥ this many primary sections → full regen

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Select the regeneration strategy for a given plan.
 *
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object} [opts]
 * @param {boolean} [opts.allowFullRegen=true]  - Set false to force section-level even when broad
 * @param {Object}  [opts.intentDiff]           - Result from cost-optimizer intent diff
 * @returns {import('./types').RegenerationStrategy}
 */
function selectRegenerationStrategy(plan, opts = {}) {
  const { allowFullRegen = true } = opts;
  const { impact, changeDetection, filesToRegenerate, filesToPatch, filesToPreserve } = plan;

  // ── Full regeneration required ────────────────────────────────────────────
  if (plan.isFullRegeneration || impact.fullRegenerationRequired) {
    if (allowFullRegen) {
      return {
        strategy:              'full_regeneration',
        reason:                impact.fullRegenerationReason || 'Change requires full regeneration',
        skippedSections:       [],
        estimatedFilesTouched: filesToRegenerate.length + filesToPatch.length + filesToPreserve.length,
      };
    }
    // Caller wants to force section-level even for broad changes
  }

  // ── No regeneration needed ────────────────────────────────────────────────
  if (
    impact.primarySections.length === 0 &&
    impact.secondarySections.length === 0
  ) {
    return {
      strategy:              'no_regeneration_needed',
      reason:                'No sections require regeneration for this change',
      skippedSections:       impact.preserveSections || [],
      estimatedFilesTouched: 0,
    };
  }

  if (filesToRegenerate.length === 0 && filesToPatch.length === 0 && (plan.newFilesNeeded || []).length === 0) {
    return {
      strategy:              'no_regeneration_needed',
      reason:                'All affected sections have no matching files to regenerate',
      skippedSections:       impact.preserveSections || [],
      estimatedFilesTouched: 0,
    };
  }

  // ── Broad impact → recommend full regen ───────────────────────────────────
  if (
    allowFullRegen &&
    impact.primarySections.length >= BROAD_IMPACT_SECTION_COUNT
  ) {
    return {
      strategy:              'full_regeneration',
      reason:                `${impact.primarySections.length} primary sections affected — full regeneration is more efficient`,
      skippedSections:       [],
      estimatedFilesTouched: filesToRegenerate.length + filesToPatch.length + filesToPreserve.length,
    };
  }

  // ── Section regeneration ─────────────────────────────────────────────────
  // Identify sections that can be skipped (unchanged intent, no cache)
  const skippedSections = _computeSkippedSections(impact, opts.intentDiff);
  const estimatedFilesTouched = filesToRegenerate.length + filesToPatch.length + (plan.newFilesNeeded || []).length;

  return {
    strategy:              'section_regeneration',
    reason:                _buildReason(changeDetection, impact, filesToPreserve),
    skippedSections,
    estimatedFilesTouched,
  };
}

/**
 * Check whether a plan is safe to execute selectively (no destructive risk).
 *
 * @param {import('./types').RegenerationPlan} plan
 * @returns {{ safe: boolean, warnings: string[] }}
 */
function validatePlanSafety(plan) {
  const warnings = [];
  const { impact, filesToRegenerate } = plan;

  if (impact.riskLevel === 'critical' || impact.riskLevel === 'high') {
    warnings.push(`High-risk change (${impact.riskLevel}) — recommend review before applying regenerated files`);
  }

  if (filesToRegenerate.some(f => /server\.(?:js|ts)$/i.test(f) || /^index\.(?:js|ts)$/.test(f))) {
    warnings.push('Server entrypoint is in regeneration scope — test runtime carefully after applying');
  }

  if (filesToRegenerate.some(f => /schema|migration/i.test(f))) {
    warnings.push('Database schema/migration files are in scope — verify data compatibility before applying');
  }

  return { safe: warnings.length === 0, warnings };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _computeSkippedSections(impact, intentDiff) {
  if (!intentDiff || intentDiff.changedFields.length === 0) return [];
  // Sections not in primary or secondary can be considered skipped
  return impact.preserveSections || [];
}

function _buildReason(changeDetection, impact, preservedFiles) {
  const { changeType, action } = changeDetection;
  const primary = impact.primarySections.join(', ');
  const pCount  = preservedFiles.length;
  return (
    `${changeType} (${action}): targeting ${primary} — ` +
    `${pCount} file(s) preserved untouched`
  );
}

module.exports = {
  selectRegenerationStrategy,
  validatePlanSafety,
};
