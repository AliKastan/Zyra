'use strict';

const { runPass }       = require('./runPass');
const { selectPasses }  = require('./selectPasses');
const { validateGeneratedCode, applyQuickFixes } = require('../../../utils/codeValidator');
const logger            = require('../../../utils/logger');

/**
 * Build a summarized context string from accumulated files for injection into pass prompts.
 * Keeps critical files' content, lists-only for others.
 *
 * @param {Map<string,string>} accumulatedFiles
 * @param {number} [maxCharsPerFile=2000]
 * @returns {string}
 */
function buildPriorContext(accumulatedFiles, maxCharsPerFile = 2000) {
  if (accumulatedFiles.size === 0) return '';
  const list = [...accumulatedFiles.keys()];
  return `Prior pass files: ${list.join(', ')}`;
}

/**
 * Run the multi-pass generation pipeline.
 *
 * @param {import('../../../generation/types').AppBlueprint} blueprint
 * @param {import('../../../generation/types').GenerationIntent} intent
 * @param {import('../../complexity/types').AppComplexityReport|null} complexityReport
 * @param {object} [cost]
 * @param {Function} [onProgress] - ({ current, total, stage }) => void
 * @param {Function} [log]        - async (msg) => void
 * @returns {Promise<import('./types').MultiPassGenerationResult>}
 */
async function runMultiPassGeneration(blueprint, intent, complexityReport, cost, onProgress, log) {
  const emit = async (msg) => { try { if (log) await log(msg); } catch (_) {} };

  const plan = selectPasses(blueprint, complexityReport);
  logger.info(`multiPass: tier="${plan.tier}" passes=[${plan.passes.map(p => p.name).join(', ')}] ~${plan.totalEstimatedTokens} tokens`);

  await emit(`Generation plan: ${plan.passes.length} passes (${plan.tier} tier)`);

  const accumulatedFiles = new Map();
  const passReports = [];
  const totalPasses = plan.passes.length;

  for (let i = 0; i < plan.passes.length; i++) {
    const passConfig = plan.passes[i];

    await emit(`Pass ${i + 1}/${totalPasses}: ${passConfig.label}...`);

    /** @type {import('./types').PassContext} */
    const ctx = {
      blueprint,
      intent,
      complexityReport,
      accumulatedFiles: new Map(accumulatedFiles), // snapshot for this pass
      passConfig,
    };

    const onFileFound = (count, label) => {
      if (onProgress) onProgress({
        current: i * 10 + count,
        total:   totalPasses * 10,
        stage:   `${label} (file ${count})`,
      });
    };

    const result = await runPass(passConfig, ctx, cost, onFileFound);
    passReports.push(result);

    // Apply quick-fixes to any HTML/JS produced
    if (result.files.length > 0) {
      const validationErrors = validateGeneratedCode(result.files);
      const fixedFiles       = applyQuickFixes(result.files, validationErrors);

      // Merge into accumulated files — later pass wins on conflict
      for (const f of fixedFiles) {
        accumulatedFiles.set(f.path, f.content);
      }

      const fileList = fixedFiles.map(f => f.path).join(', ');
      logger.info(`multiPass[${passConfig.name}]: merged files: [${fileList}]`);

      if (result.warnings.length > 0) {
        logger.warn(`multiPass[${passConfig.name}]: warnings: ${result.warnings.join('; ')}`);
      }
    }

    if (onProgress) onProgress({
      current: i + 1,
      total:   totalPasses,
      stage:   'passes',
    });
  }

  const files = Array.from(accumulatedFiles.entries()).map(([path, content]) => ({ path, content }));

  const summary = [
    `Generated ${files.length} files across ${passReports.length} passes`,
    `Passes: ${passReports.map(r => `${r.label}(${r.filesProduced})`).join(', ')}`,
    `Total warnings: ${passReports.flatMap(r => r.warnings).length}`,
  ].join(' | ');

  logger.info(`multiPass: complete — ${files.length} files total`);
  await emit(`Generation complete: ${files.length} files`);

  return {
    projectName: blueprint.projectName,
    files,
    passReports,
    plan,
    summary,
  };
}

module.exports = { runMultiPassGeneration };
