'use strict';

/**
 * Multi-Pass Generation — Public API
 *
 * Replaces single-pass code generation for medium/advanced/production_heavy apps.
 * Simple apps continue to use the existing two-pass codeGenerator.
 *
 * Usage in orchestrator:
 *   const { runMultiPassGeneration } = require('../lib/generation/passes');
 *   const result = await runMultiPassGeneration(blueprint, scoredIntent, complexityReport, cost, onProgress, log);
 */

const { runMultiPassGeneration }                         = require('./orchestrateMultiPass');
const { selectPasses }                                   = require('./selectPasses');

/**
 * Build a generation plan without running it.
 * Useful for UI display and testing.
 *
 * @param {import('../../../generation/types').AppBlueprint} blueprint
 * @param {import('../../complexity/types').AppComplexityReport|null} complexityReport
 * @returns {import('./types').MultiPassPlan}
 */
function planGenerationPasses(blueprint, complexityReport) {
  return selectPasses(blueprint, complexityReport);
}

/**
 * Returns a human-readable summary of what the multi-pass plan will do.
 *
 * @param {import('./types').MultiPassPlan} plan
 * @returns {string}
 */
function summarizeMultiPassPlan(plan) {
  const passLabels = plan.passes.map(p => p.label).join(' → ');
  return `${plan.tier} tier | ${plan.passes.length} passes | ~${plan.totalEstimatedTokens} tokens | ${passLabels}`;
}

/**
 * Get all files touched by a specific pass from a completed execution report.
 *
 * @param {import('./types').MultiPassGenerationResult} result
 * @param {import('./types').GenerationPassName} passName
 * @returns {string[]}
 */
function getFilesTouchedByPass(result, passName) {
  const report = (result.passReports || []).find(r => r.passName === passName);
  return report ? report.files.map(f => f.path) : [];
}

/**
 * Produce a human-readable summary of a completed multi-pass execution.
 *
 * @param {import('./types').MultiPassGenerationResult} result
 * @returns {string}
 */
function summarizeMultiPassExecution(result) {
  const passLines = (result.passReports || [])
    .map(r => `  ${r.skipped ? '⚠ skipped' : '✓'} ${r.label}: ${r.filesProduced} files${r.warnings.length ? ` (${r.warnings.length} warnings)` : ''}`)
    .join('\n');
  return `Multi-pass complete: ${result.files.length} files total\n${passLines}`;
}

module.exports = {
  runMultiPassGeneration,
  planGenerationPasses,
  summarizeMultiPassPlan,
  getFilesTouchedByPass,
  summarizeMultiPassExecution,
};
