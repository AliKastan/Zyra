const axios = require('axios');
const { env } = require('../config/env');
const logger = require('../utils/logger');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-opus-4-6';
const MAX_TOKENS = 8192;

/**
 * Sends a prompt to the Anthropic Claude API.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} options - { model, maxTokens }
 * @returns {Promise<string>} - text content of the response
 */
async function callClaude(systemPrompt, userPrompt, options = {}) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Cannot call Claude.');
  }

  const model = options.model || DEFAULT_MODEL;
  const maxTokens = options.maxTokens || MAX_TOKENS;

  logger.debug('Calling Claude', { model, maxTokens });

  const response = await axios.post(
    ANTHROPIC_API_URL,
    {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    },
    {
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 120000,
    }
  );

  const content = response.data?.content;
  if (!content || !Array.isArray(content) || content.length === 0) {
    throw new Error('Claude returned an empty response');
  }

  const text = content.find((c) => c.type === 'text')?.text;
  if (!text) {
    throw new Error('Claude response contained no text block');
  }

  return text;
}

module.exports = { callClaude };
