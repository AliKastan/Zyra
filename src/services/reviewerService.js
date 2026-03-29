const { callClaude, HAIKU_MODEL } = require('../providers/anthropicProvider');
const { callOpenAI } = require('../providers/openaiProvider');
const { callKimi } = require('../providers/kimiProvider');
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
 * Only runs in quality mode for complex projects — always non-fatal.
 * @param {string} projectName
 * @param {Array<{path, content}>} files
 * @param {string} mode - 'balanced' | 'quality'
 * @returns {Promise<object>} review result (never throws)
 */
async function runReviewer(projectName, files, mode = 'balanced') {
  const maxTokens = limits.MODE_TOKENS[mode]?.reviewer ?? limits.MODE_TOKENS['balanced']?.reviewer ?? 2000;
  const modelName = env.DEFAULT_REVIEW_MODEL;
  const { system, user } = buildReviewerPrompt(projectName, files);

  logger.info(`reviewerService: model="${modelName}" mode="${mode}"`);

  // Reviewer outputs tiny JSON — Haiku is sufficient and much cheaper
  const call = modelName === 'openai'
    ? callOpenAI(system, user, { maxTokens })
    : modelName === 'kimi'
    ? callKimi(system, user, { maxTokens })
    : callClaude(system, user, { maxTokens, model: HAIKU_MODEL });

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
