/**
 * Centralized generation limits — all values env-var overridable.
 */
module.exports = {
  // ── Prompt validation ────────────────────────────────────────────────────────
  MAX_PROMPT_CHARS: parseInt(process.env.MAX_PROMPT_CHARS || '3000', 10),
  MAX_PROMPT_WORDS: parseInt(process.env.MAX_PROMPT_WORDS || '500',  10),

  // ── Per-job output limits ────────────────────────────────────────────────────
  MAX_FILES_PER_JOB:        parseInt(process.env.MAX_FILES_PER_JOB        || '60',      10),
  MAX_FILE_SIZE_BYTES:      parseInt(process.env.MAX_FILE_SIZE_BYTES      || '200000',  10),
  MAX_TOTAL_OUTPUT_BYTES:   parseInt(process.env.MAX_TOTAL_OUTPUT_BYTES   || '4194304', 10), // 4MB
  MAX_TOTAL_TOKENS_PER_JOB: parseInt(process.env.MAX_TOTAL_TOKENS_PER_JOB || '600000',  10),
  SIMPLE_MAX_FILES:         parseInt(process.env.SIMPLE_MAX_FILES         || '10',      10),
  MEDIUM_MAX_FILES:         parseInt(process.env.MEDIUM_MAX_FILES         || '25',      10),

  // ── Global job timeout ───────────────────────────────────────────────────────
  MAX_JOB_DURATION_MS: parseInt(process.env.MAX_JOB_DURATION_MS || '900000', 10),

  // ── Planner timeouts ─────────────────────────────────────────────────────────
  SIMPLE_PLANNER_TIMEOUT_MS:   parseInt(process.env.SIMPLE_PLANNER_TIMEOUT_MS   || '5000',  10),
  BALANCED_PLANNER_TIMEOUT_MS: parseInt(process.env.BALANCED_PLANNER_TIMEOUT_MS || '20000', 10),
  QUALITY_PLANNER_TIMEOUT_MS:  parseInt(process.env.QUALITY_PLANNER_TIMEOUT_MS  || '35000', 10),

  // ── Stage timeouts ───────────────────────────────────────────────────────────
  CODER_TIMEOUT_MS:    parseInt(process.env.CODER_TIMEOUT_MS    || '600000', 10), // 10 min for large multi-file outputs
  REVIEW_TIMEOUT_MS:   parseInt(process.env.REVIEW_TIMEOUT_MS   || '90000',  10),
  FINALIZE_TIMEOUT_MS: parseInt(process.env.FINALIZE_TIMEOUT_MS || '60000',  10),

  // ── Auto-fix (post-generation self-healing) ──────────────────────────────────
  AUTOFIX_TIMEOUT_MS:  parseInt(process.env.AUTOFIX_TIMEOUT_MS  || '60000', 10),
  // Max AI fix rounds after the free quick-fix pass (each round = 1 extra API call)
  AUTOFIX_MAX_ROUNDS:  parseInt(process.env.AUTOFIX_MAX_ROUNDS  || '1',     10),

  // ── Retry config ─────────────────────────────────────────────────────────────
  CODER_MAX_RETRIES: parseInt(process.env.CODER_MAX_RETRIES || '2', 10),

  // ── Template-hybrid content extraction ──────────────────────────────────────
  // Max tokens for the tiny content-extraction API call in template-hybrid mode.
  CONTENT_EXTRACTION_TOKENS: parseInt(process.env.CONTENT_EXTRACTION_TOKENS || '600', 10),

  // ── Concurrency ──────────────────────────────────────────────────────────────
  MAX_CONCURRENT_JOBS: parseInt(process.env.MAX_CONCURRENT_JOBS || '1', 10),

  // ── Token budgets per mode ───────────────────────────────────────────────────
  // Note: these apply to full-generation calls only.
  // Template-hybrid uses CONTENT_EXTRACTION_TOKENS (600) instead.
  //
  // Fast (Haiku):    5-10 files, 10K output  — cheap & quick
  // Balanced (Sonnet): 12-30 files, 32K output — solid full-stack apps
  // Quality (Sonnet):  20-60 files, 48K output — production-grade
  MODE_TOKENS: {
    fast:     { planner: 300,  coder: 10000, reviewer: 0     },
    balanced: { planner: 600,  coder: 32000, reviewer: 1000  },
    quality:  { planner: 900,  coder: 48000, reviewer: 2000  },
  },

  MODE_MAX_FILES: {
    fast:     10,
    balanced: 30,
    quality:  60,
  },

  // ── Edit pipeline token budgets (per tier) ──────────────────────────────────
  // Tier 0: local transform — no model call
  // Tier 1: CSS/copy targeted — single file, compact prompt
  // Tier 2: layout/component — multi-file, focused prompt
  // Tier 3: full context — bugs, new features, general edits
  EDIT_TIER_TOKENS: {
    0: 0,
    1: 3000,
    2: 7000,
    3: 14000,
  },

  // Max total file context chars to send per edit tier
  EDIT_TIER_CONTEXT_CHARS: {
    1: 8_000,
    2: 16_000,
    3: 28_000,
  },

  // Max chars per individual file per edit tier
  EDIT_TIER_FILE_CAP_CHARS: {
    1: 4_000,
    2: 6_000,
    3: 8_000,
  },
};
