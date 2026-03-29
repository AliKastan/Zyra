const axios = require('axios');
const { env } = require('../config/env');
const logger = require('../utils/logger');

const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';
const DEFAULT_MODEL = 'kimi-latest';
const MAX_TOKENS = 8192;

/**
 * Sends a prompt to the Kimi (Moonshot) API.
 * Uses the OpenAI-compatible chat completions format.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} options - { model, maxTokens }
 * @returns {Promise<string>} - text content of the response
 */
async function callKimi(systemPrompt, userPrompt, options = {}) {
  if (!env.KIMI_API_KEY) {
    throw new Error('KIMI_API_KEY is not set. Cannot call Kimi.');
  }

  const model = options.model || DEFAULT_MODEL;
  const maxTokens = options.maxTokens || MAX_TOKENS;

  logger.debug('Calling Kimi', { model, maxTokens });

  const response = await axios.post(
    KIMI_API_URL,
    {
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${env.KIMI_API_KEY}`,
        'content-type': 'application/json',
      },
      timeout: 600_000,
    }
  );

  const choice = response.data?.choices?.[0];
  if (!choice) {
    throw new Error('Kimi returned no choices');
  }

  const text = choice.message?.content;
  if (!text) {
    throw new Error('Kimi response contained no content');
  }

  return text;
}

module.exports = { callKimi };
