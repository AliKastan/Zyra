'use strict';

/**
 * @fileoverview Shared type definitions for the self-healing deploy analyzer.
 * All types are JSDoc typedefs — no TypeScript build step required.
 * Import via @typedef {import('./types').XYZ} in other modules.
 */

/**
 * @typedef {'MISSING_ENV'
 *  | 'PORT_BIND_ERROR'
 *  | 'MODULE_NOT_FOUND'
 *  | 'TYPESCRIPT_BUILD_ERROR'
 *  | 'PRISMA_SCHEMA_ERROR'
 *  | 'DATABASE_CONNECTION_ERROR'
 *  | 'MIGRATION_FAILURE'
 *  | 'START_COMMAND_FAILURE'
 *  | 'PACKAGE_INSTALL_FAILURE'
 *  | 'HEALTHCHECK_FAILURE'
 *  | 'UNKNOWN_FAILURE'
 * } FailureCategory
 */

/**
 * @typedef {'error'|'warn'|'info'|'debug'} LogSeverity
 */

/**
 * A single structured log line after parsing.
 * @typedef {Object} ParsedLogLine
 * @property {number}      lineNum    - Original line number
 * @property {string}      raw        - Original text (before cleaning)
 * @property {string}      text       - Cleaned text (ANSI stripped, prefixes removed)
 * @property {LogSeverity} severity
 * @property {Date|null}   timestamp
 * @property {string}      source     - 'build' | 'runtime' | 'stderr' | 'stdin' | 'file'
 */

/**
 * Result of matching a rule against log lines.
 * @typedef {Object} ClassifiedFailure
 * @property {FailureCategory} category
 * @property {number}          confidence   - 0.0..1.0
 * @property {ParsedLogLine[]} matchedLines - Lines that triggered the classification
 * @property {string[]}        captureGroups - Named captures (e.g. env var name, module path)
 * @property {string}          ruleName
 */

/**
 * Analyzed root cause of the failure.
 * @typedef {Object} RootCause
 * @property {FailureCategory} category
 * @property {number}          confidence
 * @property {string}          explanation       - Human-readable single sentence
 * @property {string}          suggestedFix      - What to do next
 * @property {boolean}         autoFixEligible   - Safe to auto-apply
 * @property {string[]}        importantLogLines - Key lines extracted from logs
 * @property {string[]}        captureGroups     - Specific names/paths extracted
 */

/**
 * A single file change made or proposed.
 * @typedef {Object} FileChange
 * @property {string}                    path
 * @property {'create'|'edit'|'delete'}  type
 * @property {string}                    description
 * @property {string}                    [before]  - Original content snippet
 * @property {string}                    [after]   - New content snippet
 */

/**
 * A proposed fix that requires manual review before application.
 * @typedef {Object} PatchProposal
 * @property {string}       id
 * @property {string}       title
 * @property {string}       explanation
 * @property {'low'|'medium'|'high'} risk
 * @property {FileChange[]} changes
 * @property {boolean}      autoApplied
 */

/**
 * Result of the auto-fix engine.
 * @typedef {Object} AutoFixResult
 * @property {boolean}          applied          - Were any safe fixes applied?
 * @property {FileChange[]}     changesMade      - Changes actually written to disk
 * @property {PatchProposal[]}  pendingProposals - Require manual review
 * @property {string[]}         skipped          - Fix IDs skipped (not applicable)
 * @property {string[]}         errors           - Fix IDs that errored
 */

/**
 * Final structured report produced by the pipeline.
 * @typedef {Object} DebugReport
 * @property {string}           reportId
 * @property {'fixed'|'partial'|'review_required'|'failed'|'unknown'} status
 * @property {FailureCategory}  category
 * @property {number}           confidence
 * @property {string}           rootCause
 * @property {string[]}         importantLogLines
 * @property {boolean}          safeAutoFixApplied
 * @property {FileChange[]}     changesMade
 * @property {boolean}          manualReviewRequired
 * @property {PatchProposal[]}  proposals
 * @property {string[]}         nextActions
 * @property {string}           generatedAt        - ISO timestamp
 * @property {string}           markdownReport
 */

/**
 * Options passed to the top-level runSelfHeal() function.
 * @typedef {Object} SelfHealOptions
 * @property {string}  [logFile]      - Path to log file to ingest
 * @property {string}  [logText]      - Raw log string (alternative to file)
 * @property {string}  [projectRoot]  - Root directory to apply fixes (default: cwd)
 * @property {number}  [exitCode]     - Process exit code from the failed deploy
 * @property {boolean} [dryRun]       - If true, analyse but do not write any files
 * @property {boolean} [verbose]      - Extra console output
 * @property {string}  [source]       - 'build' | 'runtime' | 'healthcheck'
 */

// This module exists purely for its typedef exports.
module.exports = {};
