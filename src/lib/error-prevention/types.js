'use strict';

/**
 * JSDoc type definitions for the Error Prevention Layer.
 *
 * Runs as Stage 7 (preflight) and Stage 10.5 (in-flight) of the Zyra pipeline.
 * Proactively prevents common structural, deployment, integration, and generation
 * mistakes before they turn into broken outputs.
 */

// ── Prevention status ───────────────────────────────────────────────────────

/**
 * @typedef {'no_risks_detected'|'adjusted_with_preventions'|'warnings_only'|'generation_adjustment_required'|'manual_review_risk_present'} PreventionStatus
 */

// ── Severity ────────────────────────────────────────────────────────────────

/**
 * @typedef {'low'|'medium'|'high'|'critical'} PreventionSeverity
 */

// ── Category ────────────────────────────────────────────────────────────────

/**
 * @typedef {'scripts'|'env'|'routing'|'auth'|'billing'|'integrations'|'deployment'|'mobile_navigation'|'ux_states'|'dependencies'|'backend_foundation'|'role_access'|'healthcheck'|'port_config'|'stack_coherence'} PreventionCategory
 */

// ── Action taken ────────────────────────────────────────────────────────────

/**
 * @typedef {'prevented_automatically'|'safe_default_injected'|'warning_only'|'generation_hint_added'|'manual_review_required'} PreventionAction
 */

// ── Issue ───────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PreventionIssue
 * @property {string}               id          - unique rule identifier
 * @property {PreventionCategory}   category
 * @property {PreventionSeverity}   severity
 * @property {PreventionAction}     action      - what was done about it
 * @property {string}               reason      - why this is a risk
 * @property {string}               [fix]       - what was injected / suggested
 */

// ── Warning ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PreventionWarning
 * @property {string}               id
 * @property {PreventionSeverity}   severity
 * @property {string}               message
 * @property {string}               [category]
 */

// ── Unresolved risk ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} UnresolvedRisk
 * @property {string}               id
 * @property {PreventionSeverity}   severity
 * @property {string}               message
 * @property {string}               [manualAction] - what the developer should do
 */

// ── Safe default injection ──────────────────────────────────────────────────

/**
 * @typedef {Object} SafeDefaultInjection
 * @property {string}   id           - injection identifier
 * @property {string}   description  - human-readable description
 * @property {string}   [file]       - file added to plan
 * @property {string}   [noteAdded]  - note added to designNotes / generationHints
 */

// ── Generation adjustment ───────────────────────────────────────────────────

/**
 * @typedef {string} GenerationAdjustment - one-line description of what was adjusted
 */

// ── Prevention report ───────────────────────────────────────────────────────

/**
 * @typedef {Object} PreventionReport
 * @property {PreventionStatus}         status
 * @property {PreventionIssue[]}        preventedIssues      - issues that were handled automatically
 * @property {PreventionWarning[]}      warnings             - issues flagged but not auto-resolved
 * @property {GenerationAdjustment[]}   generationAdjustments - list of adjustments made to blueprint/plan
 * @property {UnresolvedRisk[]}         unresolvedRisks      - issues that remain and require manual attention
 * @property {SafeDefaultInjection[]}   injectedDefaults     - safe defaults that were added to the plan
 * @property {string}                   summary
 * @property {string}                   generatedAt
 */

// ── Input ───────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PreventionInput
 * @property {Object}   intent           - from Stage 1 (analyzeIntent)
 * @property {Object}   [product]        - from Stage 2 (planProduct)
 * @property {Object}   [stack]          - from Stage 3 (planStack)
 * @property {Object}   [blueprint]      - enriched blueprint (post design system)
 * @property {Object}   [complexityReport] - from Stage 1.8
 * @property {string}   [projectName]
 */

/**
 * @typedef {Object} InFlightPreventionInput
 * @property {Object|Array|Map} files   - generated files so far
 * @property {Object}   [blueprint]     - enriched blueprint
 * @property {Object}   [intent]        - scored intent
 * @property {Object}   [stack]         - stack plan
 * @property {string}   [stage]         - which generation stage this is run at
 */

// ── Augmented blueprint ─────────────────────────────────────────────────────

/**
 * @typedef {Object} PreventionAugmentedBlueprint
 * @property {Object}           blueprint         - the adjusted blueprint
 * @property {PreventionReport} preventionReport  - full prevention report
 */

module.exports = {};
