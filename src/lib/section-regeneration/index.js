'use strict';

/**
 * Section Regeneration — Public API
 *
 * Production-grade regeneration-by-section system for Zyra.
 * Determines which parts of a generated project need to change
 * based on a follow-up user prompt, then builds a structured plan.
 *
 * No LLM calls — purely deterministic planning layer.
 */

const { detectChangeType, isFullRegenerationRequired }       = require('./detect-change-type');
const { analyzeSectionImpact }                                = require('./analyze-section-impact');
const { mapSectionsToFiles, getSectionForFile, getFilesForSection, partitionFilesBySection } = require('./map-sections-to-files');
const { buildRegenerationPlan, estimatePlanCost }             = require('./build-regeneration-plan');
const { selectRegenerationStrategy, validatePlanSafety }      = require('./select-regeneration-strategy');
const { mergeRegeneratedSections, computeFileDiff, patchEnvExample } = require('./merge-regenerated-sections');
const { runSelectiveValidation, buildSelectiveValidationScope } = require('./run-selective-validation');
const { runSelectiveRepair, buildSelectiveRepairScope }        = require('./run-selective-repair');
const {
  buildSectionRegenerationReport,
  buildUiSectionRegenerationPayload,
  summarizeSectionRegeneration,
} = require('./build-section-regeneration-report');

// Section-specific regenerators
const { regenerateUiSection }          = require('./regenerate-ui-section');
const { regenerateAuthSection }        = require('./regenerate-auth-section');
const { regenerateBillingSection }     = require('./regenerate-billing-section');
const { regenerateIntegrationSection } = require('./regenerate-integration-section');
const { regenerateAdminSection }       = require('./regenerate-admin-section');
const { regenerateDeploymentSection }  = require('./regenerate-deployment-section');
const { regenerateUxStatesSection }    = require('./regenerate-ux-states-section');

// ── Section Regenerator Map ────────────────────────────────────────────────────

const SECTION_REGENERATORS = {
  'ui-presentation':  regenerateUiSection,
  'design-system':    regenerateUiSection,
  'auth':             regenerateAuthSection,
  'billing':          regenerateBillingSection,
  'integrations':     regenerateIntegrationSection,
  'admin':            regenerateAdminSection,
  'deployment':       regenerateDeploymentSection,
  'ux-states':        regenerateUxStatesSection,
};

// ── Main Orchestration Entry Point ────────────────────────────────────────────

/**
 * Run the full section-regeneration planning pipeline.
 *
 * This is the single entry point for callers (editService, orchestrator, etc.).
 * It does NOT call any LLM — it produces a structured plan that guides generation.
 *
 * @param {Object} input
 * @param {string}   input.userPrompt           - The follow-up user message
 * @param {Object.<string,string>} [input.currentFiles] - Existing project files
 * @param {Object}   [input.projectContext]      - Project metadata (slug, appType, platform, etc.)
 * @param {Object}   [input.intentMemory]        - Intent memory from prior interactions
 * @param {Object}   [input.opts]
 * @param {boolean}  [input.opts.forceFullValidation=false]
 * @param {boolean}  [input.opts.forceRepair=false]
 * @param {boolean}  [input.opts.skipMergeStep=false] - Set true when no regeneratedFiles available
 * @param {Object.<string,string>} [input.regeneratedFiles] - New files from section generation
 * @param {string[]} [input.warnings]
 * @returns {import('./types').SectionRegenerationReport}
 */
function runSectionRegeneration(input) {
  const {
    userPrompt      = '',
    currentFiles    = {},
    projectContext  = {},
    intentMemory    = null,
    opts            = {},
    regeneratedFiles = null,
    warnings:       extraWarnings = [],
  } = input;

  // Stage 1: Detect change type
  const changeDetection = detectChangeType(userPrompt, intentMemory);

  // Stage 2: Analyze section impact
  const impact = analyzeSectionImpact(changeDetection, projectContext);

  // Stage 3: Map files to sections
  const allSections = [...impact.primarySections, ...impact.secondarySections];
  const fileMapping = mapSectionsToFiles(allSections, currentFiles);

  // Stage 4: Build regeneration plan
  const plan = buildRegenerationPlan(changeDetection, impact, fileMapping, {
    ...projectContext,
    existingFiles: currentFiles,
  });

  // Stage 5: Select strategy
  const strategy = selectRegenerationStrategy(plan, opts);

  // Stage 6: Safety check
  const safetyResult = validatePlanSafety(plan);
  const allWarnings  = [
    ...extraWarnings,
    ...(safetyResult.warnings || []),
  ];

  // Stage 7: Merge (if regenerated files are provided)
  let mergeResult = null;
  if (regeneratedFiles && !opts.skipMergeStep) {
    mergeResult = mergeRegeneratedSections(currentFiles, regeneratedFiles, plan);
  }

  // Stage 8: Selective validation (if merged files available)
  let validationResult = null;
  if (mergeResult?.mergedFiles) {
    const vr = runSelectiveValidation(plan, mergeResult.mergedFiles, opts);
    validationResult = vr.report;
    if (vr.scope?.rationale) {
      allWarnings.push(...(vr.report?.warnings || []));
    }
  }

  // Stage 9: Selective repair (if merged files available)
  let repairResult = null;
  if (mergeResult?.mergedFiles) {
    const rr = runSelectiveRepair(plan, mergeResult.mergedFiles, opts);
    repairResult = rr.report;
  }

  // Stage 10: Build final report
  return buildSectionRegenerationReport({
    userPrompt,
    changeDetection,
    impact,
    plan,
    strategy,
    mergeResult,
    validationResult,
    repairResult,
    warnings: allWarnings,
  });
}

/**
 * Build the section-specific regeneration spec for a single section.
 * Returns null if no regenerator is registered for the given section.
 *
 * @param {string} sectionType
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object} [context]
 * @returns {import('./types').SectionRegenerationSpec|null}
 */
function buildSectionSpec(sectionType, plan, context = {}) {
  const regenerator = SECTION_REGENERATORS[sectionType];
  if (!regenerator) return null;
  return regenerator(plan, context);
}

/**
 * Build specs for all primary sections in the plan.
 *
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object} [context]
 * @returns {Object.<string, import('./types').SectionRegenerationSpec>}
 */
function buildAllSectionSpecs(plan, context = {}) {
  const specs = {};
  for (const section of (plan.impact?.primarySections || [])) {
    const spec = buildSectionSpec(section, plan, context);
    if (spec) specs[section] = spec;
  }
  return specs;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // Main entry point
  runSectionRegeneration,

  // Individual pipeline stages (for callers that need fine-grained control)
  detectChangeType,
  isFullRegenerationRequired,
  analyzeSectionImpact,
  mapSectionsToFiles,
  getSectionForFile,
  getFilesForSection,
  partitionFilesBySection,
  buildRegenerationPlan,
  estimatePlanCost,
  selectRegenerationStrategy,
  validatePlanSafety,
  mergeRegeneratedSections,
  computeFileDiff,
  patchEnvExample,
  runSelectiveValidation,
  buildSelectiveValidationScope,
  runSelectiveRepair,
  buildSelectiveRepairScope,
  buildSectionRegenerationReport,
  buildUiSectionRegenerationPayload,
  summarizeSectionRegeneration,

  // Section spec builders
  buildSectionSpec,
  buildAllSectionSpecs,
  SECTION_REGENERATORS,

  // Individual section regenerators
  regenerateUiSection,
  regenerateAuthSection,
  regenerateBillingSection,
  regenerateIntegrationSection,
  regenerateAdminSection,
  regenerateDeploymentSection,
  regenerateUxStatesSection,
};
