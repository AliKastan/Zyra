'use strict';

/**
 * Section Regeneration — Type Definitions (JSDoc)
 *
 * @module section-regeneration/types
 */

/**
 * All valid section types in a generated Zyra application.
 *
 * @typedef {'ui-presentation'|'routes-pages'|'auth'|'database'|'backend-api'|'billing'|'integrations'|'admin'|'mobile-shell'|'deployment'|'ux-states'|'design-system'} SectionType
 */

/**
 * All valid change-type classifications.
 *
 * @typedef {'add_feature'|'modify_feature'|'remove_feature'|'restyle_ui'|'change_platform'|'add_integration'|'change_auth_behavior'|'change_billing'|'fix_bug'|'improve_deployment'|'improve_admin_tools'|'change_navigation'|'change_database'|'fix_ux_states'|'targeted_repair'} ChangeType
 */

/**
 * Action extracted from the change request.
 * @typedef {'add'|'remove'|'fix'|'improve'|'restyle'|'change'|'unknown'} ChangeAction
 */

/**
 * Result of detectChangeType().
 *
 * @typedef {Object} ChangeDetection
 * @property {ChangeType}     changeType       - Primary classification
 * @property {ChangeType[]}   secondaryTypes   - Other matching types
 * @property {ChangeAction}   action           - Action verb extracted
 * @property {SectionType[]}  targetSections   - Sections detected in the prompt
 * @property {'high'|'medium'|'low'} confidence
 * @property {string[]}       indicators       - Keywords that triggered classification
 * @property {boolean}        isAdditive       - True if adding something new
 * @property {boolean}        isRemoval        - True if removing something
 * @property {boolean}        isRepair         - True if fixing a bug/issue
 */

/**
 * Result of analyzeSectionImpact().
 *
 * @typedef {Object} SectionImpactAnalysis
 * @property {SectionType[]}  primarySections         - Sections that need full regeneration
 * @property {SectionType[]}  secondarySections       - Sections that may need patching
 * @property {SectionType[]}  preserveSections        - Sections that must NOT be touched
 * @property {'low'|'medium'|'high'|'critical'} riskLevel
 * @property {boolean}        fullRegenerationRequired
 * @property {string}         fullRegenerationReason  - Non-empty only when fullRegenRequired
 * @property {number}         impactScore             - 0–100, higher = more sections affected
 * @property {string[]}       validationRequired      - Section names that need validation after regen
 * @property {string[]}       repairRequired          - Section names that need repair after regen
 */

/**
 * Maps a section to actual file paths in the project.
 *
 * @typedef {Object} FileImpactMapping
 * @property {SectionType}  section
 * @property {string[]}     matchedFiles     - Files from existingFiles that belong to this section
 * @property {string[]}     expectedNewFiles - Files that might need to be created
 * @property {string[]}     envVarsNeeded    - Environment variables this section needs
 * @property {string[]}     dependenciesNeeded - npm packages this section needs
 */

/**
 * The full regeneration plan produced before any LLM calls.
 *
 * @typedef {Object} RegenerationPlan
 * @property {ChangeDetection}       changeDetection
 * @property {SectionImpactAnalysis} impact
 * @property {FileImpactMapping[]}   fileMapping
 * @property {string[]}              filesToRegenerate  - Full replacement needed
 * @property {string[]}              filesToPatch       - Partial update (add export/route/etc.)
 * @property {string[]}              filesToPreserve    - Must not be touched
 * @property {string[]}              validationScope    - Sections to validate post-regen
 * @property {string[]}              repairScope        - Sections to repair post-regen
 * @property {string}                scopeSummary       - Human-readable scope description
 */

/**
 * The chosen regeneration strategy.
 *
 * @typedef {Object} RegenerationStrategy
 * @property {'no_regeneration_needed'|'section_regeneration'|'full_regeneration'} strategy
 * @property {string}    reason
 * @property {string[]}  skippedSections    - Sections skipped to save tokens
 * @property {number}    estimatedFilesTouched
 */

/**
 * A single file merge operation.
 *
 * @typedef {Object} MergeOperation
 * @property {string}    path
 * @property {'create'|'replace'|'patch'|'preserve'|'delete'} operation
 * @property {string}    [reason]
 */

/**
 * Result of mergeRegeneratedSections().
 *
 * @typedef {Object} MergeResult
 * @property {Object.<string,string>} mergedFiles   - Final file set after merge
 * @property {MergeOperation[]}       operations    - What was done to each file
 * @property {string[]}               preserved     - Files not touched
 * @property {string[]}               replaced      - Files replaced by new content
 * @property {string[]}               created       - New files created
 * @property {string[]}               patched       - Files that received partial updates
 * @property {string[]}               warnings      - Issues found during merge
 */

/**
 * Section-specific regeneration specification (no LLM calls, guides the caller).
 *
 * @typedef {Object} SectionRegenerationSpec
 * @property {SectionType} sectionType
 * @property {Array<{path:string,description:string}>}  filesToCreate
 * @property {Array<{path:string,description:string,operation:string}>} filesToPatch
 * @property {string[]}    envVarsNeeded
 * @property {string[]}    dependenciesNeeded
 * @property {string[]}    generationHints    - Prompt hints for LLM-based generation
 * @property {string[]}    validationHints    - What to check after regeneration
 * @property {string[]}    repairHints        - What to repair if broken
 * @property {boolean}     placeholderMode    - True if section uses placeholder (no real API keys)
 * @property {string}      authenticityNote   - Reminder about backend authenticity rules
 */

/**
 * The final report returned by runSectionRegeneration().
 *
 * @typedef {Object} SectionRegenerationReport
 * @property {'no_regeneration_needed'|'section_regeneration_planned'|'section_regeneration_completed'|'section_regeneration_completed_with_warnings'|'full_regeneration_required'|'manual_review_required'|'regeneration_failed'} status
 * @property {ChangeType}    changeType
 * @property {string}        requestedChange
 * @property {SectionType[]} primarySections
 * @property {SectionType[]} secondarySections
 * @property {SectionType[]} preservedSections
 * @property {string[]}      impactedFiles
 * @property {string[]}      regeneratedFiles
 * @property {string[]}      patchedFiles
 * @property {string[]}      preservedFiles
 * @property {string[]}      validationScope
 * @property {string[]}      repairScope
 * @property {string[]}      placeholderConversions
 * @property {string[]}      warnings
 * @property {string}        summary
 * @property {RegenerationPlan} plan
 */

module.exports = {};
