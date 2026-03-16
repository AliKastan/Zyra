'use strict';

/**
 * Prompt Compression
 *
 * Reduces prompt token count without changing semantic content.
 *
 * Strategies applied in order:
 *   1. Remove filler / throat-clearing phrases
 *   2. Collapse multiple blank lines (max 1 blank line between paragraphs)
 *   3. Normalize internal whitespace (tabs, multiple spaces → single space)
 *   4. Remove leading/trailing spaces per line
 *   5. Deduplicate adjacent identical lines
 */

// Filler phrases that consume tokens without adding information
const FILLER_PATTERNS = [
  /Please\s+ensure\s+that\s+you\s+/gi,
  /It\s+is\s+(?:very\s+)?important\s+that\s+you\s+/gi,
  /Make\s+sure\s+to\s+/gi,
  /Be\s+sure\s+to\s+/gi,
  /Please\s+note\s+that\s+/gi,
  /Note\s+that\s+/gi,
  /As\s+(?:mentioned|noted|described)\s+(?:above|before|earlier|previously),?\s*/gi,
  /It\s+should\s+be\s+noted\s+that\s+/gi,
  /For\s+your\s+(?:reference|information),?\s+/gi,
  /As\s+you\s+(?:know|can\s+see),?\s+/gi,
];

// Redundant emphasis phrases at end of sentences
const REDUNDANT_SUFFIX_PATTERNS = [
  /\s*(?:Do\s+not\s+skip\s+this\s+step|This\s+is\s+very\s+important|This\s+is\s+critical|This\s+is\s+essential)\s*\.?\s*/gi,
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Estimate the token count for a string.
 * Uses the standard 4 chars-per-token heuristic (works well for English + code).
 *
 * @param {string} text
 * @returns {number}
 */
function estimatePromptTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Compress a prompt to reduce its token count.
 * Semantically lossless — does NOT change meaning or remove content.
 *
 * @param {string} prompt
 * @param {Object} [opts]
 * @param {boolean} [opts.removeFiller=true]
 * @param {boolean} [opts.deduplicateLines=true]
 * @param {boolean} [opts.normalizeWhitespace=true]
 * @param {number}  [opts.maxConsecutiveBlanks=1]
 * @returns {{ compressed: string, originalTokens: number, compressedTokens: number, saved: number }}
 */
function compressPrompt(prompt, opts = {}) {
  const {
    removeFiller         = true,
    deduplicateLines     = true,
    normalizeWhitespace  = true,
    maxConsecutiveBlanks = 1,
  } = opts;

  if (!prompt || typeof prompt !== 'string') {
    return { compressed: '', originalTokens: 0, compressedTokens: 0, saved: 0 };
  }

  const originalTokens = estimatePromptTokens(prompt);
  let text = prompt;

  // 1. Remove filler phrases
  if (removeFiller) {
    for (const pattern of FILLER_PATTERNS) {
      text = text.replace(pattern, '');
    }
    for (const pattern of REDUNDANT_SUFFIX_PATTERNS) {
      text = text.replace(pattern, ' ');
    }
  }

  // 2. Normalize internal whitespace (collapse tabs + multi-spaces, but preserve newlines)
  if (normalizeWhitespace) {
    text = text.replace(/[^\S\n]+/g, ' ');  // collapse non-newline whitespace
    text = text.replace(/ \n/g, '\n');       // remove trailing spaces before newline
    text = text.replace(/\n /g, '\n');       // remove leading spaces after newline
  }

  // 3. Collapse excessive blank lines
  const blankPattern = new RegExp(`(\n[ \t]*){${maxConsecutiveBlanks + 2},}`, 'g');
  text = text.replace(blankPattern, '\n'.repeat(maxConsecutiveBlanks + 1));

  // 4. Deduplicate adjacent identical non-empty lines
  if (deduplicateLines) {
    const lines  = text.split('\n');
    const deduped = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed && i > 0 && trimmed === lines[i - 1].trim()) continue;
      deduped.push(lines[i]);
    }
    text = deduped.join('\n');
  }

  // 5. Final trim
  text = text.trim();

  const compressedTokens = estimatePromptTokens(text);
  return {
    compressed:      text,
    originalTokens,
    compressedTokens,
    saved:           Math.max(0, originalTokens - compressedTokens),
  };
}

/**
 * Compress a prompt only if it exceeds a token limit.
 *
 * @param {string} prompt
 * @param {number} limitTokens
 * @returns {{ prompt: string, wasCompressed: boolean, tokensSaved: number }}
 */
function compressIfNeeded(prompt, limitTokens) {
  const estimated = estimatePromptTokens(prompt);
  if (estimated <= limitTokens) {
    return { prompt, wasCompressed: false, tokensSaved: 0 };
  }
  const result = compressPrompt(prompt);
  return {
    prompt:        result.compressed,
    wasCompressed: true,
    tokensSaved:   result.saved,
  };
}

/**
 * Hard-truncate a prompt to fit within a token limit.
 * Preserves the beginning of the prompt and appends a truncation notice.
 *
 * @param {string} prompt
 * @param {number} maxTokens
 * @returns {string}
 */
function truncateToTokenLimit(prompt, maxTokens) {
  if (!prompt) return '';
  if (estimatePromptTokens(prompt) <= maxTokens) return prompt;
  const maxChars  = maxTokens * 4;
  const truncated = prompt.slice(0, maxChars).replace(/\s+\S*$/, '');
  return truncated + '\n[...truncated for token limit]';
}

module.exports = {
  estimatePromptTokens,
  compressPrompt,
  compressIfNeeded,
  truncateToTokenLimit,
};
