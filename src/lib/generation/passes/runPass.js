'use strict';

const { callClaudeStream, SONNET_MODEL } = require('../../../providers/anthropicProvider');
const { parseFileDelimited }             = require('../../../utils/parseFileDelimited');
const { withTimeout }                    = require('../../../utils/withTimeout');
const { buildScaffoldPrompt }            = require('./prompts/scaffold');
const { buildCssPrompt }                 = require('./prompts/cssDesignSystem');
const { buildJavaScriptPrompt }          = require('./prompts/javascriptCore');
const { buildAdminOpsPrompt }            = require('./prompts/adminOps');
const { buildBillingIntegrationsPrompt } = require('./prompts/billingIntegrations');
const { buildPolishDeploymentPrompt }    = require('./prompts/polishDeployment');
const limits                             = require('../../../config/limits');
const logger                             = require('../../../utils/logger');

const PASS_TIMEOUT_MS = parseInt(process.env.PASS_TIMEOUT_MS || '600000', 10); // 10 min per pass

/**
 * @param {import('./types').GenerationPassName} passName
 * @param {import('./types').PassContext} ctx
 * @returns {{ system: string, user: string }}
 */
function buildPassPrompt(passName, ctx) {
  switch (passName) {
    case 'scaffold_html':        return buildScaffoldPrompt(ctx);
    case 'css_design_system':    return buildCssPrompt(ctx);
    case 'javascript_core':      return buildJavaScriptPrompt(ctx);
    case 'admin_ops':            return buildAdminOpsPrompt(ctx);
    case 'billing_integrations': return buildBillingIntegrationsPrompt(ctx);
    case 'polish_deployment':    return buildPolishDeploymentPrompt(ctx);
    default: throw new Error(`Unknown pass name: ${passName}`);
  }
}

/**
 * Execute a single generation pass. Streams from Claude and parses ---FILE--- blocks.
 *
 * @param {import('./types').GenerationPassConfig} passConfig
 * @param {import('./types').PassContext} ctx
 * @param {object} [cost] - cost tracker
 * @param {Function} [onFileFound] - called each time a new file block is detected
 * @returns {Promise<import('./types').GenerationPassResult>}
 */
async function runPass(passConfig, ctx, cost, onFileFound) {
  logger.info(`multiPass[${passConfig.name}]: starting (budget=${passConfig.tokenBudget})`);

  const { system, user } = buildPassPrompt(passConfig.name, ctx);

  let raw       = '';
  let fileCount = 0;

  const onChunk = (delta) => {
    raw += delta;
    const newCount = (raw.match(/---FILE:/g) || []).length;
    if (newCount > fileCount) {
      fileCount = newCount;
      if (onFileFound) onFileFound(fileCount, passConfig.label);
    }
  };

  try {
    await withTimeout(
      callClaudeStream(system, user, { model: SONNET_MODEL, maxTokens: passConfig.tokenBudget }, onChunk),
      PASS_TIMEOUT_MS,
      `Pass: ${passConfig.label}`,
    );

    if (cost) cost.record(`pass-${passConfig.name}`, system, user, raw, { model: SONNET_MODEL });

    const { success, files, error } = parseFileDelimited(raw);
    const warnings = [];
    const unresolvedItems = [];

    if (!success || !files || files.length === 0) {
      logger.warn(`multiPass[${passConfig.name}]: no ---FILE--- blocks returned`);
      warnings.push(`Pass produced no parseable file output: ${error || 'unknown'}`);
    }

    const filesProduced = (files || []).length;
    logger.info(`multiPass[${passConfig.name}]: produced ${filesProduced} file(s)`);

    return {
      passName:       passConfig.name,
      label:          passConfig.label,
      files:          files || [],
      warnings,
      unresolvedItems,
      summary:        `${passConfig.label}: ${filesProduced} file(s) generated`,
      skipped:        false,
      tokenBudget:    passConfig.tokenBudget,
      filesProduced,
    };
  } catch (err) {
    logger.warn(`multiPass[${passConfig.name}]: failed — ${err.message}`);
    return {
      passName:       passConfig.name,
      label:          passConfig.label,
      files:          [],
      warnings:       [`Pass failed: ${err.message}`],
      unresolvedItems: [],
      summary:        `${passConfig.label}: failed`,
      skipped:        true,
      tokenBudget:    passConfig.tokenBudget,
      filesProduced:  0,
    };
  }
}

module.exports = { runPass, buildPassPrompt };
