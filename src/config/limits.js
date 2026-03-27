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
  SIMPLE_MAX_FILES:         parseInt(process.env.SIMPLE_MAX_FILES         || '6',       10),
  MEDIUM_MAX_FILES:         parseInt(process.env.MEDIUM_MAX_FILES         || '14',      10),

  // ── Global job timeout ───────────────────────────────────────────────────────
  // Template pipeline: 1 Haiku classify + 3 Haiku modify + fix passes = ~2-5 min
  MAX_JOB_DURATION_MS: parseInt(process.env.MAX_JOB_DURATION_MS || '600000', 10), // 10 min ceiling

  // ── Planner timeouts ─────────────────────────────────────────────────────────
  SIMPLE_PLANNER_TIMEOUT_MS:   parseInt(process.env.SIMPLE_PLANNER_TIMEOUT_MS   || '5000',  10),
  BALANCED_PLANNER_TIMEOUT_MS: parseInt(process.env.BALANCED_PLANNER_TIMEOUT_MS || '20000', 10),
  QUALITY_PLANNER_TIMEOUT_MS:  parseInt(process.env.QUALITY_PLANNER_TIMEOUT_MS  || '35000', 10),

  // ── Stage timeouts ───────────────────────────────────────────────────────────
  CODER_TIMEOUT_MS:    parseInt(process.env.CODER_TIMEOUT_MS    || '180000', 10), // 3 min — Haiku is much faster
  REVIEW_TIMEOUT_MS:   parseInt(process.env.REVIEW_TIMEOUT_MS   || '90000',  10),
  FINALIZE_TIMEOUT_MS: parseInt(process.env.FINALIZE_TIMEOUT_MS || '60000',  10),

  // ── Advanced pipeline stage timeouts (all Sonnet — generous for quality) ────
  // Stage 1.5: requirement inference — deterministic + optional LLM (~0-10s)
  INFERENCE_TIMEOUT_MS:  parseInt(process.env.INFERENCE_TIMEOUT_MS  || '15000', 10),
  // Stage 1.8: complexity scoring — deterministic, near-instant (~0-5s)
  COMPLEXITY_TIMEOUT_MS: parseInt(process.env.COMPLEXITY_TIMEOUT_MS || '10000', 10),
  // Stage 1: deep intent analysis — 1500 tokens output, ~20-40s for rich spec
  INTENT_TIMEOUT_MS:    parseInt(process.env.INTENT_TIMEOUT_MS    || '60000',  10),
  // Stage 2: full product spec — 2500 tokens output, ~30-60s for detailed pages/models
  PRODUCT_TIMEOUT_MS:   parseInt(process.env.PRODUCT_TIMEOUT_MS   || '90000',  10),
  // Stage 3: architecture plan — 1500 tokens output, ~20-40s
  STACK_TIMEOUT_MS:     parseInt(process.env.STACK_TIMEOUT_MS     || '60000',  10),
  // Stage 4: blueprint — 4000 tokens output, ~60-120s for complete design system + specs
  BLUEPRINT_TIMEOUT_MS: parseInt(process.env.BLUEPRINT_TIMEOUT_MS || '180000', 10),
  // Stage 6.5: generation validator — deterministic, near-instant (~0-5s); async LLM variant up to ~15s
  VALIDATOR_TIMEOUT_MS: parseInt(process.env.VALIDATOR_TIMEOUT_MS || '8000', 10),
  // Stage 7: repair pass — up to 12000 tokens output
  REPAIR_TIMEOUT_MS:    parseInt(process.env.REPAIR_TIMEOUT_MS    || '180000', 10),
  REPAIR_MAX_TOKENS:    parseInt(process.env.REPAIR_MAX_TOKENS    || '12000',  10),

  // ── Auto-fix (syntax self-healing) ───────────────────────────────────────────
  AUTOFIX_TIMEOUT_MS:  parseInt(process.env.AUTOFIX_TIMEOUT_MS  || '60000', 10),
  // Max AI syntax-fix rounds after the quick-fix pass (each = 1 extra API call)
  AUTOFIX_MAX_ROUNDS:  parseInt(process.env.AUTOFIX_MAX_ROUNDS  || '2',     10),

  // ── Game-fix (playability repair) ────────────────────────────────────────────
  GAME_FIX_TIMEOUT_MS: parseInt(process.env.GAME_FIX_TIMEOUT_MS || '120000', 10), // 2 min
  GAME_FIX_MAX_ROUNDS: parseInt(process.env.GAME_FIX_MAX_ROUNDS || '2',      10),
  // Output token budgets for game-fix call per mode
  GAME_FIX_TOKENS: {
    fast:     parseInt(process.env.GAME_FIX_TOKENS_FAST     || '8000',  10),
    balanced: parseInt(process.env.GAME_FIX_TOKENS_BALANCED || '12000', 10),
    quality:  parseInt(process.env.GAME_FIX_TOKENS_QUALITY  || '16000', 10),
  },

  // ── Retry config ─────────────────────────────────────────────────────────────
  CODER_MAX_RETRIES: parseInt(process.env.CODER_MAX_RETRIES || '2', 10),

  // ── Template-hybrid content extraction ──────────────────────────────────────
  // Max tokens for the tiny content-extraction API call in template-hybrid mode.
  CONTENT_EXTRACTION_TOKENS: parseInt(process.env.CONTENT_EXTRACTION_TOKENS || '400', 10),

  // ── Concurrency ──────────────────────────────────────────────────────────────
  MAX_CONCURRENT_JOBS: parseInt(process.env.MAX_CONCURRENT_JOBS || '1', 10),

  // ── Token budgets per mode ───────────────────────────────────────────────────
  // Template-hybrid uses CONTENT_EXTRACTION_TOKENS (~400) instead of these.
  //
  // All modes use Sonnet for game quality — games need reasoning for complete logic.
  // Budgets sized for complete games: 5 screens, 5 levels, audio, particles, boss fights.
  // Fast (Sonnet):     single-file, 12K output  — fast but complete (~$0.06/gen)
  // Balanced (Sonnet): single/multi, 16K output  — good quality (~$0.10/gen)
  // Quality (Sonnet):  multi-file, 28K output — production-grade (~$0.42/gen)
  MODE_TOKENS: {
    fast:     { planner: 200,  coder: 12000, reviewer: 0    },
    balanced: { planner: 400,  coder: 16000, reviewer: 0    },
    quality:  { planner: 600,  coder: 28000, reviewer: 1500 },
  },

  MODE_MAX_FILES: {
    fast:     6,
    balanced: 14,
    quality:  22,
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
