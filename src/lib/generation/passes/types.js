'use strict';

/**
 * @typedef {'scaffold_html'|'css_design_system'|'javascript_core'|'admin_ops'|'billing_integrations'|'polish_deployment'} GenerationPassName
 */

/**
 * @typedef {Object} PassTokenBudgets
 * @property {number} scaffold_html
 * @property {number} css_design_system
 * @property {number} javascript_core
 * @property {number} admin_ops
 * @property {number} billing_integrations
 * @property {number} polish_deployment
 */

/**
 * @typedef {Object} GenerationPassConfig
 * @property {GenerationPassName} name
 * @property {string}  label            - human-readable label for progress
 * @property {number}  tokenBudget
 * @property {boolean} conditional      - whether this pass may be skipped
 * @property {boolean} enabled          - whether this pass runs in the current plan
 */

/**
 * @typedef {Object} PassContext
 * @property {import('../../../generation/types').AppBlueprint} blueprint
 * @property {import('../../../generation/types').GenerationIntent} intent
 * @property {import('../../complexity/types').AppComplexityReport|null} complexityReport
 * @property {Map<string, string>} accumulatedFiles   - path → content from prior passes
 * @property {GenerationPassConfig} passConfig
 */

/**
 * @typedef {Object} GenerationPassResult
 * @property {GenerationPassName}  passName
 * @property {string}              label
 * @property {Array<{path:string, content:string}>} files    - files produced by this pass
 * @property {string[]}            warnings
 * @property {string[]}            unresolvedItems
 * @property {string}              summary
 * @property {boolean}             skipped
 * @property {number}              tokenBudget
 * @property {number}              filesProduced
 */

/**
 * @typedef {Object} MultiPassPlan
 * @property {GenerationPassConfig[]} passes
 * @property {string}                 tier
 * @property {number}                 totalEstimatedTokens
 * @property {string[]}               rationale
 */

/**
 * @typedef {Object} MultiPassGenerationResult
 * @property {string}                 projectName
 * @property {Array<{path:string,content:string}>} files    - merged final file set
 * @property {GenerationPassResult[]} passReports
 * @property {MultiPassPlan}          plan
 * @property {string}                 summary
 */

module.exports = {};
