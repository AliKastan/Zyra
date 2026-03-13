/**
 * Stripe Webhook Handler
 *
 * Processes inbound Stripe events. All handlers are idempotent — events that
 * have already been processed are silently skipped.
 *
 * Source of truth for subscription state: Stripe webhooks, NOT frontend redirects.
 */

const { getStripe }        = require('./stripeClient');
const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const logger               = require('../utils/logger');

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Verifies the Stripe signature and dispatches the event to a handler.
 * @param {Buffer} rawBody   - unparsed request body
 * @param {string} signature - value of stripe-signature header
 * @returns {{ handled: boolean, duplicate: boolean }}
 */
async function handleWebhookEvent(rawBody, signature) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw Object.assign(new Error('STRIPE_WEBHOOK_SECRET is not set'), { status: 500 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    throw Object.assign(
      new Error(`Webhook signature verification failed: ${err.message}`),
      { status: 400 }
    );
  }

  const db = getSupabaseAdmin();

  // Idempotency: skip events we've already handled
  const { data: existing } = await db
    .from('stripe_event_log')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (existing) {
    logger.info(`[webhook] ${event.id} already processed — skipping`);
    return { handled: true, duplicate: true };
  }

  // Record event first (so a crash mid-handler doesn't cause re-processing on retry)
  await db.from('stripe_event_log').insert({
    stripe_event_id: event.id,
    event_type:      event.type,
    payload:         event,
  });

  // Dispatch
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(db, stripe, event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await onSubscriptionUpsert(db, event.data.object);
        break;
      case 'customer.subscription.deleted':
        await onSubscriptionDeleted(db, event.data.object);
        break;
      case 'invoice.paid':
        await onInvoicePaid(db, stripe, event.data.object);
        break;
      case 'invoice.payment_failed':
        await onInvoicePaymentFailed(db, event.data.object);
        break;
      default:
        logger.info(`[webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    // Log the error but return 200 — Stripe retries on non-2xx, which could cause loops
    // for logic errors. The event is recorded above, so we can replay manually if needed.
    logger.error(`[webhook] Handler error for ${event.type} (${event.id}): ${err.message}`);
  }

  return { handled: true, duplicate: false };
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function onCheckoutCompleted(db, stripe, session) {
  if (session.mode !== 'subscription') return;

  const userId   = session.client_reference_id;
  const subId    = session.subscription;
  const custId   = session.customer;

  if (!userId) {
    logger.warn(`[webhook] No client_reference_id in checkout session ${session.id}`);
    return;
  }

  const sub     = await stripe.subscriptions.retrieve(subId);
  const priceId = sub.items.data[0]?.price?.id;
  const plan    = planFromPriceId(priceId);

  if (!plan) {
    logger.warn(`[webhook] Unknown price ID in checkout: ${priceId}`);
    return;
  }

  await upsertSub(db, userId, {
    plan,
    status:                  mapStatus(sub.status),
    stripe_customer_id:      custId,
    stripe_subscription_id:  subId,
    stripe_price_id:         priceId,
    current_period_start:    toIso(sub.current_period_start),
    current_period_end:      toIso(sub.current_period_end),
    cancel_at_period_end:    sub.cancel_at_period_end,
  });

  logger.info(`[webhook] Checkout completed — user ${userId} now on ${plan}`);
}

async function onSubscriptionUpsert(db, sub) {
  const priceId = sub.items.data[0]?.price?.id;
  const plan    = planFromPriceId(priceId) || 'free';
  const userId  = await userIdFromCustomer(db, sub.customer);
  if (!userId) return;

  await upsertSub(db, userId, {
    plan,
    status:                 mapStatus(sub.status),
    stripe_subscription_id: sub.id,
    stripe_price_id:        priceId,
    current_period_start:   toIso(sub.current_period_start),
    current_period_end:     toIso(sub.current_period_end),
    cancel_at_period_end:   sub.cancel_at_period_end,
  });
}

async function onSubscriptionDeleted(db, sub) {
  const userId = await userIdFromCustomer(db, sub.customer);
  if (!userId) return;

  await upsertSub(db, userId, {
    plan:                    'free',
    status:                  'canceled',
    stripe_subscription_id:  null,
    stripe_price_id:         null,
    current_period_start:    null,
    current_period_end:      null,
    cancel_at_period_end:    false,
  });

  logger.info(`[webhook] Subscription deleted — user ${userId} downgraded to free`);
}

async function onInvoicePaid(db, stripe, invoice) {
  if (!invoice.subscription) return;
  const userId = await userIdFromCustomer(db, invoice.customer);
  if (!userId) return;

  const sub = await stripe.subscriptions.retrieve(invoice.subscription);
  await upsertSub(db, userId, {
    status:               mapStatus(sub.status),
    current_period_start: toIso(sub.current_period_start),
    current_period_end:   toIso(sub.current_period_end),
  });
}

async function onInvoicePaymentFailed(db, invoice) {
  const userId = await userIdFromCustomer(db, invoice.customer);
  if (!userId) return;
  await upsertSub(db, userId, { status: 'past_due' });
  logger.warn(`[webhook] Payment failed for user ${userId}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertSub(db, userId, updates) {
  const { error } = await db
    .from('subscription_accounts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to update subscription for ${userId}: ${error.message}`);
}

async function userIdFromCustomer(db, customerId) {
  const { data } = await db
    .from('subscription_accounts')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (!data) logger.warn(`[webhook] No account found for Stripe customer ${customerId}`);
  return data?.user_id || null;
}

function planFromPriceId(priceId) {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_ID_MAX) return 'max';
  return null;
}

function mapStatus(stripeStatus) {
  const map = {
    active:             'active',
    trialing:           'trialing',
    past_due:           'past_due',
    canceled:           'canceled',
    incomplete:         'incomplete',
    incomplete_expired: 'canceled',
    unpaid:             'past_due',
  };
  return map[stripeStatus] || 'active';
}

function toIso(unixSeconds) {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

module.exports = { handleWebhookEvent };
