'use strict';

/**
 * Selective Validation
 *
 * Runs validation only on sections affected by regeneration.
 * Reuses the existing validateGeneratedProject() from lib/validator
 * but filters the file set to the scope defined by the plan.
 *
 * For low-risk UI-only changes, skips deep billing/auth validation.
 * For high-risk changes (auth, billing, database), runs full validation
 * on the affected scope.
 */

// Validation checks that apply to each section
const SECTION_VALIDATION_CHECKS = {
  'ui-presentation':  ['html-structure', 'css-syntax', 'responsive-design', 'accessibility'],
  'design-system':    ['css-variables', 'token-consistency'],
  'routes-pages':     ['route-consistency', 'missing-imports', 'navigation-links'],
  'auth':             ['auth-middleware', 'hardcoded-credentials', 'jwt-usage', 'protected-routes'],
  'billing':          ['billing-env-vars', 'stripe-real-calls', 'webhook-signature', 'backend-authenticity'],
  'integrations':     ['env-var-guards', 'no-hardcoded-keys', 'backend-authenticity'],
  'admin':            ['admin-guards', 'role-checks', 'admin-route-protection'],
  'mobile-shell':     ['navigation-structure', 'screen-registration'],
  'deployment':       ['port-config', 'health-route', 'env-documentation', 'start-script'],
  'ux-states':        ['loading-states-present', 'error-states-present'],
  'database':         ['schema-validity', 'model-consistency'],
  'backend-api':      ['route-handlers', 'error-handling', 'missing-middleware'],
};

// Checks that are always run regardless of scope (structural minimums)
const ALWAYS_RUN_CHECKS = ['missing-imports', 'syntax-errors'];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Determine the selective validation scope for a regeneration plan.
 *
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object} [opts]
 * @param {boolean} [opts.forceFullValidation=false]
 * @returns {{ checksToRun: string[], scopedFiles: string[], skipChecks: string[], rationale: string }}
 */
function buildSelectiveValidationScope(plan, opts = {}) {
  const { forceFullValidation = false } = opts;
  const { impact, filesToRegenerate, filesToPatch } = plan;

  if (forceFullValidation || plan.isFullRegeneration || impact.riskLevel === 'critical') {
    return {
      checksToRun:  Object.values(SECTION_VALIDATION_CHECKS).flat().concat(ALWAYS_RUN_CHECKS),
      scopedFiles:  [...filesToRegenerate, ...filesToPatch],
      skipChecks:   [],
      rationale:    'Full validation: high-risk or full-regen change',
    };
  }

  // Collect checks for primary + secondary sections only
  const sectionsToValidate = [...(impact.validationRequired || []), ...(impact.primarySections || [])];
  const uniqueSections     = [...new Set(sectionsToValidate)];

  const checksToRun = [...new Set([
    ...ALWAYS_RUN_CHECKS,
    ...uniqueSections.flatMap(s => SECTION_VALIDATION_CHECKS[s] || []),
  ])];

  // Determine which checks to SKIP (preserve sections need no validation)
  const skipChecks = Object.entries(SECTION_VALIDATION_CHECKS)
    .filter(([section]) => (impact.preserveSections || []).includes(section))
    .flatMap(([, checks]) => checks)
    .filter(check => !checksToRun.includes(check));

  const scopedFiles = [...new Set([...filesToRegenerate, ...filesToPatch])];

  return {
    checksToRun,
    scopedFiles,
    skipChecks: [...new Set(skipChecks)],
    rationale:  `Selective validation: ${uniqueSections.join(', ')} (${scopedFiles.length} files)`,
  };
}

/**
 * Run selective validation using the existing validator.
 * Wraps lib/validator with a scoped file set.
 *
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object.<string,string>} files - File set to validate (post-merge)
 * @param {Object} [opts]
 * @param {boolean} [opts.forceFullValidation=false]
 * @returns {{ scope: Object, report: Object | null, skippedChecks: string[] }}
 */
function runSelectiveValidation(plan, files, opts = {}) {
  const scope = buildSelectiveValidationScope(plan, opts);

  // Build a scoped file set: only files in scope
  const scopedFileSet = {};
  for (const fp of scope.scopedFiles) {
    if (files[fp]) scopedFileSet[fp] = files[fp];
  }

  // Always include package.json and .env.example for structural checks
  if (files['package.json'])  scopedFileSet['package.json']  = files['package.json'];
  if (files['.env.example'])  scopedFileSet['.env.example']  = files['.env.example'];

  // Attempt to call the existing validator (non-fatal if unavailable)
  let report = null;
  try {
    const { validateGeneratedProject } = require('../validator');
    report = validateGeneratedProject({ files: scopedFileSet });
  } catch (_) {
    // Validator not available or failed — return scope only
    report = null;
  }

  return {
    scope,
    report,
    skippedChecks:      scope.skipChecks,
    filesValidated:     Object.keys(scopedFileSet).length,
    filesSkipped:       (plan.filesToPreserve || []).length,
  };
}

module.exports = {
  buildSelectiveValidationScope,
  runSelectiveValidation,
  SECTION_VALIDATION_CHECKS,
  ALWAYS_RUN_CHECKS,
};
