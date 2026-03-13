/**
 * Quota Middleware
 *
 * Enforces credit limits and feature gates at the Express route level.
 * Fails OPEN when billing is not configured (allows requests through).
 */

const { isBillingConfigured, getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { checkCredits, ensureProfile }            = require('../billing/meter');
const { PLAN_FEATURES, RATE_LIMITS }             = require('../config/billing');
const { effectivePlan }                          = require('../billing/accessControl');
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
 */
async function enforceQuota(req, res, next) {
  if (!isBillingConfigured()) return next();

  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

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
