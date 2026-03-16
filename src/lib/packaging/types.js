'use strict';

/**
 * JSDoc type definitions for the Final Packaging / Output Assembly / Delivery system.
 *
 * This system runs as Stage 10 of the Zyra pipeline, after all generation, validation,
 * and repair stages have completed. It assembles a clean, structured, user-facing
 * deliverable from all pipeline outputs.
 */

// ── Package status ─────────────────────────────────────────────────────────────

/**
 * @typedef {'ready'|'ready_with_setup_required'|'ready_with_warnings'|'manual_review_required'|'incomplete'} FinalPackageStatus
 *
 * Levels (priority order, most severe first):
 *   incomplete              — generation or repair failed; project cannot run as-is (score < 40 or architecture broken)
 *   manual_review_required  — unresolved issues require human attention before running
 *   ready_with_setup_required — structurally complete but env vars / API keys are missing
 *   ready_with_warnings     — runnable but has non-critical concerns to address
 *   ready                   — project is complete and can run immediately
 */

// ── Env var spec ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} EnvVarSpec
 * @property {string}  name            - e.g. 'STRIPE_SECRET_KEY'
 * @property {string}  description     - human-readable purpose
 * @property {boolean} required        - true if app cannot run without it
 * @property {boolean} hasDefault      - true if a safe default or example value exists
 * @property {string}  [defaultValue]  - the example / safe default value
 * @property {string}  [category]      - 'auth'|'billing'|'ai'|'storage'|'email'|'analytics'|'core'
 * @property {string}  [setupNote]     - where to obtain / how to configure
 */

// ── Integration spec ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} IntegrationSpec
 * @property {string}   name           - e.g. 'Stripe', 'Supabase', 'OpenAI'
 * @property {string}   description    - what the integration does in this app
 * @property {boolean}  requiresKey    - true if an API key / secret is needed
 * @property {boolean}  configured     - true if keys are structurally present (may still be placeholder)
 * @property {string[]} envVars        - related env var names
 * @property {string}   setupNote      - how to complete setup for this integration
 * @property {string}   [docsUrl]      - documentation link
 */

// ── Project manifest ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} ManifestStack
 * @property {string}  frontend   - e.g. 'HTML5 + CSS3 + ES6 JavaScript'
 * @property {string}  [backend]  - e.g. 'Node.js + Express'
 * @property {string}  [database] - e.g. 'PostgreSQL (Supabase)'
 * @property {string}  [auth]     - e.g. 'JWT + bcrypt'
 * @property {string}  [payments] - e.g. 'Stripe Checkout'
 * @property {string}  [ai]       - e.g. 'OpenAI GPT-4'
 * @property {string}  deployment - e.g. 'Static hosting / Node server'
 */

/**
 * @typedef {Object} ProjectManifest
 * @property {string}         projectId         - short unique ID for this package
 * @property {string}         projectName       - human-readable project name
 * @property {string}         appType           - e.g. 'saas', 'ecommerce', 'landing-page'
 * @property {string[]}       platforms         - e.g. ['web'], ['web', 'mobile']
 * @property {ManifestStack}  stack             - technology summary
 * @property {string}         complexityTier    - 'simple'|'medium'|'advanced'|'production_heavy'
 * @property {number}         complexityScore   - 0-90
 * @property {string[]}       features          - major generated features
 * @property {string[]}       integrations      - integrated third-party services
 * @property {string[]}       routes            - key routes / screens / pages
 * @property {string[]}       dataEntities      - core data models / entities
 * @property {EnvVarSpec[]}   requiredEnvVars   - all required env vars
 * @property {number}         fileCount         - total generated files
 * @property {number}         routeCount        - number of routes / pages
 * @property {number}         integrationCount  - number of integrations
 * @property {string}         generatedAt       - ISO timestamp from pipeline start
 * @property {string}         packagedAt        - ISO timestamp when package was assembled
 */

// ── Readiness summary ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} ReadinessSummary
 * @property {boolean} architectureReady   - all files + imports resolved, no structural blockers
 * @property {boolean} runReady            - npm install + npm start/dev will work locally
 * @property {boolean} deployReady         - deployment config present, no critical unresolved issues
 * @property {boolean} authReady           - auth system present and wired (or auth not required)
 * @property {boolean} billingReady        - billing system present and wired (or billing not required)
 * @property {boolean} integrationReady    - all required integrations structurally wired
 * @property {boolean} mobileReady         - mobile entry point present (or mobile not required)
 * @property {boolean} webReady            - web entry point present
 * @property {boolean} manualReviewRequired - one or more items require human attention
 */

