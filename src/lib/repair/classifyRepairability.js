'use strict';

/**
 * REPAIR DECISION ENGINE
 *
 * Classifies every validator issue into a repairability tier and determines
 * whether it should be auto-repaired, conditionally repaired, deferred for
 * manual review, or left untouched.
 *
 * Classification tiers:
 *   safe_auto_repair        — low-risk, deterministic, structural
 *   conditional_auto_repair — evidence-grounded but context-dependent
 *   manual_review_required  — risky or uncertain; human should decide
 *   do_not_touch            — out of scope / destructive
 */

// ── Safe auto-repair: exact issue IDs ────────────────────────────────────────

const SAFE_AUTO_REPAIR_IDS = new Set([
  // File map
  'missing_env_example',
  'missing_readme',
  'missing_package_json',
  'missing_readme_deploy',
  'empty_env_example',

  // Scripts
  'missing_start_script',
  'missing_dev_script',
  'no_scripts',

  // Deployment
  'missing_health_route',
  'missing_env_example_deploy',
  'hardcoded_port',

  // Env
  'missing_env_example_with_vars',
  'missing_stripe_secret_env',
  'missing_stripe_publishable_env',
  'missing_db_env_var',

  // Platform
  'missing_index_html',
  'missing_html_entry_point',
]);

// ── Safe auto-repair: issue ID prefixes ──────────────────────────────────────

const SAFE_AUTO_REPAIR_PREFIXES = [
  'undeclared_env_var:',
  'missing_dependency:',
  'missing_integration_env:',
  'empty_script:',
  'hardcoded_localhost:',
  'missing_integration_file:',
  'thin_readme',
];

// ── Conditional auto-repair (requires strong context evidence) ───────────────

const CONDITIONAL_AUTO_REPAIR_IDS = new Set([
  // Auth
  'missing_auth_file',
  'missing_login_page',
  'missing_signup_page',

  // Billing
  'missing_billing_file',
  'missing_billing_ui',

  // DB
  'missing_db_client',
  'missing_schema_file',

  // Admin
  'missing_admin_page',
  'missing_mobile_screens',

  // Routes
  'missing_dashboard_page',
  'missing_profile_page',
  'missing_app_entry',
  'missing_navigator',
  'missing_screens',
  'missing_app_config',
  'missing_backend_layer',
  'missing_frontend_layer',
]);

const CONDITIONAL_AUTO_REPAIR_PREFIXES = [
  'missing_blueprint_file:',
  'missing_spec_file:',
  'missing_page:',
  'js_broken_require:',
  'js_broken_import:',
  'html_broken_src:',
  'html_broken_href:',
  'css_broken_import:',
  'js_broken_dynamic_import:',
];

// ── Manual review required ────────────────────────────────────────────────────

const MANUAL_REVIEW_IDS = new Set([
  'missing_auth_logic',
  'missing_auth_middleware',
  'missing_logout',
  'missing_role_checks',
  'missing_billing_webhook',
  'missing_checkout_flow',
  'missing_crud_operations',
  'missing_data_models',
  'billing_stub_detected',
  'missing_rbac',
  'missing_role_model',
  'missing_management_operations',
  'missing_billing_integration',
  'missing_navigation_container',
  'missing_integration_init',
  'missing_loading_state',
  'missing_error_state',
  'missing_empty_state',
  'missing_form_validation',
]);

const MANUAL_REVIEW_PREFIXES = [
  'missing_data_models:',
  'missing_integration_init:',
  'missing_crud',
  'billing_stub',
];

// ── Do not touch ──────────────────────────────────────────────────────────────

const DO_NOT_TOUCH_IDS = new Set([
  'invalid_package_json',
]);

// ── Main classification function ──────────────────────────────────────────────

/**
 * Classify a single validator issue for repairability.
 *
 * @param {import('../validator/types').ValidationIssue} issue
 * @param {import('./types').RepairContext}               ctx
 * @returns {import('./types').RepairIssueDecision}
 */
