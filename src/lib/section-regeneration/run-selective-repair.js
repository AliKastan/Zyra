'use strict';

/**
 * Selective Repair
 *
 * Runs repair only on sections affected by regeneration.
 * Reuses the existing repair system from lib/repair but scopes
 * it to the affected file set.
 *
 * For low-risk changes, skip repair entirely or run minimal passes.
 * For high-risk changes (auth, billing, database), run targeted repair.
 */

// Repair passes that apply to each section
const SECTION_REPAIR_PASSES = {
  'auth':         ['auth-repair', 'env-repair'],
  'billing':      ['billing-repair', 'env-repair', 'authenticity-repair'],
  'integrations': ['integration-repair', 'env-repair'],
  'backend-api':  ['route-repair', 'error-handler-repair'],
  'admin':        ['auth-repair', 'route-repair'],
  'database':     ['model-repair'],
  'deployment':   ['env-repair', 'script-repair'],
  'ui-presentation': ['css-repair'],
  'design-system':   ['css-repair'],
  'ux-states':       ['ux-repair'],
  'routes-pages':    ['route-repair'],
  'mobile-shell':    ['navigation-repair'],
};

// Risk levels that trigger repair (low risk = no repair needed)
const REPAIR_RISK_THRESHOLD = new Set(['medium', 'high', 'critical']);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Determine the repair scope for a regeneration plan.
 *
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object} [opts]
 * @param {boolean} [opts.forceRepair=false] - Run repair even for low-risk changes
 * @returns {{ passesToRun: string[], scopedFiles: string[], skipRepair: boolean, rationale: string }}
 */
function buildSelectiveRepairScope(plan, opts = {}) {
  const { forceRepair = false } = opts;
  const { impact, filesToRegenerate, filesToPatch } = plan;

  const riskWarrantsRepair = REPAIR_RISK_THRESHOLD.has(impact.riskLevel);

  // Skip repair for low-risk changes unless forced
  if (!forceRepair && !riskWarrantsRepair && !plan.isFullRegeneration) {
    return {
      passesToRun:  [],
      scopedFiles:  [],
      skipRepair:   true,
      rationale:    `Low-risk change (${impact.riskLevel}) — repair skipped to preserve speed`,
    };
  }

  const sectionsToRepair = [...new Set([
    ...(impact.repairRequired || []),
    ...(impact.primarySections || []),
  ])];

  const passesToRun = [...new Set(
    sectionsToRepair.flatMap(s => SECTION_REPAIR_PASSES[s] || []),
  )];

  const scopedFiles = [...new Set([...filesToRegenerate, ...filesToPatch])];

  return {
    passesToRun,
    scopedFiles,
    skipRepair:   false,
    rationale:    `Selective repair (${impact.riskLevel}): passes=${passesToRun.join(',')} on ${scopedFiles.length} files`,
  };
}

/**
 * Run selective repair using the existing repair system.
 * Wraps lib/repair with a scoped file set.
 *
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object.<string,string>} files - File set to repair (post-merge)
 * @param {Object} [opts]
 * @param {boolean} [opts.forceRepair=false]
 * @returns {{ scope: Object, report: Object | null, repairApplied: boolean }}
 */
function runSelectiveRepair(plan, files, opts = {}) {
  const scope = buildSelectiveRepairScope(plan, opts);

  if (scope.skipRepair) {
    return { scope, report: null, repairApplied: false };
  }

  // Build scoped file set
  const scopedFileSet = {};
  for (const fp of scope.scopedFiles) {
    if (files[fp]) scopedFileSet[fp] = files[fp];
  }
  // Add package.json and .env.example for context
  if (files['package.json'])  scopedFileSet['package.json']  = files['package.json'];
  if (files['.env.example'])  scopedFileSet['.env.example']  = files['.env.example'];

  // Attempt to call the existing repair system (non-fatal)
  let report = null;
  let repairApplied = false;
  try {
    const { repairGeneratedProject } = require('../repair');
    report       = repairGeneratedProject({ files: scopedFileSet, passes: scope.passesToRun });
    repairApplied = true;
  } catch (_) {
    // Repair system not available — return scope only
    report = null;
    repairApplied = false;
  }

  return {
    scope,
    report,
    repairApplied,
    filesRepaired: Object.keys(scopedFileSet).length,
  };
}

module.exports = {
  buildSelectiveRepairScope,
  runSelectiveRepair,
  SECTION_REPAIR_PASSES,
  REPAIR_RISK_THRESHOLD,
};
