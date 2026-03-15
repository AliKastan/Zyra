'use strict';

/**
 * JSDoc type definitions for the Generation Validator system.
 *
 * These types are shared across all validator sub-modules and the public API.
 */

// ── Enumerations ─────────────────────────────────────────────────────────────

/**
 * @typedef {'critical'|'major'|'medium'|'minor'} IssueSeverity
 * Severity of a single validation issue.
 *   critical — structural blocker; app cannot work without fixing this
 *   major    — functional gap; feature is broken or missing
 *   medium   — quality / deployment concern
 *   minor    — polish / best-practice suggestion
 */

/**
 * @typedef {'pass'|'warning'|'fail'} CheckStatus
 * Outcome of a single validator check category.
 *   pass    — no issues at all
 *   warning — only minor or medium issues
 *   fail    — at least one critical or major issue
 */

/**
 * @typedef {'passed'|'passed_with_warnings'|'needs_repair'|'failed'} ProjectStatus
 * Overall outcome of the full validation run.
 *   passed               — score ≥ 85 with no critical issues
 *   passed_with_warnings — score ≥ 70 with no critical issues
 *   needs_repair         — score ≥ 50 or has critical issues
 *   failed               — score < 50
 */

// ── Core data shapes ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} ValidationIssue
 * @property {string}        id          - unique machine-readable identifier
 * @property {IssueSeverity} severity
 * @property {string}        message     - human-readable description
 * @property {string}        [file]      - file path the issue is in, if applicable
 * @property {string}        [suggestion] - recommended fix
 * @property {boolean}       [llmRefined] - true if added by optional LLM refinement pass
 */

/**
 * @typedef {Object} ValidationCheckResult
 * @property {CheckStatus}       status
 * @property {ValidationIssue[]} issues
 */

/**
 * @typedef {Object} ValidationChecks
 * @property {ValidationCheckResult} files
 * @property {ValidationCheckResult} imports
 * @property {ValidationCheckResult} dependencies
 * @property {ValidationCheckResult} scripts
 * @property {ValidationCheckResult} env
 * @property {ValidationCheckResult} auth
 * @property {ValidationCheckResult} database
 * @property {ValidationCheckResult} billing
 * @property {ValidationCheckResult} integrations
 * @property {ValidationCheckResult} routes
 * @property {ValidationCheckResult} uxStates
 * @property {ValidationCheckResult} adminRoles
 * @property {ValidationCheckResult} deployment
 * @property {ValidationCheckResult} platform
 */

/**
 * @typedef {Object} ValidationReadiness
 * @property {boolean} architectureReady - files + imports check passing
 * @property {boolean} deployReady       - deployment + env + scripts passing
 * @property {boolean} authReady         - auth check passing (or auth not required)
 * @property {boolean} billingReady      - billing check passing (or billing not required)
 * @property {boolean} integrationReady  - integrations check passing (or none required)
 */

/**
 * @typedef {Object} ProjectValidationReport
 * @property {ProjectStatus}         status
 * @property {number}                score            - 0–100
 * @property {string}                summary
 * @property {ValidationChecks}      checks
 * @property {ValidationIssue[]}     issues           - flat array of ALL issues (repair-engine compatible)
 * @property {ValidationIssue[]}     criticalIssues
 * @property {string[]}              warnings         - human-readable warning strings
 * @property {string[]}              missingFiles
 * @property {string[]}              missingDependencies
 * @property {string[]}              missingEnvVars
 * @property {string[]}              suggestedRepairs
 * @property {ValidationReadiness}   readiness
 * @property {boolean}               passed           - true when status is 'passed' or 'passed_with_warnings'
 */

/**
 * @typedef {Object} ValidatorInput
 * @property {Array<{path: string, content: string}>} files           - generated files
 * @property {Object}                                 blueprint        - AppBlueprint from Stage 4
 * @property {Object}                                 intent           - enriched GenerationIntent
 * @property {Object|null}                            complexityReport - AppComplexityReport
 * @property {Object|null}                            [fileArtifacts]  - GeneratedProjectFiles from Stage 5.5
 */

/**
 * @typedef {Object} ValidatorContext
 * Prepared once from ValidatorInput and passed to all check modules.
 * @property {Map<string, string>}                    fileMap          - path → content (O(1) lookup)
 * @property {Set<string>}                            filePaths        - all normalized file paths
 * @property {Object}                                 blueprint
 * @property {Object}                                 intent
 * @property {Object|null}                            complexityReport
 * @property {Object|null}                            fileArtifacts
 */

module.exports = {};
