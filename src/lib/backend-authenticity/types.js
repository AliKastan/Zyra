'use strict';

/**
 * Backend Authenticity Checker — Type Definitions
 *
 * Detects fake/simulated backend patterns in generated code:
 * missing API routes, hardcoded credentials, in-memory "databases",
 * fake payment flows, stubbed integrations, and unguarded admin routes.
 *
 * @module backend-authenticity/types
 */

/**
 * Overall authenticity status of the generated project.
 * @typedef {'authentic_backend' | 'fake_backend_detected' | 'placeholder_only' | 'static_project'} AuthenticityStatus
 */

/**
 * Severity of an authenticity issue.
 * @typedef {'critical' | 'high' | 'medium' | 'low'} AuthenticitySeverity
 */

/**
 * Category of the fake pattern detected.
 * @typedef {
 *   'fake_api' |
 *   'fake_auth' |
 *   'fake_db' |
 *   'fake_billing' |
 *   'fake_integration' |
 *   'fake_dashboard' |
 *   'fake_admin' |
 *   'hardcoded_data' |
 *   'missing_persistence' |
 *   'stub_implementation'
 * } AuthenticityCategory
 */

/**
 * A detected fake backend issue.
 * @typedef {Object} AuthenticityIssue
 * @property {string}                 id          - Unique issue identifier
 * @property {AuthenticityCategory}   category    - Issue category
 * @property {AuthenticitySeverity}   severity    - Issue severity
 * @property {string}                 message     - Human-readable description
 * @property {string}                 fix         - Recommended fix / conversion action
 * @property {string}                 [file]      - File where the issue was detected
 * @property {string}                 [pattern]   - The regex or code pattern that was matched
 */

/**
 * A feature that exists as a placeholder (requires external configuration).
 * @typedef {Object} PlaceholderFeature
 * @property {string} feature   - Feature name (e.g., "Stripe billing")
 * @property {string} reason    - Why it is a placeholder
 * @property {string} action    - What the developer must do to activate it
 */

/**
 * A feature that was blocked/disabled because it cannot be implemented authentically.
 * @typedef {Object} BlockedFeature
 * @property {string} feature   - Feature name
 * @property {string} reason    - Why it was blocked
 */

/**
 * Structured authenticity report returned by checkBackendAuthenticity().
 * @typedef {Object} BackendAuthenticityReport
 * @property {AuthenticityStatus}     status               - Overall status
 * @property {AuthenticityIssue[]}    fakeBackendIssues    - Detected fake patterns
 * @property {PlaceholderFeature[]}   placeholderFeatures  - Features that are placeholders (OK)
 * @property {BlockedFeature[]}       blockedFeatures      - Features disabled due to missing backend
 * @property {string[]}               warnings             - Non-critical warnings
 * @property {string}                 summary              - Human-readable summary
 * @property {string}                 generatedAt          - ISO timestamp
 */

/**
 * Input to the authenticity checker.
 * @typedef {Object} AuthenticityInput
 * @property {Object|Map|Array}     files             - Generated file map (path → content)
 * @property {Object}               [blueprint]       - Enriched blueprint
 * @property {Object}               [intent]          - Scored intent
 * @property {Object}               [stack]           - Stack descriptor
 * @property {Object}               [complexityReport] - Complexity signals
 */

module.exports = {};
