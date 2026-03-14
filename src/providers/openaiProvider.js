const axios = require('axios');
const { env } = require('../config/env');
const logger = require('../utils/logger');

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o';
const MAX_TOKENS = 8192;

/**
 * Sends a prompt to the OpenAI API.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} options - { model, maxTokens }
 * @returns {Promise<string>} - text content of the response
 */
async function callOpenAI(systemPrompt, userPrompt, options = {}) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Cannot call OpenAI.');
  }

  const model = options.model || DEFAULT_MODEL;
  const maxTokens = options.maxTokens || MAX_TOKENS;

  logger.debug('Calling OpenAI', { model, maxTokens });

  const response = await axios.post(
    OPENAI_API_URL,
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
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      timeout: 600_000,
    }
  );

  const choice = response.data?.choices?.[0];
  if (!choice) {
    throw new Error('OpenAI returned no choices');
  }

  const text = choice.message?.content;
  if (!text) {
    throw new Error('OpenAI response contained no content');
  }

  return text;
}

module.exports = { callOpenAI };
