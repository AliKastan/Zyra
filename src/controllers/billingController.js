/**
 * Billing Controller
 *
 * Handles all billing HTTP endpoints:
 *   GET  /api/billing/usage         — current credit usage
 *   GET  /api/billing/subscription  — subscription details + plan meta
 *   POST /api/billing/checkout      — create Stripe checkout session
 *   POST /api/billing/portal        — create Stripe customer portal session
 *   POST /api/stripe/webhook        — Stripe webhook (raw body, verified)
 */

const { getSupabaseAdmin, isBillingConfigured } = require('../lib/supabaseAdmin');
const { getCreditsRemaining }                   = require('../billing/billingPeriod');
const { ensureProfile }                         = require('../billing/meter');
const { handleWebhookEvent }                    = require('../billing/webhookHandler');
const { getStripe, isStripeConfigured }         = require('../billing/stripeClient');
const { PLAN_META, WARNING_THRESHOLDS }         = require('../config/billing');
const logger = require('../utils/logger');

// ── GET /api/billing/usage ────────────────────────────────────────────────────

async function getUsage(req, res) {
  if (!isBillingConfigured()) {
    return res.json({ configured: false, message: 'Billing is not configured on this instance.' });
  }

  try {
    const userId = req.user.id;
    await ensureProfile(userId, req.user.email);

    const usage = await getCreditsRemaining(userId);
    const pct   = usage.percentUsed;

    res.json({
      configured:       true,
      creditsRemaining: usage.creditsRemaining,
      creditsUsed:      usage.creditsUsed,
      creditsIncluded:  usage.creditsIncluded,
      plan:             usage.plan,
      periodStart:      usage.periodStart,
      periodEnd:        usage.periodEnd,
      percentUsed:      pct,
      warning:          pct >= WARNING_THRESHOLDS.critical ? 'critical'
                      : pct >= WARNING_THRESHOLDS.soft     ? 'soft'
                      : null,
    });
  } catch (err) {
    logger.error(`[billing] getUsage error: ${err.message}`);
    res.status(500).json({ error: 'Failed to load usage data.' });
  }
}

// ── GET /api/billing/subscription ────────────────────────────────────────────

async function getSubscription(req, res) {
  if (!isBillingConfigured()) {
    return res.json({ configured: false });
  }

  try {
    const userId = req.user.id;
    const db     = getSupabaseAdmin();

    const { data: sub, error } = await db
      .from('subscription_accounts')
      .select('plan, status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const plan = sub?.plan || 'free';

    res.json({
      configured:          true,
      plan,
      status:              sub?.status              || 'free',
      periodEnd:           sub?.current_period_end  || null,
      cancelAtPeriodEnd:   sub?.cancel_at_period_end || false,
      hasStripeCustomer:   !!sub?.stripe_customer_id,
      hasActiveSubscription: !!(sub?.stripe_subscription_id),
      planMeta:            PLAN_META[plan] || PLAN_META.free,
      allPlans:            PLAN_META,
    });
  } catch (err) {
    logger.error(`[billing] getSubscription error: ${err.message}`);
    res.status(500).json({ error: 'Failed to load subscription data.' });
  }
}

// ── POST /api/billing/checkout ───────────────────────────────────────────────

async function createCheckout(req, res) {
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'Stripe is not configured on this instance.' });
  }

  const { plan } = req.body;
  if (!['pro', 'max'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan. Choose "pro" or "max".' });
  }

  const priceId = plan === 'pro' ? process.env.STRIPE_PRICE_ID_PRO : process.env.STRIPE_PRICE_ID_MAX;
  if (!priceId) {
    return res.status(500).json({ error: `STRIPE_PRICE_ID_${plan.toUpperCase()} is not configured.` });
  }

  const appUrl = process.env.APP_URL || `https://zyra.build`;

  try {
    const userId = req.user.id;
    const email  = req.user.email;
    const stripe = getStripe();
    const db     = getSupabaseAdmin();

    // Get or create Stripe customer
    const { data: sub } = await db
      .from('subscription_accounts')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id;
    if (!customerId) {
      const customer  = await stripe.customers.create({
        email,
        metadata: { zyra_user_id: userId },
      });
      customerId = customer.id;
      await db.from('subscription_accounts')
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    }

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      customer:             customerId,
      client_reference_id:  userId,
      line_items:           [{ price: priceId, quantity: 1 }],
      success_url:          `${appUrl}/billing?success=1`,
      cancel_url:           `${appUrl}/billing?canceled=1`,
      subscription_data: {
        metadata: { zyra_user_id: userId },
      },
      allow_promotion_codes: true,
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error(`[billing] createCheckout error: ${err.message}`);
    res.status(500).json({ error: 'Failed to create checkout session.' });
  }
}

// ── POST /api/billing/portal ──────────────────────────────────────────────────

async function createPortal(req, res) {
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'Stripe is not configured on this instance.' });
  }

  const appUrl = process.env.APP_URL || `https://zyra.build`;

  try {
    const userId = req.user.id;
    const db     = getSupabaseAdmin();

    const { data: sub } = await db
      .from('subscription_accounts')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return res.status(400).json({ error: 'No active subscription to manage.' });
    }

    const stripe  = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: `${appUrl}/billing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error(`[billing] createPortal error: ${err.message}`);
    res.status(500).json({ error: 'Failed to open billing portal.' });
  }
}

// ── POST /api/stripe/webhook ──────────────────────────────────────────────────

async function stripeWebhook(req, res) {
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing stripe-signature header.' });

  try {
    const result = await handleWebhookEvent(req.body, signature);
    res.json({ received: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    logger.error(`[billing] Webhook error: ${err.message}`);
    res.status(status).json({ error: err.message });
  }
}

module.exports = { getUsage, getSubscription, createCheckout, createPortal, stripeWebhook };
