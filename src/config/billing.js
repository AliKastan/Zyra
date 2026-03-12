/**
 * Zyra Billing Configuration
 *
 * All credit pricing and plan feature gates live here.
 * Change values in this one file to adjust pricing, limits, and plan features.
 * No business logic is in this file — only data.
 */

// ── Monthly included credits per plan ────────────────────────────────────────
const PLAN_CREDITS = {
  free:  1000,
  pro:   20000,
  max:   60000,
};

// ── Model multipliers (higher = more credits consumed) ───────────────────────
// Costs are multiplied by this factor after the base token calc.
const MODEL_MULTIPLIERS = {
  // Anthropic
  'claude-haiku-4-5-20251001': 1.0,
  'claude-sonnet-4-6':         1.5,
  'claude-opus-4-6':           2.5,
  // OpenAI
  'gpt-4o-mini':               1.0,
  'gpt-4o':                    2.0,
  'gpt-4-turbo':               2.0,
  // Default for unknown models
  default: 1.5,
};

// ── Base credit fee per event type ───────────────────────────────────────────
// Applied before the model multiplier.
const EVENT_BASE_COSTS = {
  generation:  5,   // starting a new app generation
  edit:        2,   // editing an existing project
  deploy:      10,  // deploying to Vercel (external service, fixed cost)
  debug:       3,   // Fix My App / debug session
  api_call:    1,   // generic API call
  adjustment:  0,   // admin credit adjustment (no base cost)
};

// ── Token rates (credits per 1,000 tokens, before model multiplier) ──────────
const TOKEN_RATES = {
  input_per_1k:  1,  // 1 credit per 1k input tokens
  output_per_1k: 3,  // 3 credits per 1k output tokens (output is more expensive)
};

// ── Tool call surcharge (credits per tool invocation) ────────────────────────
const TOOL_CALL_COST = 1;

// ── Plan feature gates ────────────────────────────────────────────────────────
// These control which features are accessible per plan.
const PLAN_FEATURES = {
  free: {
    deploy:            false,
    premium_models:    false,
    advanced_debug:    false,
    max_output_tokens: 4096,
    max_projects:      3,
    priority_support:  false,
  },
  pro: {
    deploy:            true,
    premium_models:    true,
    advanced_debug:    true,
    max_output_tokens: 8192,
    max_projects:      null,   // unlimited
    priority_support:  true,
  },
  max: {
    deploy:            true,
    premium_models:    true,
    advanced_debug:    true,
    max_output_tokens: 16384,
    max_projects:      null,
    priority_support:  true,
  },
};

// ── Soft warning thresholds (fraction of monthly credits used) ───────────────
const WARNING_THRESHOLDS = {
  soft:     0.80,  // 80%  — show yellow warning
  critical: 0.95,  // 95%  — show red warning
};

// ── Per-request credit caps (anti-abuse) ─────────────────────────────────────
// A single request cannot consume more than this many credits regardless of output size.
const MAX_CREDITS_PER_REQUEST = {
  free: 100,
  pro:  500,
  max:  2000,
};

// ── Per-minute rate limits (in-memory, per user) ─────────────────────────────
const RATE_LIMITS = {
  free: { requests: 5,  windowMs: 60_000 },
  pro:  { requests: 30, windowMs: 60_000 },
  max:  { requests: 60, windowMs: 60_000 },
};

// ── Plan display metadata (for UI) ───────────────────────────────────────────
const PLAN_META = {
  free: {
    label:    'Free',
    price:    0,
    interval: null,
    color:    '#9A9A94',
    features: ['1,000 credits / month', '3 projects', 'Static deployments only', 'Community support'],
  },
  pro: {
    label:    'Pro',
    price:    20,
    interval: 'month',
    color:    '#8A2E1A',
    features: ['20,000 credits / month', 'Unlimited projects', 'One-click Vercel deploy', 'Premium AI models', 'Priority support'],
  },
  max: {
    label:    'Max',
    price:    50,
    interval: 'month',
    color:    '#446640',
    features: ['60,000 credits / month', 'Unlimited projects', 'One-click Vercel deploy', 'All AI models', 'Advanced debug', 'Priority support'],
  },
};

module.exports = {
  PLAN_CREDITS,
  MODEL_MULTIPLIERS,
  EVENT_BASE_COSTS,
  TOKEN_RATES,
  TOOL_CALL_COST,
  PLAN_FEATURES,
  WARNING_THRESHOLDS,
  MAX_CREDITS_PER_REQUEST,
  RATE_LIMITS,
  PLAN_META,
};
