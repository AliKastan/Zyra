const logger = require('./logger');

/**
 * Resilient JSON parser for LLM outputs — 5-tier recovery.
 *
 * Tier 1: Direct parse (no processing)
 * Tier 2: Strip markdown code fences (```json...```)
 * Tier 3: Brace-extraction (first { ... last })
 * Tier 4: Repair — trailing commas + close truncated brackets
 * Tier 5: Re-extract from brace after repair failed on full string (handles prefixed prose)
 */
function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') {
    return { success: false, data: null, error: 'Input is empty or not a string', tier: 0 };
  }

  const s = raw.trim();

  // ── Tier 1: Direct parse ───────────────────────────────────────────────────
  try {
    return { success: true, data: JSON.parse(s), error: null, tier: 1 };
  } catch (_) {}

  // ── Tier 2: Strip markdown code fences ────────────────────────────────────
  const fenceMatch = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    try {
      return { success: true, data: JSON.parse(inner), error: null, tier: 2 };
    } catch (_) {
      // Also attempt repair on fenced content
      const repaired = repairJson(inner);
      if (repaired) {
        try {
          logger.debug('safeJsonParse: tier2+repair succeeded');
          return { success: true, data: JSON.parse(repaired), error: null, tier: 2 };
        } catch (_) {}
      }
    }
  }

  // ── Tier 3: First { ... last } extraction ─────────────────────────────────
  const firstBrace = s.indexOf('{');
  const lastBrace  = s.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = s.slice(firstBrace, lastBrace + 1);
    try {
      return { success: true, data: JSON.parse(candidate), error: null, tier: 3 };
    } catch (_) {}

    // ── Tier 4: Repair on extracted candidate ────────────────────────────────
    const repaired = repairJson(candidate);
    if (repaired) {
      try {
        logger.debug('safeJsonParse: tier4 (repair on extracted) succeeded');
        return { success: true, data: JSON.parse(repaired), error: null, tier: 4 };
      } catch (_) {}
    }
  }

  // ── Tier 5: Repair on full string from first brace (truncated, no closing) ─
  if (firstBrace !== -1) {
    const fromBrace = s.slice(firstBrace);
    const repaired  = repairJson(fromBrace);
    if (repaired) {
      try {
        logger.debug('safeJsonParse: tier5 (repair from brace, no closing) succeeded');
        return { success: true, data: JSON.parse(repaired), error: null, tier: 5 };
      } catch (_) {}
    }
  }

  logger.warn('safeJsonParse: all 5 tiers failed', {
    rawLength: raw.length,
    rawSnippet: raw.slice(0, 300),
  });
  return {
    success: false,
    data:    null,
    error:   'Could not parse JSON from response',
  };
}

// ── Repair helpers ─────────────────────────────────────────────────────────────

/**
 * Attempts to repair common LLM JSON issues.
 * Returns the repaired string, or null if it made no change.
 */
function repairJson(s) {
  if (!s) return null;

  // 1. Fix trailing commas before } or ]
  let repaired = s.replace(/,(\s*[}\]])/g, '$1');

  // 2. Try to close truncated brackets
  const closed = closeTruncatedBrackets(repaired);
  if (closed && closed !== repaired) repaired = closed;

  // Return only if we actually changed something
  return repaired !== s ? repaired : null;
}

/**
 * Parses the bracket/string structure of a JSON string and closes any
 * unclosed brackets, producing a string that might be valid JSON.
 * Returns the original string if already balanced, or the closed version.
 */
function closeTruncatedBrackets(s) {
  const stack   = [];
  let inString  = false;
  let escaped   = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escaped)              { escaped = false; continue; }
    if (c === '\\' && inString) { escaped = true;  continue; }
    if (c === '"')            { inString = !inString; continue; }
    if (inString)             { continue; }
    if (c === '{' || c === '[') { stack.push(c); continue; }
    if (c === '}' || c === ']') { stack.pop();   continue; }
  }

  if (stack.length === 0 && !inString) return s; // Already balanced

  let suffix = '';
  if (inString) suffix += '"'; // Close dangling string first

  for (let j = stack.length - 1; j >= 0; j--) {
    suffix += stack[j] === '{' ? '}' : ']';
  }

  return s + suffix;
}

module.exports = { safeJsonParse };
