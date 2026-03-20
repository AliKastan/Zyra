/**
 * Quota Middleware
 *
 * Enforces credit limits and feature gates at the Express route level.
 * Fails OPEN when billing is not configured (allows requests through).
 *
 * Private-beta flag: DISABLE_APP_BILLING_FOR_PRIVATE_BETA=true
 *   Skips ALL of Zyra's own credit/subscription checks so every authenticated
 *   user who passed the access-code gate can generate freely.
 *   Does NOT affect external AI provider limits — those are enforced by the
 *   providers themselves and are never intercepted here.
 *   To re-enable billing: remove the flag (or set it to false) and redeploy.
 *
 * Internal testers / admins bypass the quota gate entirely when
 * ENABLE_INTERNAL_TEST_ACCESS=true and the user matches the allowlist/role.
 * All bypasses are audit-logged. Public users are never affected.
 */

const { isBillingConfigured, getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { checkCredits, ensureProfile }            = require('../billing/meter');
const { PLAN_FEATURES, RATE_LIMITS }             = require('../config/billing');
const { effectivePlan }                          = require('../billing/accessControl');
const { checkInternalAccess }                    = require('../config/internalAccess');
const logger = require('../utils/logger');

// ── In-memory rate limiter (per userId) ──────────────────────────────────────
const rateBuckets = new Map(); // userId -> { count, resetAt }

function checkRateLimit(userId, plan) {
  const limits = RATE_LIMITS[plan] ?? RATE_LIMITS.free;
  const now    = Date.now();
  const bucket = rateBuckets.get(userId) || { count: 0, resetAt: now + limits.windowMs };

  if (now > bucket.resetAt) {
    bucket.count   = 0;
    bucket.resetAt = now + limits.windowMs;
  }

  bucket.count += 1;
  rateBuckets.set(userId, bucket);

  if (bucket.count > limits.requests) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return { limited: true, retryAfter };
  }
  return { limited: false };
}

// Clean up rate buckets periodically to avoid memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now > bucket.resetAt + 60_000) rateBuckets.delete(key);
  }
}, 5 * 60_000);

// ── enforceQuota middleware ───────────────────────────────────────────────────

/**
 * Checks that the user has credits remaining before allowing a generation/edit.
 * Attaches req.billingUsage and req.userPlan for downstream use.
 *
 * Billing is OPT-IN: only enforced when ENFORCE_BILLING=true is explicitly set.
 * This means billing is OFF by default (safe for private beta / development).
 * Set ENFORCE_BILLING=true in production when real payment flows are live.
 */
async function enforceQuota(req, res, next) {
  // ── Billing is opt-in ────────────────────────────────────────────────────
  // Billing enforcement requires an explicit ENFORCE_BILLING=true flag.
  // Without it, ALL authenticated users generate freely — no credit checks.
  // This is the correct default for private beta and development.
  if (process.env.ENFORCE_BILLING !== 'true') {
    logger.info('[GEN] billing_guard_result=SKIPPED reason=billing_not_enforced user=' + (req.user?.id || 'anon'));
    req.userPlan = 'beta';
    return next();
  }

  // ── Legacy bypass flags (still respected when ENFORCE_BILLING=true) ──────
  if (process.env.DISABLE_APP_BILLING_FOR_PRIVATE_BETA === 'true') {
    logger.info('[GEN] billing_guard_result=SKIPPED reason=private_beta_flag user=' + (req.user?.id || 'anon'));
    logger.info(`[quota] Private-beta flag: billing gate skipped for ${req.user?.email || req.user?.id}`);
    req.userPlan = 'beta';
    return next();
  }

  if (process.env.BILLING_BYPASS === "true") return next();
  if (!isBillingConfigured()) return next();

  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // ── Internal test access bypass ──────────────────────────────────────────
  // Checked before any DB calls — fast path for internal testers.
  // Public users are never affected (checkInternalAccess returns false for them).
  const internalCheck = checkInternalAccess(req.user);
  if (internalCheck.granted) {
    logger.info(`[quota] Internal access granted for ${req.user.email} — reason: ${internalCheck.reason}`);
    req.internalTestAccess = true;
    req.internalTestReason = internalCheck.reason;
    req.internalTestMethod = internalCheck.method;
    req.userPlan = 'internal';
    return next();
  }

  try {
    // Bootstrap profile on first use
    await ensureProfile(userId, req.user?.email);

    // Get plan for rate-limit lookup
    const db  = getSupabaseAdmin();
    const { data: sub } = await db
      .from('subscription_accounts')
      .select('plan, status')
      .eq('user_id', userId)
      .maybeSingle();

    const plan = effectivePlan(sub?.plan, sub?.status);
    req.userPlan = plan;

    // Per-minute rate limit
    const rl = checkRateLimit(userId, plan);
    if (rl.limited) {
      return res.status(429).json({
        error:       'Too many requests. Please slow down.',
        retryAfter:  rl.retryAfter,
        code:        'RATE_LIMITED',
      });
    }

    // Credit check
    const check = await checkCredits(userId, plan, 0);
    if (!check.allowed) {
      return res.status(402).json({
        error:   check.reason,
        code:    'CREDITS_EXHAUSTED',
        usage:   {
          creditsRemaining: check.creditsRemaining,
          creditsUsed:      check.creditsUsed,
          creditsIncluded:  check.creditsIncluded,
          plan:             check.plan,
          periodEnd:        check.periodEnd,
        },
      });
    }

    req.billingUsage = check;
    next();

  } catch (err) {
    // Fail open — billing errors must never block the core product
    logger.warn(`[quota] Error checking quota for ${userId}: ${err.message} — allowing request`);
    next();
  }
}

// ── requireFeature middleware factory ────────────────────────────────────────

/**
 * Returns a middleware that gates a route on a plan feature.
 * Usage: router.post('/deploy/:slug', requireFeature('deploy'), ctrl.startDeploy)
 */
function requireFeature(featureKey) {
  return async (req, res, next) => {
    if (!isBillingConfigured()) return next();

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const db  = getSupabaseAdmin();
      const { data: sub } = await db
        .from('subscription_accounts')
        .select('plan')
        .eq('user_id', userId)
        .maybeSingle();

      const plan     = effectivePlan(sub?.plan, sub?.status);
      const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.free;

      if (!features[featureKey]) {
        const planNeeded = Object.entries(PLAN_FEATURES)
          .find(([, f]) => f[featureKey])?.[0] || 'pro';

        return res.status(403).json({
          error:           `This feature requires the ${planNeeded.charAt(0).toUpperCase() + planNeeded.slice(1)} plan.`,
          code:            'FEATURE_GATED',
          requiredFeature: featureKey,
          currentPlan:     plan,
          requiredPlan:    planNeeded,
        });
      }

      req.userPlan = plan;
      next();

    } catch (err) {
      logger.warn(`[quota] requireFeature error for ${userId}: ${err.message} — allowing`);
      next();
    }
  };
}

module.exports = { enforceQuota, requireFeature };
