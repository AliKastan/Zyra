'use strict';

/**
 * JSDoc type definitions for the Production Readiness Checker + Deployment Intelligence Layer.
 *
 * Runs as Stage 12 of the Zyra pipeline, after Final Packaging (Stage 11).
 * Evaluates whether the generated application is actually deployable in a real environment.
 */

// ── Readiness status ────────────────────────────────────────────────────────

/**
 * @typedef {'ready'|'ready_with_setup_required'|'ready_with_warnings'|'manual_configuration_required'|'not_ready'} ReadinessStatus
 *
 * Levels (priority order, most severe first):
 *   not_ready                    — critical runtime or structural failures; cannot run
 *   manual_configuration_required — requires significant manual work before deploying
 *   ready_with_setup_required    — structurally deployable but env vars / keys are missing
 *   ready_with_warnings          — deployable but has non-critical concerns
 *   ready                        — passes all checks; can deploy immediately
 */

// ── Deployment targets ──────────────────────────────────────────────────────

/**
 * @typedef {'railway'|'vercel'|'render'|'docker'|'node-server'|'expo'|'static'|'unknown'} DeploymentTargetName
 */

/**
 * @typedef {Object} DeploymentTarget
 * @property {DeploymentTargetName} name
 * @property {boolean}  compatible        - true if the project is compatible with this platform
 * @property {string[]} issues            - blocking compatibility issues
 * @property {string[]} suggestions       - platform-specific setup suggestions
 * @property {string}   [configFile]      - recommended config file name (e.g. 'railway.json')
 * @property {string}   [deployCommand]   - recommended deploy command
 */

// ── Readiness issues ────────────────────────────────────────────────────────

/**
 * @typedef {'critical'|'warning'|'info'} ReadinessIssueSeverity
 */

/**
 * @typedef {'runtime'|'deployment'|'env'|'integrations'|'build'|'database'|'billing'|'security'|'structure'} ReadinessIssueCategory
 */

/**
 * @typedef {Object} ReadinessIssue
 * @property {ReadinessIssueSeverity}   severity
 * @property {ReadinessIssueCategory}   category
 * @property {string}                   message   - human-readable description
 * @property {string}                   [fix]     - suggested fix (actionable one-liner)
 * @property {string}                   [file]    - file where the issue was detected
 */

// ── Per-category check results ──────────────────────────────────────────────

/**
 * @typedef {Object} RuntimeCheckResult
 * @property {boolean}   hasStartScript
 * @property {boolean}   hasDevScript
 * @property {boolean}   hasBuildScript
 * @property {boolean}   hasEntrypoint
 * @property {string}    [entrypointFile]
 * @property {string[]}  missingFiles
 * @property {ReadinessIssue[]} issues
 * @property {number}    score          - 0–100
 */

/**
 * @typedef {Object} DeploymentCheckResult
 * @property {DeploymentTarget[]} targets
 * @property {string}             recommendedTarget
 * @property {boolean}            portConfigured     - process.env.PORT used
 * @property {ReadinessIssue[]}   issues
 * @property {number}             score
 */

/**
 * @typedef {Object} EnvCheckResult
 * @property {boolean}   hasEnvExample
 * @property {string[]}  requiredVars          - detected required env var names
 * @property {string[]}  missingVars           - vars referenced in code with no placeholder
 * @property {boolean}   hasHardcodedSecrets   - detected potential hardcoded secrets
 * @property {ReadinessIssue[]} issues
 * @property {number}    score
 */

/**
 * @typedef {Object} IntegrationCheckResult
 * @property {string[]}  detected       - integration names found in the project
 * @property {string[]}  configured     - integration names with env vars present
 * @property {string[]}  unconfigured   - integration names missing env vars
 * @property {ReadinessIssue[]} issues
 * @property {number}    score
 */