function classifyRepairability(issue, ctx) {
  const { id, severity } = issue;
  const { intent, fileMap } = ctx;

  // ── Do not touch ────────────────────────────────────────────────────────────
  if (DO_NOT_TOUCH_IDS.has(id)) {
    return _decision(id, 'do_not_touch', 1.0, 'Destructive or out-of-scope operation', false, []);
  }

  // ── Safe auto-repair: exact match ───────────────────────────────────────────
  if (SAFE_AUTO_REPAIR_IDS.has(id)) {
    return _decision(id, 'safe_auto_repair', 0.95, 'Structural, low-risk, deterministic', true, _filesFor(issue));
  }

  // ── Safe auto-repair: prefix match ─────────────────────────────────────────
  for (const prefix of SAFE_AUTO_REPAIR_PREFIXES) {
    if (id.startsWith(prefix)) {
      return _decision(id, 'safe_auto_repair', 0.90, `Matches safe prefix "${prefix}"`, true, _filesFor(issue));
    }
  }

  // ── Conditional auto-repair: exact match ───────────────────────────────────
  if (CONDITIONAL_AUTO_REPAIR_IDS.has(id)) {
    const confidence = _conditionalConfidence(id, intent, fileMap);
    const willRepair = confidence >= 0.75;
    const rationale  = willRepair
      ? 'Structural scaffold evidenced by intent/blueprint'
      : 'Insufficient context to safely auto-repair';
    return _decision(id, willRepair ? 'conditional_auto_repair' : 'manual_review_required', confidence, rationale, willRepair, _filesFor(issue));
  }

  // ── Conditional auto-repair: prefix match ──────────────────────────────────
  for (const prefix of CONDITIONAL_AUTO_REPAIR_PREFIXES) {
    if (id.startsWith(prefix)) {
      const confidence = 0.80;
      return _decision(id, 'conditional_auto_repair', confidence, `Matches conditional prefix "${prefix}"`, true, _filesFor(issue));
    }
  }

  // ── Manual review: exact match ─────────────────────────────────────────────
  if (MANUAL_REVIEW_IDS.has(id)) {
    return _decision(id, 'manual_review_required', 0.85, 'Requires human judgment or involves business logic', false, _filesFor(issue));
  }

  // ── Manual review: prefix match ────────────────────────────────────────────
  for (const prefix of MANUAL_REVIEW_PREFIXES) {
    if (id.startsWith(prefix)) {
      return _decision(id, 'manual_review_required', 0.70, 'Pattern suggests manual review needed', false, _filesFor(issue));
    }
  }

  // ── Default: promote by severity ───────────────────────────────────────────
  if (severity === 'minor') {
    return _decision(id, 'safe_auto_repair', 0.60, 'Minor issue — safe to attempt structural fix', true, _filesFor(issue));
  }
  if (severity === 'medium') {
    return _decision(id, 'conditional_auto_repair', 0.55, 'Medium issue — attempt with care', true, _filesFor(issue));
  }

  return _decision(id, 'manual_review_required', 0.50, 'Unclassified major/critical issue — defer to manual review', false, _filesFor(issue));
}

/**
 * Classify all issues from a validation report.
 * @param {import('../validator/types').ValidationIssue[]} issues
 * @param {import('./types').RepairContext}                 ctx
 * @returns {Map<string, import('./types').RepairIssueDecision>}
 */
function classifyAllIssues(issues, ctx) {
  const decisions = new Map();
  for (const issue of issues) {
    decisions.set(issue.id, classifyRepairability(issue, ctx));
  }
  return decisions;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _decision(issueId, repairability, confidence, rationale, willAutoRepair, filesAffected) {
  return { issueId, repairability, confidence, rationale, filesAffected, willAutoRepair };
}

function _filesFor(issue) {
  return issue.file ? [issue.file] : [];
}

/**
 * Calculate confidence for conditional repairs based on intent signals.
 * @param {string} id
 * @param {Object} intent
 * @param {Map<string, string>} fileMap
 * @returns {number} 0–1
 */
function _conditionalConfidence(id, intent, fileMap) {
  if (id === 'missing_auth_file' || id === 'missing_login_page' || id === 'missing_signup_page') {
    return intent.needsAuth === true ? 0.90 : 0.30;
  }
  if (id === 'missing_billing_file' || id === 'missing_billing_ui') {
    return intent.needsPayments === true ? 0.90 : 0.30;
  }
  if (id === 'missing_db_client' || id === 'missing_schema_file') {
    return intent.needsDatabase === true ? 0.85 : 0.40;
  }
  if (id === 'missing_admin_page') {
    return intent.isMultiUser === true ? 0.85 : 0.40;
  }
  if (id === 'missing_mobile_screens' || id === 'missing_app_entry' || id === 'missing_navigator' || id === 'missing_screens' || id === 'missing_app_config') {
    return 0.85; // mobile structure — always safe when detected
  }
  if (id.startsWith('missing_blueprint_file:') || id.startsWith('missing_spec_file:') || id.startsWith('missing_page:')) {
    return 0.80; // blueprint-grounded — high confidence
  }
  return 0.75;
}

module.exports = { classifyRepairability, classifyAllIssues };
