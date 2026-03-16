'use strict';

/**
 * Prompt Deduplication
 *
 * Detects identical or near-identical prompts and returns a cached LLM result
 * instead of making a new API call.
 *
 * Two matching strategies:
 *   - Exact match (after normalization): always a hit
 *   - Trigram Jaccard similarity above threshold: near-hit (opt-in)
 *
 * Cache is in-memory and per-process. Entries expire after a configurable TTL.
 */

const crypto = require('crypto');

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_TTL_MS       = 30 * 60 * 1000;  // 30 minutes
const MAX_ENTRIES          = 500;
const SIMILARITY_THRESHOLD = 0.85;             // Jaccard trigram threshold

// ── State ─────────────────────────────────────────────────────────────────────

// Map<hash, { result, expiresAt, hitCount, normalizedPrompt }>
const _cache = new Map();

let _totalLookups = 0;
let _cacheHits    = 0;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic 16-char hash for a prompt (normalized).
 *
 * @param {string} prompt
 * @returns {string}
 */
function hashPrompt(prompt) {
  const normalized = _normalize(prompt);
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Look up a cached result for a prompt.
 * Returns null if no valid (non-expired) entry exists.
 *
 * @param {string} prompt
 * @param {Object} [opts]
 * @param {boolean} [opts.checkSimilar=false] - Also scan for near-identical prompts
 * @returns {{ result: *, hash: string, fromCache: true, similar?: boolean } | null}
 */
function getCachedResult(prompt, opts = {}) {
  _totalLookups++;
  _evictExpired();

  const hash  = hashPrompt(prompt);
  const entry = _cache.get(hash);

  if (entry && entry.expiresAt > Date.now()) {
    entry.hitCount++;
    _cacheHits++;
    return { result: entry.result, hash, fromCache: true };
  }

  // Near-match scan (only when cache is small enough to avoid O(n) perf hit)
  if (opts.checkSimilar && _cache.size <= 100) {
    const normalized = _normalize(prompt);
    for (const [cachedHash, cachedEntry] of _cache) {
      if (cachedEntry.expiresAt <= Date.now()) continue;
      const sim = _jaccardSimilarity(normalized, cachedEntry.normalizedPrompt || '');
      if (sim >= SIMILARITY_THRESHOLD) {
        cachedEntry.hitCount++;
        _cacheHits++;
        return { result: cachedEntry.result, hash: cachedHash, fromCache: true, similar: true, similarity: sim };
      }
    }
  }

  return null;
}

/**
 * Store an LLM result in the deduplication cache.
 *
 * @param {string} prompt
 * @param {*}      result
 * @param {number} [ttlMs]
 * @returns {string} hash
 */
function cacheResult(prompt, result, ttlMs = DEFAULT_TTL_MS) {
  _evictIfFull();
  const hash = hashPrompt(prompt);
  _cache.set(hash, {
    result,
    expiresAt:        Date.now() + ttlMs,
    hitCount:         0,
    normalizedPrompt: _normalize(prompt),
  });
  return hash;
}

/**
 * Check whether a valid cache entry exists (without incrementing the hit counter).
 *
 * @param {string} prompt
 * @returns {boolean}
 */
function hasCachedResult(prompt) {
  const entry = _cache.get(hashPrompt(prompt));
  return !!entry && entry.expiresAt > Date.now();
}

/**
 * Invalidate the cache entry for a specific prompt.
 * @param {string} prompt
 */
function invalidate(prompt) {
  _cache.delete(hashPrompt(prompt));
}

/**
 * Clear the entire deduplication cache and reset stats.
 */
function clearCache() {
  _cache.clear();
  _totalLookups = 0;
  _cacheHits    = 0;
}

/**
 * Return deduplication hit-rate stats.
 * @returns {{ totalLookups: number, cacheHits: number, hitRate: number, cacheSize: number }}
 */
function getDeduplicationStats() {
  return {
    totalLookups: _totalLookups,
    cacheHits:    _cacheHits,
    hitRate:      _totalLookups > 0 ? Math.round((_cacheHits / _totalLookups) * 100) : 0,
    cacheSize:    _cache.size,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _normalize(text) {
  return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function _evictExpired() {
  const now = Date.now();
  for (const [key, entry] of _cache) {
    if (entry.expiresAt <= now) _cache.delete(key);
  }
}

function _evictIfFull() {
  if (_cache.size < MAX_ENTRIES) return;
  // Remove oldest expiry
  let oldest     = null;
  let oldestTime = Infinity;
  for (const [key, entry] of _cache) {
    if (entry.expiresAt < oldestTime) {
      oldestTime = entry.expiresAt;
      oldest     = key;
    }
  }
  if (oldest) _cache.delete(oldest);
}

/**
 * Jaccard similarity on character trigrams.
 * @param {string} a
 * @param {string} b
 * @returns {number} 0–1
 */
function _jaccardSimilarity(a, b) {
  if (!a || !b) return 0;
  const ta = _trigrams(a);
  const tb = _trigrams(b);
  const union        = new Set([...ta, ...tb]);
  const intersection = new Set([...ta].filter(t => tb.has(t)));
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function _trigrams(str) {
  const set = new Set();
  for (let i = 0; i <= str.length - 3; i++) {
    set.add(str.slice(i, i + 3));
  }
  return set;
}

module.exports = {
  hashPrompt,
  getCachedResult,
  cacheResult,
  hasCachedResult,
  invalidate,
  clearCache,
  getDeduplicationStats,
};
