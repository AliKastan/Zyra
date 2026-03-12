const { callClaude } = require('../providers/anthropicProvider');
const { callOpenAI } = require('../providers/openaiProvider');
const { buildReviewerPrompt } = require('../generators/promptBuilder');
const { safeJsonParse } = require('../utils/safeJsonParse');
const { withTimeout } = require('../utils/withTimeout');
const { env } = require('../config/env');
const limits = require('../config/limits');
const logger = require('../utils/logger');

const SKIPPED_RESULT = (reason) => ({
  passed: null,
  issues: [],
  suggestions: [],
  summary: `Review skipped: ${reason}`,
  skipped: true,
});

/**
 * Runs the review stage.
 * In fast mode, review is skipped entirely to save time and tokens.
 * @param {string} projectName
 * @param {Array<{path, content}>} files
 * @param {string} mode - 'fast' | 'balanced' | 'quality'
 * @returns {Promise<object>} review result (never throws)
 */
async function runReviewer(projectName, files, mode = 'balanced') {
  if (mode === 'fast') {
    logger.info('reviewerService: skipped (fast mode)');
    return SKIPPED_RESULT('fast mode');
  }

  const maxTokens = limits.MODE_TOKENS[mode]?.reviewer || 2000;
  const modelName = env.DEFAULT_REVIEW_MODEL;
  const { system, user } = buildReviewerPrompt(projectName, files);

  logger.info(`reviewerService: model="${modelName}" mode="${mode}"`);

  const call = modelName === 'openai'
    ? callOpenAI(system, user, { maxTokens })
    : callClaude(system, user, { maxTokens });

  let raw;
  try {
    raw = await withTimeout(call, limits.REVIEW_TIMEOUT_MS, 'Reviewer');
  } catch (err) {
    logger.warn(`reviewerService: ${err.message} — continuing`);
    return SKIPPED_RESULT(err.message);
  }

  const { success, data } = safeJsonParse(raw);
  if (!success) {
    logger.warn('reviewerService: could not parse response — continuing');
    return SKIPPED_RESULT('could not parse response');
  }

  logger.success(`reviewerService: complete — passed=${data.passed}`);
  return data;
}

module.exports = { runReviewer };
