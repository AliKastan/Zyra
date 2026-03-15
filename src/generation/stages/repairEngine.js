'use strict';

const { callClaude, SONNET_MODEL } = require('../../providers/anthropicProvider');
const { buildRepairPrompt }         = require('../prompts/repair');
const { parseFileDelimited }        = require('../../utils/parseFileDelimited');
const { withTimeout }               = require('../../utils/withTimeout');
const limits                        = require('../../config/limits');
const logger                        = require('../../utils/logger');

/**
 * Stage 7 — Repair Pass.
 *
 * Runs when the validator found any issues (critical OR warnings that significantly
 * degrade quality). The repair engine receives the blueprint spec, the full issue
 * list, and the current file content — giving it complete context to make targeted,
 * correct fixes without breaking anything that was working.
 *
 * Repair scope:
 *   - Critical issues: always attempted
 *   - Warnings: attempted when score < REPAIR_SCORE_THRESHOLD
 *   - debug_code / minor warnings: skipped (not worth the API call cost)
 *
 * @param {import('../types').GeneratedFile[]} files
 * @param {import('../types').ValidationReport} validationReport
 * @param {import('../types').AppBlueprint} blueprint
 * @param {object} cost - cost tracker instance
 * @returns {Promise<{ files: import('../types').GeneratedFile[], repairReport: import('../types').RepairReport }>}
 */
async function repairFiles(files, validationReport, blueprint, cost) {
  const REPAIR_SCORE_THRESHOLD = parseInt(process.env.REPAIR_SCORE_THRESHOLD || '70', 10);

  const criticalIssues = validationReport.issues.filter(i => i.severity === 'critical');

  // Include non-trivial warnings when score is below threshold
  const repairableWarnings = validationReport.score < REPAIR_SCORE_THRESHOLD
    ? validationReport.issues.filter(i =>
        i.severity === 'warning' &&
        !['debug_code'].includes(i.type) // skip cosmetic-only issues
      )
    : [];

  const issuesToFix = [...criticalIssues, ...repairableWarnings];

  if (issuesToFix.length === 0) {
    logger.info('repairEngine: no issues requiring repair');
    return { files, repairReport: { repairsApplied: [], allRepaired: true } };
  }

  const hasCritical = criticalIssues.length > 0;
  logger.info(`repairEngine: fixing ${criticalIssues.length} critical + ${repairableWarnings.length} warnings (score=${validationReport.score})`);

  const { system, user } = buildRepairPrompt(files, issuesToFix, blueprint);

  try {
    const raw = await withTimeout(
      callClaude(system, user, { model: SONNET_MODEL, maxTokens: limits.REPAIR_MAX_TOKENS }),
      limits.REPAIR_TIMEOUT_MS,
      'Repair pass',
    );

    if (cost) cost.record('repair', system, user, raw, { model: SONNET_MODEL });

    const { success, files: repairedFiles } = parseFileDelimited(raw);

    if (!success || !repairedFiles?.length) {
      logger.warn('repairEngine: no valid ---FILE--- blocks returned, keeping originals');
      return { files, repairReport: { repairsApplied: [], allRepaired: false } };
    }

    // Merge repaired files over originals — repaired version always wins
    const fileMap = new Map(files.map(f => [f.path, f.content]));
    for (const repaired of repairedFiles) {
      fileMap.set(repaired.path, repaired.content);
    }

    const mergedFiles    = Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }));
    const repairsApplied = repairedFiles.map(f => f.path);

    logger.info(`repairEngine: repaired [${repairsApplied.join(', ')}]`);

    return {
      files:        mergedFiles,
      repairReport: { repairsApplied, allRepaired: hasCritical ? true : validationReport.score >= REPAIR_SCORE_THRESHOLD },
    };
  } catch (err) {
    logger.warn(`repairEngine: failed (${err.message}), returning originals`);
    return { files, repairReport: { repairsApplied: [], allRepaired: false } };
  }
}

module.exports = { repairFiles };
