'use strict';

/**
 * JSDoc type definitions for the Repair / Self-Healing / Completion system.
 */

// ── Enumerations ─────────────────────────────────────────────────────────────

/**
 * @typedef {'safe_auto_repair'|'conditional_auto_repair'|'manual_review_required'|'do_not_touch'} RepairabilityClass
 * How a validator issue can be handled:
 *   safe_auto_repair        — low-risk, deterministic, apply automatically
 *   conditional_auto_repair — evidence-grounded, apply with intent confirmation
 *   manual_review_required  — too risky or uncertain for automatic repair
 *   do_not_touch            — dangerous / out of scope for this system
 */

/**
 * @typedef {'created_file'|'updated_file'|'added_dependency'|'added_script'|'added_env_var'|'injected_code'|'skipped'|'manual_review'|'deferred'} RepairIssueAction
 */

/**
 * @typedef {'no_repairs_needed'|'repaired'|'repaired_with_warnings'|'repaired_with_manual_items'|'manual_review_required'|'repair_failed'} RepairStatus
 */

// ── Core data shapes ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} RepairIssueDecision
 * The decision made by classifyRepairability for a single issue.
 * @property {string}               issueId
 * @property {RepairabilityClass}   repairability
 * @property {number}               confidence     - 0–1
 * @property {string}               rationale      - why this classification
 * @property {string[]}             filesAffected  - paths that would change
 * @property {boolean}              willAutoRepair
 */

/**
 * @typedef {Object} RepairIssueResult
 * The outcome after attempting to repair a single issue.
 * @property {string}               issueId
 * @property {RepairIssueAction}    action
 * @property {string}               [path]         - primary file affected
 * @property {string}               reason
 * @property {RepairabilityClass}   safety
 * @property {number}               confidence
 */

/**
 * @typedef {Object} RepairReport
 * Structured output from the repair pass.
 * @property {RepairStatus}         status
 * @property {number}               scoreImprovement   - validationScore delta (positive = better)
 * @property {number}               scoreBefore
 * @property {number}               scoreAfter
 * @property {RepairIssueResult[]}  repairedIssues
 * @property {RepairIssueResult[]}  skippedIssues
 * @property {RepairIssueResult[]}  manualReviewRequired
 * @property {RepairIssueResult[]}  unresolvedIssues
 * @property {string[]}             updatedFiles       - paths of files that were modified
 * @property {string[]}             createdFiles       - paths of files that were created
 * @property {string[]}             addedDependencies  - package names added to package.json
 * @property {string[]}             addedScripts       - npm script names added
 * @property {string[]}             addedEnvVars       - env var names added to .env.example
 * @property {string}               summary
 */

/**
 * @typedef {Object} RepairInput
 * @property {Array<{path: string, content: string}>}                     files
 * @property {Object}                                                      blueprint
 * @property {Object}                                                      intent
 * @property {Object|null}                                                 complexityReport
 * @property {import('../validator/types').ProjectValidationReport}        validationReport
 * @property {Object|null}                                                 [fileArtifacts]
 */

/**
 * @typedef {Object} RepairResult
 * Return value from repairGeneratedProject.
 * @property {Array<{path: string, content: string}>}  updatedFiles       - final merged file list
 * @property {RepairReport}                            repairReport
 * @property {import('../validator/types').ProjectValidationReport} [postRepairValidation]  - re-run if repairs applied
 */

/**
 * @typedef {Object} RepairContext
 * Mutable context passed to all repair modules.
 * @property {Map<string, string>}                                         fileMap     - mutable
 * @property {Set<string>}                                                 filePaths   - mutable
 * @property {Object}                                                      blueprint
 * @property {Object}                                                      intent
 * @property {Object|null}                                                 complexityReport
 * @property {import('../validator/types').ValidationIssue[]}             issues       - all validator issues
 * @property {Map<string, import('./classifyRepairability').RepairIssueDecision>} decisions - classified decisions
 */

module.exports = {};
