/**
 * Billing Period Management
 *
 * Responsible for:
 * - Determining the current billing period for a user
 * - Creating the billing_period_usage row when a new period begins
 * - Returning the credits remaining for the current period
 *
 * Period rules:
 *   Paid users (active/trialing)  → use Stripe's current_period_start/end
 *   Free users                    → rolling calendar month (1st → last day)
 */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { PLAN_CREDITS }     = require('../config/billing');
const { effectivePlan }    = require('./accessControl');
const logger               = require('../utils/logger');

/**
 * Returns the current billing period dates + plan for a user.
 * @param {string} userId
 * @returns {{ plan: string, periodStart: Date, periodEnd: Date }}
 */
async function getCurrentBillingPeriod(userId) {
  const db = getSupabaseAdmin();

  const { data: sub, error } = await db
    .from('subscription_accounts')
    .select('plan, status, current_period_start, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load subscription: ${error.message}`);

  const rawPlan = sub?.plan   || 'free';
  const status  = sub?.status || 'free';
  const plan    = effectivePlan(rawPlan, status);   // downgrade if not truly paid

  let periodStart, periodEnd;

  if ((status === 'active' || status === 'trialing') &&
       sub.current_period_start && sub.current_period_end) {
    // Paid: align with Stripe billing cycle
    periodStart = new Date(sub.current_period_start);
    periodEnd   = new Date(sub.current_period_end);
  } else {
    // Free: calendar month
    const now   = new Date();
    periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    periodEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    periodEnd.setMilliseconds(periodEnd.getMilliseconds() - 1);
  }

  return { plan, periodStart, periodEnd };
}

/**
 * Gets or creates the billing_period_usage row for the user's current period.
 * Safe to call concurrently — the unique constraint prevents duplicates.
 *
 * @param {string} userId
 * @returns {object} billing_period_usage row
 */
async function getOrCreateBillingPeriodUsage(userId) {
  const db = getSupabaseAdmin();
  const { plan, periodStart, periodEnd } = await getCurrentBillingPeriod(userId);
  const creditsIncluded = PLAN_CREDITS[plan] ?? PLAN_CREDITS.free;

  const ps = periodStart.toISOString();
  const pe = periodEnd.toISOString();

  // Fast path: row already exists
  const { data: existing, error: fetchErr } = await db
    .from('billing_period_usage')
    .select('*')
    .eq('user_id',     userId)
    .eq('period_start', ps)
    .eq('period_end',   pe)
    .maybeSingle();

  if (fetchErr) throw new Error(`Failed to fetch billing period: ${fetchErr.message}`);
  if (existing) return existing;

  // Slow path: create new period row
  const { data: created, error: insertErr } = await db
    .from('billing_period_usage')
    .insert({ user_id: userId, period_start: ps, period_end: pe, credits_used: 0, credits_included: creditsIncluded, plan })
    .select()
    .single();

  if (insertErr) {
    // Unique conflict = race condition, someone else just created it
    if (insertErr.code === '23505') {
      const { data: retry } = await db
        .from('billing_period_usage')
        .select('*')
        .eq('user_id',     userId)
        .eq('period_start', ps)
        .eq('period_end',   pe)
        .single();
      if (retry) return retry;
    }
    throw new Error(`Failed to create billing period: ${insertErr.message}`);
  }

  logger.info(`[billing] New period for ${userId}: ${plan}, ${creditsIncluded} credits, ${ps} → ${pe}`);
  return created;
}

/**
 * Returns a summary of the user's credit usage for the current period.
 *
 * @param {string} userId
 * @returns {{ creditsRemaining, creditsUsed, creditsIncluded, plan, periodStart, periodEnd, percentUsed }}
 */
async function getCreditsRemaining(userId) {
  const row = await getOrCreateBillingPeriodUsage(userId);
  const creditsRemaining = Math.max(0, row.credits_included - row.credits_used);

  return {
    creditsRemaining,
    creditsUsed:     row.credits_used,
    creditsIncluded: row.credits_included,
    plan:            row.plan,
    periodStart:     row.period_start,
    periodEnd:       row.period_end,
    percentUsed:     row.credits_included > 0 ? row.credits_used / row.credits_included : 0,
  };
}

module.exports = { getCurrentBillingPeriod, getOrCreateBillingPeriodUsage, getCreditsRemaining };
