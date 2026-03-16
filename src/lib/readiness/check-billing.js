'use strict';

/**
 * Billing Readiness Check
 *
 * If billing is present, verifies:
 * - Stripe env vars are declared
 * - Webhook handler exists
 * - Checkout logic references correct keys
 */

const BILLING_KEYWORDS = {
  stripe:        ['stripe', 'stripe.com', "require('stripe')", 'from "stripe"', 'stripe.checkout', 'payment_intent'],
  paddle:        ['paddle', 'paddle.com', 'paddlejs'],
  'lemon-squeezy': ['lemonsqueezy', 'lemon squeezy', '@lemonsqueezy'],
  paypal:        ['paypal', 'paypal.com', '@paypal/checkout'],
};

const BILLING_ENV_VARS = {
  stripe:           { required: ['STRIPE_SECRET_KEY'], optional: ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'] },
  paddle:           { required: ['PADDLE_VENDOR_ID', 'PADDLE_API_KEY'], optional: [] },
  'lemon-squeezy':  { required: ['LEMONSQUEEZY_API_KEY'], optional: [] },
  paypal:           { required: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'], optional: [] },
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').ReadinessInput} input
 * @returns {import('./types').BillingCheckResult}
 */
function checkBilling(input) {
  const { files = {} } = input;
  const allContent = Object.values(files).join('\n').toLowerCase();
  const filePaths  = Object.keys(files);

  /** @type {import('./types').ReadinessIssue[]} */
  const issues = [];

  // ── Detect billing provider ────────────────────────────────────────────────
  const provider = _detectProvider(allContent);

  if (!provider) {
    return { detected: false, hasEnvVars: false, hasWebhookHandler: false, hasCheckoutLogic: false, issues: [], score: 100 };
  }

  const envSpec = BILLING_ENV_VARS[provider] || { required: [], optional: [] };

  // ── Env vars ──────────────────────────────────────────────────────────────
  const missingRequired = envSpec.required.filter(v =>
    !allContent.includes(v.toLowerCase()),
  );

  const hasEnvVars = missingRequired.length === 0;

  if (!hasEnvVars) {
    for (const v of missingRequired) {
      issues.push({
        severity: 'warning',
        category: 'billing',
        message:  `${_capitalize(provider)} billing detected but ${v} is not configured`,
        fix:      `Add ${v}=your_value to .env.example`,
      });
    }
  }

  // ── Webhook handler ────────────────────────────────────────────────────────
  const hasWebhookHandler = _detectWebhook(allContent, filePaths, provider);

  if (!hasWebhookHandler && provider === 'stripe') {
    issues.push({
      severity: 'warning',
      category: 'billing',
      message:  'Stripe detected but no webhook handler found',
      fix:      'Add a /webhook route that handles stripe.webhooks.constructEvent()',
    });
  }

  // ── Checkout logic ─────────────────────────────────────────────────────────
  const hasCheckoutLogic = _detectCheckout(allContent, provider);

  if (!hasCheckoutLogic) {
    issues.push({
      severity: 'info',
      category: 'billing',
      message:  `${_capitalize(provider)} detected but no checkout / payment intent logic found`,
      fix:      `Add payment initiation logic (e.g. stripe.checkout.sessions.create())`,
    });
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 30;
    else if (issue.severity === 'warning') score -= 15;
    else if (issue.severity === 'info') score -= 5;
  }
  score = Math.max(0, score);

  return {
    detected:         true,
    provider,
    hasEnvVars,
    hasWebhookHandler,
    hasCheckoutLogic,
    issues,
    score,
  };
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _detectProvider(allContent) {
  for (const [provider, keywords] of Object.entries(BILLING_KEYWORDS)) {
    if (keywords.some(kw => allContent.includes(kw.toLowerCase()))) return provider;
  }
  return null;
}

function _detectWebhook(allContent, filePaths, provider) {
  if (provider === 'stripe') {
    return allContent.includes('webhooks.constructevent') ||
           allContent.includes('stripe-signature') ||
           filePaths.some(p => p.includes('webhook'));
  }
  if (provider === 'paddle') {
    return filePaths.some(p => p.includes('webhook')) || allContent.includes('paddle_signature');
  }
  return true; // Other providers: assume OK
}

function _detectCheckout(allContent, provider) {
  if (provider === 'stripe') {
    return allContent.includes('checkout.sessions.create') ||
           allContent.includes('payment_intent') ||
           allContent.includes('paymentintents.create');
  }
  if (provider === 'paypal') {
    return allContent.includes('createorder') || allContent.includes('orders.create');
  }
  return allContent.includes('checkout') || allContent.includes('payment');
}

function _capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = { checkBilling };
