/**
 * Usage Meter
 *
 * The single place all billing I/O goes through.
 *
 * checkCredits  — pre-flight: can the user proceed?
 * chargeUsage   — post-flight: record actual usage, deduct credits
 * ensureProfile — upserts profile + subscription rows for first-time users
 */

const { getSupabaseAdmin, isBillingConfigured } = require('../lib/supabaseAdmin');
const { computeCredits }                        = require('./creditEngine');
const { getOrCreateBillingPeriodUsage, getCreditsRemaining } = require('./billingPeriod');
const { MAX_CREDITS_PER_REQUEST, WARNING_THRESHOLDS }        = require('../config/billing');
const logger = require('../utils/logger');

// ── Pre-flight check ──────────────────────────────────────────────────────────

/**
 * Checks whether the user has enough credits to proceed.
 *
 * @param {string} userId
 * @param {string} plan           - current plan (for per-request cap enforcement)
 * @param {number} [estimatedCost] - pessimistic estimate; 0 = skip cap check
 * @returns {{ allowed: boolean, reason: string|null, warning: 'soft'|'critical'|null, ...usage }}
 */
async function checkCredits(userId, plan, estimatedCost = 0) {
  if (process.env.BILLING_BYPASS === "true") return { allowed: true, reason: null, warning: null };
  if (!isBillingConfigured()) return { allowed: true, reason: null, warning: null };

  try {
    const usage = await getCreditsRemaining(userId);

    if (usage.creditsRemaining <= 0) {
      return {
        allowed: false,
        reason:  'Monthly credits exhausted. Upgrade your plan or wait until the next billing period.',
        warning: 'critical',
        ...usage,
      };
    }

    // Check per-request cap (prevents one huge request from draining all credits)
    const cap = MAX_CREDITS_PER_REQUEST[plan] ?? MAX_CREDITS_PER_REQUEST.free;
    if (estimatedCost > 0 && estimatedCost > cap) {
      return {
        allowed: false,
        reason:  `Request exceeds the per-request limit for your plan (${cap} credits). Upgrade for a higher limit.`,
        warning: 'soft',
        ...usage,
      };
    }

    if (estimatedCost > 0 && estimatedCost > usage.creditsRemaining) {
      return {
        allowed: false,
        reason:  `Not enough credits. This action needs ~${estimatedCost} credits but you only have ${usage.creditsRemaining} remaining.`,
        warning: 'critical',
        ...usage,
      };
    }

    // Soft warnings
    let warning = null;
    if (usage.percentUsed >= WARNING_THRESHOLDS.critical) warning = 'critical';
    else if (usage.percentUsed >= WARNING_THRESHOLDS.soft)  warning = 'soft';

    return { allowed: true, reason: null, warning, ...usage };

  } catch (err) {
    // Fail open — don't block the user if billing is unreachable
    logger.warn(`[meter] checkCredits failed for ${userId}: ${err.message} — allowing request`);
    return { allowed: true, reason: null, warning: null };
  }
}

// ── Post-flight charge ────────────────────────────────────────────────────────

/**
 * Records actual usage after a request completes and deducts credits.
 * Idempotent: duplicate (requestId + eventType) pairs are safely ignored.
 *
 * @param {string} userId
 * @param {string} requestId   - unique per-request ID (e.g. jobId)
 * @param {object} usageData
 * @param {string} usageData.eventType
 * @param {string} [usageData.model]
 * @param {number} [usageData.inputTokens]
 * @param {number} [usageData.outputTokens]
 * @param {number} [usageData.toolCalls]
 * @param {object} [usageData.metadata]
 * @returns {{ creditsCharged, creditsRemaining, duplicate }}
 */
async function chargeUsage(userId, requestId, usageData) {
  if (process.env.BILLING_BYPASS === "true") return { creditsCharged: 0, creditsRemaining: null, duplicate: false };
  if (!isBillingConfigured()) return { creditsCharged: 0, creditsRemaining: null, duplicate: false };

  const { eventType, model, inputTokens = 0, outputTokens = 0, toolCalls = 0, metadata = {} } = usageData;
  const db = getSupabaseAdmin();

  const { credits, rateSnapshot, breakdown } = computeCredits({ eventType, model, inputTokens, outputTokens, toolCalls });

  // 1. Append to usage_ledger (unique index on request_id + event_type)
  const { error: ledgerErr } = await db.from('usage_ledger').insert({
    user_id:              userId,
    request_id:           requestId,
    event_type:           eventType,
    model:                model || null,
    input_tokens:         inputTokens,
    output_tokens:        outputTokens,
    tool_calls:           toolCalls,
    credits_delta:        credits,
    credit_rate_snapshot: rateSnapshot,
    metadata:             { ...metadata, breakdown },
  });

  if (ledgerErr) {
    if (ledgerErr.code === '23505') {
      // Already charged — idempotent duplicate
      logger.info(`[meter] Duplicate charge ignored: ${requestId}/${eventType}`);
      const usage = await getCreditsRemaining(userId).catch(() => ({}));
      return { creditsCharged: 0, ...usage, duplicate: true };
    }
    throw new Error(`Failed to record usage: ${ledgerErr.message}`);
  }

  // 2. Atomically increment billing_period_usage via RPC
  const period = await getOrCreateBillingPeriodUsage(userId);
  const { error: rpcErr } = await db.rpc('increment_credits_used', {
    p_user_id:      userId,
    p_period_start: period.period_start,
    p_period_end:   period.period_end,
    p_delta:        credits,
  });

  if (rpcErr) {
    // Non-fatal — ledger is the source of truth; period table is a cache
    logger.warn(`[meter] RPC increment failed for ${userId}: ${rpcErr.message}`);
  }

  const usage = await getCreditsRemaining(userId).catch(() => ({}));
  logger.info(`[meter] Charged ${credits} credits (${requestId}/${eventType}). Remaining: ${usage.creditsRemaining ?? '?'}`);

  return {
    creditsCharged:   credits,
    creditsRemaining: usage.creditsRemaining,
    creditsUsed:      usage.creditsUsed,
    creditsIncluded:  usage.creditsIncluded,
    breakdown,
    duplicate: false,
  };
}

// ── Profile bootstrapper ──────────────────────────────────────────────────────

/**
 * Ensures profile + free subscription rows exist for a user.
 * Safe to call on every authenticated request (idempotent upsert).
 */
async function ensureProfile(userId, email) {
  if (!isBillingConfigured()) return;

  try {
    const db = getSupabaseAdmin();
    await db.from('profiles').upsert(
      { id: userId, email: email || '', updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
    const { data: existing } = await db
      .from('subscription_accounts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      await db.from('subscription_accounts').insert({
        user_id: userId,
        plan:    'free',
        status:  'free',
      }).select();
    }
  } catch (err) {
    logger.warn(`[meter] ensureProfile failed for ${userId}: ${err.message}`);
  }
}

module.exports = { checkCredits, chargeUsage, ensureProfile };