// ── Run instructions ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} FinalRunInstructions
 * @property {string}   platform       - 'static'|'node'|'react'|'nextjs'|'mobile'|'mixed'
 * @property {string}   installCommand - e.g. 'npm install'
 * @property {string}   devCommand     - e.g. 'npm run dev'
 * @property {string}   [buildCommand] - e.g. 'npm run build'
 * @property {string}   [startCommand] - e.g. 'npm start'
 * @property {string}   [mobileCommand]- e.g. 'npx expo start'
 * @property {string[]} envSetupSteps  - ordered steps to configure env vars before running
 * @property {string[]} deployNotes    - notes specific to deployment of this project
 */

// ── Setup instructions ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} FinalSetupInstructions
 * @property {EnvVarSpec[]}      requiredEnvVars  - env vars that must be set before running
 * @property {EnvVarSpec[]}      optionalEnvVars  - env vars that have defaults or are non-critical
 * @property {IntegrationSpec[]} integrations     - third-party integration setup
 * @property {string}            installCommand
 * @property {string}            devCommand
 * @property {string}            [buildCommand]
 * @property {string}            [startCommand]
 * @property {string[]}          deployNotes
 */

// ── Warning summary ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ManualReviewItem
 * @property {string} id          - unique ID (from validator issue id or repair issue id)
 * @property {string} severity    - 'critical'|'major'|'medium'|'minor'
 * @property {string} description - what needs human attention
 * @property {string} [file]      - affected file path
 * @property {string} [suggestion]- recommended action
 * @property {string} reason      - why this could not be auto-fixed
 */

/**
 * @typedef {Object} FinalWarningSummary
 * @property {string[]}           warnings             - non-blocking warning messages
 * @property {ManualReviewItem[]} manualReviewRequired - items requiring human attention
 * @property {string[]}           unresolvedIssues     - issue messages not fixed by repair
 * @property {string[]}           missingCredentials   - integration keys / secrets not yet configured
 * @property {string[]}           riskyAreas           - areas where auto-repair was intentionally skipped
 */

// ── Final summary ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} FinalSummary
 * @property {string}   projectOverview    - one-paragraph description of what was built
 * @property {string[]} generatedFeatures  - list of major features that were generated
 * @property {string}   validationSummary  - human-readable description of validation result
 * @property {string}   repairSummary      - human-readable description of what was repaired
 * @property {string[]} nextSteps          - ordered list of recommended actions after packaging
 */

// ── Packaged file entry ────────────────────────────────────────────────────────

/**
 * @typedef {Object} PackagedFileEntry
 * @property {string} path       - relative file path
 * @property {string} content    - file content
 * @property {string} [type]     - FileType (from file-generator classification)
 * @property {string} [operation]- 'create'|'update'
 * @property {number} [sizeBytes]
 */

// ── Export artifacts ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} ExportArtifacts
 * @property {string} manifestFile   - filename for project manifest JSON, e.g. 'project-manifest.json'
 * @property {string} reportFile     - filename for delivery report markdown, e.g. 'final-report.md'
 * @property {string} manifestJson   - full serialized manifest JSON content
 * @property {string} reportMarkdown - full markdown report content
 */

// ── Top-level package ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} FinalProjectPackage
 * The complete final deliverable assembled by Stage 10 of the Zyra pipeline.
 *
 * @property {FinalPackageStatus}     packageStatus
 * @property {ProjectManifest}        manifest
 * @property {ReadinessSummary}       readiness
 * @property {PackagedFileEntry[]}    files
 * @property {FinalSummary}           summary
 * @property {FinalSetupInstructions} setup
 * @property {string[]}               warnings
 * @property {ManualReviewItem[]}     manualReviewRequired
 * @property {ExportArtifacts}        exports
 */

// ── Packaging input ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PackagingInput
 * All pipeline outputs fed into Stage 10.
 *
 * @property {Object}       intent                - enriched GenerationIntent (Stage 1 → 1.5)
 * @property {Object}       [product]             - product plan (Stage 2)
 * @property {Object}       [stack]               - architecture plan (Stage 3)
 * @property {Object}       blueprint             - implementation blueprint (Stage 4)
 * @property {Object|null}  complexityReport      - AppComplexityReport (Stage 1.8)
 * @property {Array<{path:string,content:string}>} files  - final repaired files (post Stage 7)
 * @property {Object|null}  fileArtifacts         - GeneratedProjectFiles (Stage 5.5)
 * @property {Object}       validationReport      - ProjectValidationReport (Stage 6.5)
 * @property {Object|null}  structuralRepairReport- RepairReport from Stage 7.1
 * @property {Object|null}  repairReport          - legacy LLM repair report from Stage 7
 * @property {string}       [projectName]         - override for project name
 * @property {string}       [generatedAt]         - ISO timestamp from pipeline start
 */

module.exports = {};
