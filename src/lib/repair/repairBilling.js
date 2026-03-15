'use strict';

/**
 * BILLING REPAIR
 *
 * Creates billing scaffolding when intent.needsPayments === true and the
 * validator flagged missing billing files. Generates:
 *   - billing.js (Stripe checkout session, webhook handler, subscription helpers)
 *
 * Only runs for conditional_auto_repair classified billing issues.
 *
 * @param {import('./types').RepairContext} ctx
 * @returns {import('./types').RepairIssueResult[]}
 */
function repairBilling(ctx) {
  const { fileMap, filePaths, issues, decisions, intent } = ctx;
  /** @type {import('./types').RepairIssueResult[]} */
  const results = [];

  if (!intent.needsPayments) return results;

  const billingIssues = issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair && (
      i.id === 'missing_billing_file'    ||
      i.id === 'missing_billing_checkout' ||
      i.id === 'missing_billing_webhook'
    );
  });

  if (billingIssues.length === 0) return results;

  const issueIds = new Set(billingIssues.map(i => i.id));

  // ── 1. billing.js ──────────────────────────────────────────────────────────
  const billingPath = _resolveBillingPath(filePaths);
  if (!filePaths.has(billingPath)) {
    const needsCheckout = issueIds.has('missing_billing_file') || issueIds.has('missing_billing_checkout');
    const needsWebhook  = issueIds.has('missing_billing_file') || issueIds.has('missing_billing_webhook');
    fileMap.set(billingPath, _generateBillingJs(needsCheckout, needsWebhook));
    filePaths.add(billingPath);

    const repaired = [];
    if (needsCheckout) repaired.push('checkout session');
    if (needsWebhook)  repaired.push('webhook handler');

    results.push({
      issueId:    'missing_billing_file',
      action:     'created_file',
      path:       billingPath,
      reason:     `Created ${billingPath} with Stripe ${repaired.join(' + ')} scaffold`,
      safety:     'conditional_auto_repair',
      confidence: 0.80,
    });
  } else {
    // File exists — inject missing parts into it
    let content = fileMap.get(billingPath);
    let changed  = false;

    if (issueIds.has('missing_billing_checkout') && !/createCheckoutSession|checkout\.sessions/.test(content)) {
      content += _checkoutSnippet();
      changed = true;
      results.push({
        issueId:    'missing_billing_checkout',
        action:     'injected_code',
        path:       billingPath,
        reason:     `Injected createCheckoutSession stub into ${billingPath}`,
        safety:     'conditional_auto_repair',
        confidence: 0.75,
      });
    }

    if (issueIds.has('missing_billing_webhook') && !/webhook|constructEvent|stripe-signature/.test(content)) {
      content += _webhookSnippet();
      changed = true;
      results.push({
        issueId:    'missing_billing_webhook',
        action:     'injected_code',
        path:       billingPath,
        reason:     `Injected webhook handler stub into ${billingPath}`,
        safety:     'conditional_auto_repair',
        confidence: 0.75,
      });
    }

    if (changed) fileMap.set(billingPath, content);
  }

  return results;
}

// ── Path resolution ────────────────────────────────────────────────────────────

function _resolveBillingPath(filePaths) {
  const candidates = ['billing.js', 'stripe.js', 'payments.js', 'src/billing.js', 'src/stripe.js'];
  for (const c of candidates) {
    if (filePaths.has(c)) return c;
  }
  // Use project structure convention
  if ([...filePaths].some(p => p.startsWith('src/'))) return 'src/billing.js';
  return 'billing.js';
}

// ── Full billing.js ────────────────────────────────────────────────────────────

