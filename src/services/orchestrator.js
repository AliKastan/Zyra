const { env } = require('../config/env');
const logger = require('../utils/logger');

/**
 * The orchestrator decides which provider handles each task type.
 * This is the routing brain of Zyra.
 *
 * Task types:
 *   - 'plan'    -> DEFAULT_PLANNER_MODEL
 *   - 'code'    -> DEFAULT_CODER_MODEL
 *   - 'review'  -> DEFAULT_REVIEW_MODEL
 *   - 'repair'  -> openai (JSON repair is best suited to GPT)
 */
function resolveModel(taskType) {
  const routes = {
    plan: env.DEFAULT_PLANNER_MODEL,
    code: env.DEFAULT_CODER_MODEL,
    review: env.DEFAULT_REVIEW_MODEL,
    repair: 'openai', // JSON repair always uses OpenAI if available
  };

  const model = routes[taskType];
  if (!model) {
    logger.warn(`orchestrator: unknown task type "${taskType}", defaulting to claude`);
    return 'claude';
  }

  logger.debug(`orchestrator: routed task="${taskType}" -> model="${model}"`);
  return model;
}

/**
 * Validates that the required provider for a task type has its API key set.
 * Throws an error if the key is missing.
 */
function assertProviderAvailable(taskType) {
  const model = resolveModel(taskType);

  if (model === 'claude' && !env.ANTHROPIC_API_KEY) {
    throw new Error(
      `Task "${taskType}" is routed to Claude, but ANTHROPIC_API_KEY is not set.`
    );
  }
  if (model === 'openai' && !env.OPENAI_API_KEY) {
    throw new Error(
      `Task "${taskType}" is routed to OpenAI, but OPENAI_API_KEY is not set.`
    );
  }
  if (model === 'kimi' && !env.KIMI_API_KEY) {
    throw new Error(
      `Task "${taskType}" is routed to Kimi, but KIMI_API_KEY is not set.`
    );
  }
}

/**
 * Returns a summary of current routing config.
 */
function getRoutingConfig() {
  return {
    plan: env.DEFAULT_PLANNER_MODEL,
    code: env.DEFAULT_CODER_MODEL,
    review: env.DEFAULT_REVIEW_MODEL,
    repair: 'openai',
    anthropicKeySet: !!env.ANTHROPIC_API_KEY,
    openaiKeySet: !!env.OPENAI_API_KEY,
    kimiKeySet: !!env.KIMI_API_KEY,
  };
}

module.exports = { resolveModel, assertProviderAvailable, getRoutingConfig };
