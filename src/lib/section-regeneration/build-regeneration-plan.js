'use strict';

/**
 * Regeneration Plan Builder
 *
 * Assembles the full RegenerationPlan from:
 *   - ChangeDetection (what changed)
 *   - SectionImpactAnalysis (which sections are affected)
 *   - FileImpactMappings (which files belong to those sections)
 *   - Project context (existing files, stack, blueprint)
 *
 * The plan is the authoritative decision document — it drives:
 *   - What files to regenerate vs patch vs preserve
 *   - What validation to run
 *   - What repair to run
 *   - What token budget to allocate
 *
 * No LLM calls needed here.
 */

const { SECTION_NEW_FILES } = require('./map-sections-to-files');

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the full regeneration plan.
 *
 * @param {import('./types').ChangeDetection}       changeDetection
 * @param {import('./types').SectionImpactAnalysis} impact
 * @param {import('./types').FileImpactMapping[]}   fileMapping
 * @param {Object} [projectContext]
 * @param {Object.<string,string>} [projectContext.existingFiles]
 * @param {string}   [projectContext.stack]
 * @param {Object}   [projectContext.blueprint]
 * @param {string}   [projectContext.mode='balanced']
 * @returns {import('./types').RegenerationPlan}
 */
function buildRegenerationPlan(changeDetection, impact, fileMapping, projectContext = {}) {
  const { existingFiles = {}, mode = 'balanced' } = projectContext;

  // If full regen required, return early with a simplified plan
  if (impact.fullRegenerationRequired) {
    return _fullRegenPlan(changeDetection, impact);
  }

  // Files belonging to primary sections → full regeneration
  const primarySectionSet  = new Set(impact.primarySections);
  const secondarySectionSet = new Set(impact.secondarySections);

  const filesToRegenerate = [];
  const filesToPatch      = [];
  const filesToPreserve   = [];
  const newFilesNeeded    = [];

  // Build fast lookup: section → file list
  const sectionFileMap = {};
  for (const mapping of fileMapping) {
    sectionFileMap[mapping.section] = mapping.matchedFiles;
  }

  // Categorize existing files
  const allExistingPaths = Object.keys(existingFiles);
  const assignedPrimary  = new Set();
  const assignedSecondary = new Set();

  for (const mapping of fileMapping) {
    if (primarySectionSet.has(mapping.section)) {
      mapping.matchedFiles.forEach(f => assignedPrimary.add(f));
    } else if (secondarySectionSet.has(mapping.section)) {
      mapping.matchedFiles.forEach(f => assignedSecondary.add(f));
    }
  }

  for (const fp of allExistingPaths) {
    if (assignedPrimary.has(fp)) {
      filesToRegenerate.push(fp);
    } else if (assignedSecondary.has(fp)) {
      filesToPatch.push(fp);
    } else {
      filesToPreserve.push(fp);
    }
  }

  // New files expected for primary sections
  for (const section of impact.primarySections) {
    const expectedNew = SECTION_NEW_FILES[section] || [];
    for (const newFile of expectedNew) {
      // Only add if it doesn't already exist in the project
      if (!allExistingPaths.some(p => p.includes(newFile) || newFile.includes(p.split('/').pop()))) {
        newFilesNeeded.push({ path: newFile, section });
      }
    }
  }

  // Compute validation scope
  const validationScope = _dedup([
    ...impact.validationRequired,
    ...impact.primarySections,
  ]);

  // Compute repair scope (only high-risk or explicitly needed)
  const repairScope = impact.riskLevel !== 'low'
    ? _dedup([...impact.repairRequired, ...impact.primarySections])
    : impact.repairRequired.slice();

  // Build scope summary
  const scopeSummary = _buildScopeSummary(changeDetection, impact, filesToRegenerate, filesToPreserve);

  return {
    changeDetection,
    impact,
    fileMapping,
    filesToRegenerate,
    filesToPatch,
    filesToPreserve,
    newFilesNeeded,
    validationScope,
    repairScope,
    scopeSummary,
    isFullRegeneration: false,
  };
}

/**
 * Estimate the token cost of executing a regeneration plan.
 * Used by the Cost Optimizer integration.
 *
 * @param {import('./types').RegenerationPlan} plan
 * @param {string} [mode='balanced']
 * @returns {{ estimatedTokens: number, estimatedFiles: number, savingsVsFullRegen: number }}
 */
function estimatePlanCost(plan, mode = 'balanced') {
  if (plan.isFullRegeneration) {
    return { estimatedTokens: 28000, estimatedFiles: plan.filesToRegenerate.length, savingsVsFullRegen: 0 };
  }

  const TOKENS_PER_FILE = mode === 'quality' ? 1200 : mode === 'fast' ? 400 : 800;
  const estimated       = plan.filesToRegenerate.length * TOKENS_PER_FILE +
                          plan.filesToPatch.length      * Math.round(TOKENS_PER_FILE * 0.3);

  const fullRegenEstimate = (plan.filesToRegenerate.length + plan.filesToPreserve.length + plan.filesToPatch.length) * TOKENS_PER_FILE;
  const savings           = Math.max(0, fullRegenEstimate - estimated);

  return {
    estimatedTokens:       estimated,
    estimatedFiles:        plan.filesToRegenerate.length + plan.filesToPatch.length,
    savingsVsFullRegen:    savings,
    savingsPercent:        fullRegenEstimate > 0 ? Math.round((savings / fullRegenEstimate) * 100) : 0,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _fullRegenPlan(changeDetection, impact) {
  return {
    changeDetection,
    impact,
    fileMapping:        [],
    filesToRegenerate:  [],
    filesToPatch:       [],
    filesToPreserve:    [],
    newFilesNeeded:     [],
    validationScope:    impact.validationRequired,
    repairScope:        impact.repairRequired,
    scopeSummary:       `Full regeneration required: ${impact.fullRegenerationReason}`,
    isFullRegeneration: true,
  };
}

function _buildScopeSummary(changeDetection, impact, regenerate, preserve) {
  const { changeType } = changeDetection;
  const primary = impact.primarySections.join(', ');
  const regen   = regenerate.length;
  const pres    = preserve.length;
  return (
    `${changeType}: regenerating ${primary} section(s). ` +
    `${regen} file(s) to regenerate, ${pres} file(s) preserved. ` +
    `Risk: ${impact.riskLevel}.`
  );
}

function _dedup(arr) {
  return [...new Set(arr)];
}

module.exports = {
  buildRegenerationPlan,
  estimatePlanCost,
};
