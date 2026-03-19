/**
 * In-memory generation cache.
 *
 * Caches completed generation results keyed on a normalized prompt hash + mode.
 * Eliminates all API calls on repeated identical requests (~100% savings on cache hits).
 *
 * TTL: 2 hours. Max entries: 200 (LRU-eviction via insertion order).
 * No disk persistence — restarts clear the cache (safe, conservative default).
 */

const crypto = require('crypto');

const TTL_MS    = 2 * 60 * 60 * 1000; // 2 hours
const MAX_SIZE  = 200;

// Map<key, { result, expiresAt, hits }>
const cache = new Map();

/**
 * Normalizes a prompt for cache key generation.
 * Strips excess whitespace, lowercases, and collapses punctuation variance.
 */
function normalizePrompt(prompt) {
  return prompt
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns a cache key for a given prompt + mode combination.
 */
function cacheKey(prompt, mode) {
  const normalized = normalizePrompt(prompt);
  return crypto.createHash('sha256').update(`${mode}::${normalized}`).digest('hex').slice(0, 16);
}

/**
 * Looks up a cached result. Returns null on miss or expiry.
 *
 * @param {string} prompt
 * @param {string} mode
 * @returns {{ result: object, hits: number } | null}
 */
function getCached(prompt, mode) {
  const key   = cacheKey(prompt, mode);
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  entry.hits++;
  // Refresh TTL on access (keep hot entries alive)
  entry.expiresAt = Date.now() + TTL_MS;
  return { result: entry.result, hits: entry.hits };
}

/**
 * Stores a generation result in the cache.
 * Evicts the oldest entry when the cache is full.
 *
 * @param {string} prompt
 * @param {string} mode
 * @param {object} result - the completed generation result (files, projectName, etc.)
 */
function setCached(prompt, mode, result) {
  const key = cacheKey(prompt, mode);

  // LRU eviction: delete oldest entry when at capacity
  if (cache.size >= MAX_SIZE && !cache.has(key)) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }

  cache.set(key, {
    result,
    expiresAt: Date.now() + TTL_MS,
    hits: 0,
  });
}

/**
 * Returns current cache statistics for logging/monitoring.
 */
function cacheStats() {
  let active = 0;
  const now = Date.now();
  for (const entry of cache.values()) {
    if (now <= entry.expiresAt) active++;
  }
  return { size: cache.size, active };
}

// Purge expired entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) cache.delete(key);
  }
}, 30 * 60 * 1000);

module.exports = { getCached, setCached, cacheKey, cacheStats };
