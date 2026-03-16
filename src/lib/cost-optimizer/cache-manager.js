'use strict';

/**
 * Generation Cache Manager
 *
 * TTL-based in-memory cache for expensive pipeline stage outputs.
 * Used to avoid re-running stages whose inputs have not changed.
 *
 * Cached items include:
 *   - Design spec generation
 *   - Complexity scoring
 *   - Intent summaries
 *   - Normalization outputs
 *   - Stage generation outputs (keyed by input hash + stage name)
 *
 * Uses LRU eviction when the cache is full.
 */

const crypto = require('crypto');

// Default TTLs per stage type (milliseconds)
const DEFAULT_TTL_BY_STAGE = {
  complexity:    60 * 60 * 1000,   // 1 h  — deterministic, safe to cache long
  intent:        30 * 60 * 1000,   // 30 m
  normalization: 30 * 60 * 1000,   // 30 m
  designSystem:  60 * 60 * 1000,   // 1 h
  planning:      20 * 60 * 1000,   // 20 m
  blueprint:     20 * 60 * 1000,   // 20 m
  validation:    10 * 60 * 1000,   // 10 m
  ranking:       10 * 60 * 1000,   // 10 m
  default:       15 * 60 * 1000,   // 15 m
};

const MAX_CACHE_SIZE = 200;

// ── CacheManager class ────────────────────────────────────────────────────────

class CacheManager {
  constructor() {
    /** @type {Map<string, { value: *, expiresAt: number, lastAccessed: number, stage: string }>} */
    this._store   = new Map();
    this._hits    = 0;
    this._misses  = 0;
    this._evictions = 0;
  }

  /**
   * Build a deterministic cache key from stage + inputs.
   * @param {string} stage
   * @param {*} inputs  - Any JSON-serializable value
   * @returns {string}
   */
  buildKey(stage, inputs) {
    let payload;
    try { payload = JSON.stringify({ stage, inputs }); }
    catch (_) { payload = `${stage}:${String(inputs)}`; }
    return `${stage}:${crypto.createHash('sha256').update(payload).digest('hex').slice(0, 12)}`;
  }

  /**
   * Get a cached value. Returns null if missing or expired.
   * @param {string} key
   * @returns {* | null}
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) { this._misses++; return null; }
    if (entry.expiresAt <= Date.now()) {
      this._store.delete(key);
      this._misses++;
      return null;
    }
    entry.lastAccessed = Date.now();
    this._hits++;
    return entry.value;
  }

  /**
   * Set a cached value.
   * @param {string} key
   * @param {*}      value
   * @param {string} [stage='default'] - Used for default TTL lookup
   * @param {number} [ttlMs]           - Override TTL
   */
  set(key, value, stage = 'default', ttlMs) {
    this._evictIfFull();
    const ttl = ttlMs ?? DEFAULT_TTL_BY_STAGE[stage] ?? DEFAULT_TTL_BY_STAGE.default;
    this._store.set(key, {
      value,
      expiresAt:    Date.now() + ttl,
      lastAccessed: Date.now(),
      stage,
    });
  }

  /**
   * Check if a key exists and is not expired.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    const entry = this._store.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) { this._store.delete(key); return false; }
    return true;
  }

  /**
   * Invalidate a specific cache key.
   * @param {string} key
   */
  invalidate(key) {
    this._store.delete(key);
  }

  /**
   * Invalidate all entries for a pipeline stage.
   * @param {string} stage
   */
  invalidateStage(stage) {
    for (const [key, entry] of this._store) {
      if (entry.stage === stage) this._store.delete(key);
    }
  }

  /** Clear the entire cache. */
  clear() {
    this._store.clear();
    this._hits      = 0;
    this._misses    = 0;
    this._evictions = 0;
  }

  /**
   * Cache statistics.
   * @returns {{ hits: number, misses: number, size: number, hitRate: number, evictions: number }}
   */
  stats() {
    const total = this._hits + this._misses;
    return {
      hits:       this._hits,
      misses:     this._misses,
      size:       this._store.size,
      hitRate:    total > 0 ? Math.round((this._hits / total) * 100) : 0,
      evictions:  this._evictions,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _evictIfFull() {
    if (this._store.size < MAX_CACHE_SIZE) return;
    // LRU: remove least-recently-accessed entry
    let oldest     = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this._store) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldest     = key;
      }
    }
    if (oldest) { this._store.delete(oldest); this._evictions++; }
  }
}

// ── Module-level singleton + helpers ─────────────────────────────────────────

const _shared = new CacheManager();

/**
 * Get a result from the shared cache.
 * @param {string} stage
 * @param {*} inputs
 * @returns {* | null}
 */
function getCachedResult(stage, inputs) {
  return _shared.get(_shared.buildKey(stage, inputs));
}

/**
 * Store a result in the shared cache.
 * @param {string} stage
 * @param {*} inputs
 * @param {*} result
 * @param {number} [ttlMs]
 */
function setCachedResult(stage, inputs, result, ttlMs) {
  const key = _shared.buildKey(stage, inputs);
  _shared.set(key, result, stage, ttlMs);
}

/**
 * Check if a result exists in the shared cache.
 * @param {string} stage
 * @param {*} inputs
 * @returns {boolean}
 */
function hasCachedResult(stage, inputs) {
  return _shared.has(_shared.buildKey(stage, inputs));
}

module.exports = {
  CacheManager,
  getCachedResult,
  setCachedResult,
  hasCachedResult,
  sharedCache: _shared,
};
