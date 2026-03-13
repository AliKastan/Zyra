/**
 * Access Control — single source of truth for paid access decisions.
 *
 * A user has paid access ONLY when Stripe has confirmed their subscription
 * is genuinely active. All other statuses (incomplete, past_due, canceled,
 * unpaid, etc.) are treated as free.
 *
 * Use effectivePlan() everywhere a plan-dependent decision is made.
 * Never read sub.plan directly without also checking sub.status.
 */

/** Statuses that represent a confirmed, active paid subscription. */
const PAID_STATUSES = new Set(['active', 'trialing']);

/**
 * Returns true only when the subscription is confirmed active by Stripe.
 *
 * @param {string} plan   - raw plan from subscription_accounts
 * @param {string} status - raw status from subscription_accounts
 */
function hasPaidAccess(plan, status) {
  return plan !== 'free' && PAID_STATUSES.has(status);
}

/**
 * Returns the plan that should be used for entitlements and credit budgets.
 * Downgrades to 'free' for any non-active subscription status.
 *
 * Accepted:    active, trialing     → returns actual plan ('pro' / 'max')
 * Downgraded:  incomplete, past_due,
 *              unpaid, canceled,
 *              incomplete_expired   → returns 'free'
 *
 * @param {string} plan   - raw plan from subscription_accounts
 * @param {string} status - raw status from subscription_accounts
 * @returns {string} effective plan to use
 */
function effectivePlan(plan, status) {
  return hasPaidAccess(plan, status) ? plan : 'free';
}

module.exports = { hasPaidAccess, effectivePlan, PAID_STATUSES };