function _generateBillingJs(includeCheckout, includeWebhook) {
  return `'use strict';

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ── Checkout ──────────────────────────────────────────────────────────────────
${includeCheckout ? `
/**
 * Create a Stripe Checkout Session.
 * @param {{ priceId: string, customerId?: string, successUrl: string, cancelUrl: string, metadata?: Object }} opts
 * @returns {Promise<import('stripe').Stripe.Checkout.Session>}
 */
async function createCheckoutSession({ priceId, customerId, successUrl, cancelUrl, metadata = {} }) {
  const params = {
    mode:                'subscription',
    payment_method_types: ['card'],
    line_items:          [{ price: priceId, quantity: 1 }],
    success_url:         successUrl,
    cancel_url:          cancelUrl,
    metadata,
  };

  if (customerId) params.customer = customerId;

  return stripe.checkout.sessions.create(params);
}

/**
 * Create a one-time payment session.
 * @param {{ amount: number, currency?: string, description: string, successUrl: string, cancelUrl: string }} opts
 * @returns {Promise<import('stripe').Stripe.Checkout.Session>}
 */
async function createPaymentSession({ amount, currency = 'usd', description, successUrl, cancelUrl }) {
  return stripe.checkout.sessions.create({
    mode:                'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency,
        unit_amount:  amount, // in cents
        product_data: { name: description },
      },
      quantity: 1,
    }],
    success_url: successUrl,
    cancel_url:  cancelUrl,
  });
}
` : '// TODO: implement createCheckoutSession\n'}
// ── Customer portal ───────────────────────────────────────────────────────────

/**
 * Create a Stripe Customer Portal session for subscription management.
 * @param {{ customerId: string, returnUrl: string }} opts
 * @returns {Promise<import('stripe').Stripe.BillingPortal.Session>}
 */
async function createPortalSession({ customerId, returnUrl }) {
  return stripe.billingPortal.sessions.create({
    customer:   customerId,
    return_url: returnUrl,
  });
}

// ── Subscription helpers ──────────────────────────────────────────────────────

/**
 * Retrieve a customer's active subscriptions.
 * @param {string} customerId
 * @returns {Promise<import('stripe').Stripe.Subscription[]>}
 */
async function getActiveSubscriptions(customerId) {
  const { data } = await stripe.subscriptions.list({
    customer: customerId,
    status:   'active',
  });
  return data;
}

/**
 * Cancel a subscription at period end.
 * @param {string} subscriptionId
 */
async function cancelSubscription(subscriptionId) {
  return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

${includeWebhook ? `
// ── Webhook handler ───────────────────────────────────────────────────────────

/**
 * Verify and parse a Stripe webhook event.
 * Use with express.raw() body parser on the route.
 *
 * @param {Buffer} body  - raw request body
 * @param {string} sig   - stripe-signature header
 * @returns {import('stripe').Stripe.Event}
 */
function constructWebhookEvent(body, sig) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  return stripe.webhooks.constructEvent(body, sig, secret);
}

/**
 * Handle a Stripe webhook event.
 * Wire this to POST /api/billing/webhook (with express.raw() body parser).
 *
 * @param {import('stripe').Stripe.Event} event
 * @returns {Promise<void>}
 */
async function handleWebhookEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      // TODO: provision access, update user record
      console.log('Checkout completed:', session.id, 'customer:', session.customer);
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      // TODO: update subscription status in database
      console.log('Subscription updated:', sub.id, 'status:', sub.status);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      // TODO: revoke access
      console.log('Subscription cancelled:', sub.id);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      // TODO: notify user of payment failure
      console.log('Payment failed for invoice:', invoice.id);
      break;
    }
    default:
      // Unhandled event — safe to ignore
      break;
  }
}
` : '// TODO: implement webhook handler\n'}

module.exports = {
  createCheckoutSession: ${includeCheckout ? 'createCheckoutSession' : '() => { throw new Error("Not implemented"); }'},
  ${includeCheckout ? 'createPaymentSession,' : ''}
  createPortalSession,
  getActiveSubscriptions,
  cancelSubscription,
  ${includeWebhook ? 'constructWebhookEvent,\n  handleWebhookEvent,' : ''}
};
`;
}

// ── Snippet injectors ─────────────────────────────────────────────────────────

function _checkoutSnippet() {
  return `
// ── Checkout session (auto-injected) ─────────────────────────────────────────
async function createCheckoutSession({ priceId, successUrl, cancelUrl }) {
  return require('stripe')(process.env.STRIPE_SECRET_KEY).checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url:  cancelUrl,
  });
}
module.exports.createCheckoutSession = createCheckoutSession;
`;
}

function _webhookSnippet() {
  return `
// ── Webhook handler (auto-injected) ──────────────────────────────────────────
function constructWebhookEvent(body, sig) {
  return require('stripe')(process.env.STRIPE_SECRET_KEY)
    .webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
}
async function handleWebhookEvent(event) {
  if (event.type === 'checkout.session.completed') {
    // TODO: provision access for event.data.object.customer
  }
}
module.exports.constructWebhookEvent = constructWebhookEvent;
module.exports.handleWebhookEvent    = handleWebhookEvent;
`;
}

module.exports = { repairBilling };
