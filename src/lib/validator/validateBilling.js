'use strict';

/**
 * BILLING VALIDATION
 *
 * Only runs when intent.needsPayments === true.
 *
 * Checks:
 *   - A billing/payments file exists                           [critical]
 *   - Checkout / payment session creation exists               [major]
 *   - Webhook / callback handler exists                        [major]
 *   - Stripe env vars are in .env.example                     [medium]
 *   - Billing UI is not stub-only                              [major]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateBilling(ctx) {
  const { fileMap, filePaths, intent } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  if (!intent.needsPayments) {
    return { status: 'pass', issues: [] };
  }

  const allJsContent = _joinFiles(fileMap, p => p.endsWith('.js') || p.endsWith('.ts'));
  const envContent   = fileMap.get('.env.example') || '';

  // ── 1. Billing file exists ───────────────────────────────────────────────
  const billingFilePatterns = [
    'billing.js', 'billing.ts',
    'stripe.js', 'stripe.ts',
    'payments.js', 'payment.js',
    'checkout.js', 'subscription.js',
    'routes/billing', 'routes/payment', 'routes/stripe',
    'api/billing', 'api/payment',
  ];
  const hasBillingFile = billingFilePatterns.some(pattern =>
    [...filePaths].some(p => p.includes(pattern))
  );

  if (!hasBillingFile) {
    issues.push({
      id:         'missing_billing_file',
      severity:   'critical',
      message:    'No billing/payment file found (billing.js, stripe.js, payments.js, etc.) — payment processing is missing',
      suggestion: 'Create billing.js implementing Stripe checkout session creation and webhook handling',
    });
  }

  // ── 2. Checkout / payment session creation ───────────────────────────────
  const hasCheckout = /createCheckoutSession|checkout\.sessions\.create|paymentIntents\.create|createPaymentIntent|stripe\.redirectToCheckout/.test(allJsContent);

  if (!hasCheckout) {
    issues.push({
      id:         'missing_checkout_flow',
      severity:   'major',
      message:    'No Stripe checkout session or payment intent creation found — users cannot initiate payment',
      suggestion: 'Implement stripe.checkout.sessions.create() to create a checkout session',
    });
  }

  // ── 3. Webhook / callback handling ───────────────────────────────────────
  const hasWebhook = /webhook|stripe-signature|constructEvent|stripe\.webhooks\.constructEvent|payment_intent\.succeeded|checkout\.session\.completed/.test(allJsContent);

  if (!hasWebhook) {
    issues.push({
      id:         'missing_billing_webhook',
      severity:   'major',
      message:    'No Stripe webhook handler found — payment events (subscription renewal, cancellation) will not be processed',
      suggestion: 'Implement a /webhook POST route using stripe.webhooks.constructEvent() to handle payment events',
    });
  }

  // ── 4. Stripe env vars in .env.example ───────────────────────────────────
  if (!envContent.includes('STRIPE_SECRET_KEY')) {
    issues.push({
      id:         'missing_stripe_secret_env',
      severity:   'medium',
      message:    'STRIPE_SECRET_KEY is not documented in .env.example',
      file:       '.env.example',
      suggestion: 'Add STRIPE_SECRET_KEY=sk_test_... to .env.example',
    });
  }

  if (!envContent.includes('STRIPE_PUBLISHABLE_KEY') && !envContent.includes('NEXT_PUBLIC_STRIPE')) {
    issues.push({
      id:         'missing_stripe_publishable_env',
      severity:   'medium',
      message:    'STRIPE_PUBLISHABLE_KEY is not documented in .env.example',
      file:       '.env.example',
      suggestion: 'Add STRIPE_PUBLISHABLE_KEY=pk_test_... to .env.example',
    });
  }

  // ── 5. Billing UI not stub-only ──────────────────────────────────────────
  const hasBillingUiCode = /stripe\.loadStripe|checkout\.redirectToCheckout|stripe-js|data-stripe/.test(allJsContent) ||
    [...filePaths].some(p => /pricing|plan|subscribe|checkout/.test(p));
  const hasBillingStubs  = /TODO.*billing|TODO.*payment|TODO.*stripe|stub.*billing/i.test(allJsContent);

  if (!hasBillingUiCode && !hasBillingFile) {
    issues.push({
      id:         'missing_billing_ui',
      severity:   'major',
      message:    'No billing UI elements (pricing page, checkout button, Stripe.js integration) found',
      suggestion: 'Create a pricing page and implement Stripe.js checkout flow in the frontend',
    });
  }

  if (hasBillingStubs) {
    issues.push({
      id:         'billing_stub_detected',
      severity:   'major',
      message:    'TODO/stub comments detected in billing-related code — billing is not fully implemented',
      suggestion: 'Replace billing stubs with real Stripe API calls',
    });
  }

  return { status: _checkStatus(issues), issues };
}

function _joinFiles(fileMap, predicate) {
  const parts = [];
  for (const [p, content] of fileMap) {
    if (predicate(p) && content) parts.push(content);
  }
  return parts.join('\n');
}

/**
 * @param {import('./types').ValidationIssue[]} issues
 * @returns {import('./types').CheckStatus}
 */
function _checkStatus(issues) {
  if (issues.length === 0) return 'pass';
  if (issues.some(i => i.severity === 'critical' || i.severity === 'major')) return 'fail';
  return 'warning';
}

module.exports = { validateBilling };