/**
 * @typedef {Object} BuildCheckResult
 * @property {boolean}   hasBuildTool
 * @property {string}    [buildTool]    - e.g. 'vite', 'next', 'tsc', 'webpack'
 * @property {boolean}   dependenciesDeclared
 * @property {string[]}  missingDependencies
 * @property {ReadinessIssue[]} issues
 * @property {number}    score
 */

/**
 * @typedef {Object} DatabaseCheckResult
 * @property {boolean}   detected
 * @property {string}    [dbType]       - e.g. 'postgresql', 'mysql', 'mongodb', 'sqlite', 'supabase'
 * @property {boolean}   hasConnectionString
 * @property {boolean}   hasMigrationNotes
 * @property {boolean}   hasSchemaFile
 * @property {ReadinessIssue[]} issues
 * @property {number}    score
 */

/**
 * @typedef {Object} BillingCheckResult
 * @property {boolean}   detected
 * @property {string}    [provider]     - e.g. 'stripe', 'paddle', 'lemon-squeezy'
 * @property {boolean}   hasEnvVars
 * @property {boolean}   hasWebhookHandler
 * @property {boolean}   hasCheckoutLogic
 * @property {ReadinessIssue[]} issues
 * @property {number}    score
 */

/**
 * @typedef {Object} SecurityCheckResult
 * @property {boolean}   hasHardcodedKeys
 * @property {boolean}   hasUnsafeEnvUsage
 * @property {string[]}  flaggedFiles
 * @property {ReadinessIssue[]} issues
 * @property {number}    score
 */

// ── Readiness score ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} ReadinessScore
 * @property {number} total           - 0–100 weighted composite
 * @property {number} runtime         - 0–100
 * @property {number} deployment      - 0–100
 * @property {number} envConfig       - 0–100
 * @property {number} integrations    - 0–100
 * @property {number} build           - 0–100
 * @property {number} architectureSafety - 0–100
 */

// ── Suggested fix ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} SuggestedFix
 * @property {'high'|'medium'|'low'} priority
 * @property {ReadinessIssueCategory} category
 * @property {string} action            - one-liner describing what to do
 * @property {string} [detail]          - optional longer explanation
 * @property {string} [file]            - file to edit
 */

// ── Final report ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ProductionReadinessReport
 * @property {ReadinessStatus}          status
 * @property {ReadinessScore}           score
 * @property {boolean}                  runtimeReady
 * @property {boolean}                  deployReady
 * @property {boolean}                  envConfigured
 * @property {boolean}                  integrationsConfigured
 * @property {boolean}                  buildReady
 * @property {boolean}                  securitySafe
 * @property {string}                   projectType         - 'static'|'node'|'nextjs'|'react'|'mobile'
 * @property {string}                   recommendedDeployTarget
 * @property {ReadinessIssue[]}         criticalIssues
 * @property {ReadinessIssue[]}         warnings
 * @property {SuggestedFix[]}           nextSteps
 * @property {RuntimeCheckResult}       runtime
 * @property {DeploymentCheckResult}    deployment
 * @property {EnvCheckResult}           env
 * @property {IntegrationCheckResult}   integrations
 * @property {BuildCheckResult}         build
 * @property {DatabaseCheckResult}      database
 * @property {BillingCheckResult}       billing
 * @property {SecurityCheckResult}      security
 * @property {string}                   summary             - one-line human-readable summary
 * @property {string}                   generatedAt
 */

// ── Input context ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} ReadinessInput
 * @property {Object}   files                          - { [path]: content } map of generated files
 * @property {Object}   [blueprint]                    - enriched blueprint from orchestrator
 * @property {Object}   [intent]                       - analyzed intent from Stage 1
 * @property {Object}   [stack]                        - stack plan from Stage 3
 * @property {Object}   [complexityReport]             - complexity from Stage 1.8
 * @property {Object}   [validationReport]             - from Stage 6.5
 * @property {Object}   [finalPackage]                 - from Stage 11 packaging
 * @property {string}   [projectName]
 */

module.exports = {};
