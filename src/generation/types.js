'use strict';

/**
 * JSDoc typedefs for the multi-stage generation pipeline.
 * CommonJS module — imported for IDE type hints via @typedef in consuming files.
 */

/**
 * @typedef {'saas' | 'dashboard' | 'ecommerce' | 'game' | 'tool' | 'portfolio' | 'landing-page' | 'api' | 'generic'} AppType
 */

/**
 * @typedef {Object} GenerationIntent
 * @property {AppType}  appType        - Classified app type
 * @property {string}   category       - Human-readable category label
 * @property {string[]} features       - Core feature list (max 8)
 * @property {string}   coreEntity     - Primary data entity (e.g. "Task", "Product")
 * @property {string[]} userFlows      - Key user journeys (max 4)
 * @property {boolean}  needsAuth      - Requires user authentication
 * @property {boolean}  needsDatabase  - Requires persistent storage
 * @property {boolean}  needsPayments  - Requires payment processing
 * @property {boolean}  isMultiUser    - Multiple users / roles
 * @property {'professional'|'friendly'|'playful'|'minimal'} tone
 * @property {string}   target         - Target audience description
 */

/**
 * @typedef {Object} PageDefinition
 * @property {string}   name
 * @property {string}   path
 * @property {string}   description
 * @property {string[]} components
 */

/**
 * @typedef {Object} DataModel
 * @property {string}   name
 * @property {string[]} fields
 * @property {string}   description
 */

/**
 * @typedef {Object} ProductPlan
 * @property {string}           appName
 * @property {string}           summary
 * @property {PageDefinition[]} pages
 * @property {DataModel[]}      dataModels
 * @property {string[]}         envVars
 * @property {string[]}         integrations
 */

/**
 * @typedef {Object} TechStack
 * @property {string} frontend  - e.g. "HTML/CSS/JS"
 * @property {string} backend   - e.g. "none" | "express"
 * @property {string} database  - e.g. "localStorage" | "supabase"
 * @property {string} auth      - e.g. "none" | "supabase"
 * @property {string} styling   - e.g. "custom CSS"
 */

/**
 * @typedef {Object} StackPlan
 * @property {TechStack} tech
 * @property {string[]}  files       - Ordered list of all file paths
 * @property {string}    entryPoint  - Main HTML file
 */

/**
 * @typedef {Object} FileSpec
 * @property {string}   path
 * @property {string}   description
 * @property {string[]} contains  - Key elements/functions the file must include
 */

/**
 * @typedef {Object} ColorScheme
 * @property {string} primary
 * @property {string} bg
 * @property {string} text
 * @property {string} accent
 */

/**
 * @typedef {Object} KeyFunction
 * @property {string} file
 * @property {string} functionName
 * @property {string} description
 */

/**
 * @typedef {Object} AppBlueprint
 * @property {string}      projectName   - kebab-case slug
 * @property {string[]}    fileList      - Ordered list of files to generate
 * @property {FileSpec[]}  fileSpecs     - Per-file implementation specs
 * @property {ColorScheme} colorScheme   - Design color tokens
 * @property {string}      designNotes   - Visual style guidance
 * @property {string}      dataFlow      - Data flow description
 * @property {KeyFunction[]} keyFunctions
 */

/**
 * @typedef {'missing_file'|'empty_file'|'no_html_structure'|'missing_viewport'|'broken_reference'} ValidationIssueType
 */

/**
 * @typedef {Object} ValidationIssue
 * @property {ValidationIssueType} type
 * @property {string} file
 * @property {string} message
 * @property {'critical'|'warning'} severity
 */

/**
 * @typedef {Object} ValidationReport
 * @property {boolean}           passed
 * @property {number}            score     - 0–100
 * @property {ValidationIssue[]} issues
 * @property {string[]}          warnings
 */

/**
 * @typedef {Object} RepairReport
 * @property {string[]} repairsApplied
 * @property {boolean}  allRepaired
 */

/**
 * @typedef {Object} GeneratedFile
 * @property {string} path
 * @property {string} content
 */

/**
 * @typedef {Object} AdvancedGenerationResult
 * @property {string}            projectName
 * @property {GeneratedFile[]}   files
 * @property {AppBlueprint}      blueprint
 * @property {ValidationReport}  validationReport
 * @property {RepairReport}      [repairReport]
 * @property {boolean}           _advanced
 */

module.exports = {};
