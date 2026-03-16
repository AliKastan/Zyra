'use strict';

/**
 * Platform-Aware Generation — Type Definitions
 *
 * @typedef {'web'|'mobile'|'desktop'|'backend'} PlatformType
 * @typedef {'low'|'medium'|'high'} ConfidenceLevel
 *
 * @typedef {Object} PlatformStack
 * @property {PlatformType} platform
 * @property {string}       variant          - e.g. 'nextjs', 'expo', 'electron', 'express'
 * @property {string}       framework        - primary framework name
 * @property {string}       ui               - UI library / component system
 * @property {string}       routing          - routing approach
 * @property {string}       backend          - backend approach
 * @property {string[]}     dependencies     - required npm packages
 * @property {string[]}     devDependencies  - required dev packages
 * @property {Object}       buildConfig      - build tool / config hints
 * @property {string}       entryFile        - main entry point file
 *
 * @typedef {Object} PlatformStructure
 * @property {PlatformType}  platform
 * @property {string[]}      directories  - top-level directories to create
 * @property {string[]}      coreFiles    - essential files to generate
 * @property {Object}        namingConventions
 * @property {string}        namingConventions.components  - e.g. 'PascalCase'
 * @property {string}        namingConventions.routes      - e.g. 'kebab-case'
 * @property {string}        namingConventions.services    - e.g. 'camelCase'
 * @property {string[]}      generationHints
 *
 * @typedef {Object} PlatformRules
 * @property {PlatformType}  platform
 * @property {string[]}      mustInclude      - patterns that MUST appear
 * @property {string[]}      mustExclude      - patterns that must NOT appear
 * @property {string[]}      fileExtensions   - valid file extensions
 * @property {string[]}      generationHints  - LLM prompt hints for this platform
 * @property {string[]}      validationChecks - what to validate
 *
 * @typedef {Object} PlatformDetectionResult
 * @property {PlatformType}    platform
 * @property {ConfidenceLevel} confidence
 * @property {string[]}        indicators    - matched keywords
 * @property {boolean}         isExplicit    - user explicitly stated platform
 * @property {string[]}        secondaryPlatforms - other platforms mentioned
 * @property {string}          rationale
 *
 * @typedef {Object} PlatformGenerationConfig
 * @property {PlatformDetectionResult} detection
 * @property {PlatformStack}           stack
 * @property {PlatformStructure}       structure
 * @property {PlatformRules}           rules
 * @property {string}                  summary
 *
 * @typedef {Object} PlatformValidationResult
 * @property {boolean}   valid
 * @property {string[]}  violations   - incompatible pattern violations
 * @property {string[]}  warnings     - best-practice warnings
 * @property {number}    score        - 0–100 compatibility score
 * @property {string}    summary
 */

const PLATFORM_TYPES = /** @type {const} */ (['web', 'mobile', 'desktop', 'backend']);

module.exports = { PLATFORM_TYPES };
