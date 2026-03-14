const axios = require('axios');
const { env } = require('../config/env');
const logger = require('../utils/logger');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Model tiers — use the cheapest model that can do the job:
// Haiku:  $0.80/MTok input, $4/MTok output  — fast tasks (planner, reviewer, autofix, fast-mode code)
// Sonnet: $3/MTok input,   $15/MTok output  — full code generation (balanced/quality modes)
// Opus:   $15/MTok input,  $75/MTok output  — reserved, not used by default
const HAIKU_MODEL  = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';

const DEFAULT_MODEL = SONNET_MODEL; // fallback — never use Opus by default
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
      timeout: 600_000, // 10 min — Sonnet at 14K-28K output tokens can take 3-8 minutes
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

/**
 * Streams a response from the Anthropic Claude API.
 * Calls onChunk(textDelta, fullTextSoFar) for every streamed text chunk.
 * Returns the complete text when the stream ends.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} options - { model, maxTokens }
 * @param {Function} onChunk - (delta: string, full: string) => void
 * @returns {Promise<string>} - complete text content
 */
async function callClaudeStream(systemPrompt, userPrompt, options = {}, onChunk) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Cannot call Claude.');
  }

  const model     = options.model     || DEFAULT_MODEL;
  const maxTokens = options.maxTokens || MAX_TOKENS;

  logger.debug('Calling Claude (stream)', { model, maxTokens });

  const response = await axios.post(
    ANTHROPIC_API_URL,
    {
      model,
      max_tokens: maxTokens,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    },
    {
      headers: {
        'x-api-key':           env.ANTHROPIC_API_KEY,
        'anthropic-version':   '2023-06-01',
        'content-type':        'application/json',
      },
      responseType: 'stream',
      timeout: 300_000, // 5 min socket inactivity timeout (overall capped by withTimeout)
    }
  );

  return new Promise((resolve, reject) => {
    let fullText = '';
    let buffer   = '';

    response.data.on('data', (raw) => {
      buffer += raw.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep last incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            const text = evt.delta.text || '';
            fullText  += text;
            if (onChunk) onChunk(text, fullText);
          }
        } catch (_) {}
      }
    });

    response.data.on('end',   () => resolve(fullText));
    response.data.on('error', reject);
  });
}

module.exports = { callClaude, callClaudeStream, HAIKU_MODEL, SONNET_MODEL };
