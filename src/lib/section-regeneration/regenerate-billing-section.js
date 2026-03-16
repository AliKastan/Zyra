'use strict';

/**
 * Billing / Payments Section Regenerator
 *
 * Spec for Stripe billing, subscriptions, checkout, webhooks.
 *
 * IMPORTANT: Never creates fake billing (hardcoded plan success, in-memory
 * subscription state). Always scaffolds real Stripe integration or
 * config-required placeholder mode when STRIPE_SECRET_KEY is absent.
 */

/**
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object} [context]
 * @param {Object.<string,string>} [context.existingFiles]
 * @param {string} [context.userPrompt]
 * @returns {import('./types').SectionRegenerationSpec}
 */
function regenerateBillingSection(plan, context = {}) {
  const { existingFiles = {}, userPrompt = '' } = context;

  const isRemoval      = plan.changeDetection.action === 'remove';
  const needsWebhooks  = /webhook/i.test(userPrompt);
  const needsPortal    = /portal|manage.*subscription|customer.*portal/i.test(userPrompt);
  const needsOneTime   = /one[_\s-]?time|lifetime|single.*payment/i.test(userPrompt);
  const needsTrials    = /trial|free.*tier|freemium/i.test(userPrompt);

  const existingBillingFiles = Object.keys(existingFiles).filter(p =>
    /stripe|billing|payment|checkout|subscription|pricing/i.test(p),
  );

  const filesToCreate = [];
  if (!isRemoval) {
    if (!existingBillingFiles.some(p => /routes/.test(p))) {
      filesToCreate.push({ path: 'server/routes/billing.js', description: 'Stripe billing API routes (create checkout session, get subscription)' });
    }
    if (needsWebhooks && !existingBillingFiles.some(p => /webhook/i.test(p))) {
      filesToCreate.push({ path: 'server/routes/billing-webhook.js', description: 'Stripe webhook handler (subscription events)' });
    }
    if (!existingBillingFiles.some(p => /pricing/i.test(p))) {
      filesToCreate.push({ path: 'client/pages/Pricing.jsx', description: 'Pricing page with plan selection' });
    }
    if (!existingBillingFiles.some(p => /checkout/i.test(p))) {
      filesToCreate.push({ path: 'client/pages/Checkout.jsx', description: 'Checkout success/cancel page' });
    }
    if (needsPortal) {
      filesToCreate.push({ path: 'server/routes/billing-portal.js', description: 'Stripe customer portal session route' });
    }
  }

  const filesToPatch = existingBillingFiles.map(p => ({
    path: p,
    description: isRemoval ? 'Remove billing integration' : 'Update billing implementation',
    operation:   isRemoval ? 'delete' : 'replace',
  }));

  const generationHints = [
    'Use STRIPE_SECRET_KEY from environment — never hardcode',
    'Use stripe.checkout.sessions.create for checkout flow',
    'Verify webhook signatures with stripe.webhooks.constructEvent',
    'Store subscription status in database — never trust only client state',
    'Return Stripe price IDs from config — not hardcoded',
  ];

  if (needsOneTime)  generationHints.push('Use payment_mode="payment" for one-time purchases');
  if (needsTrials)   generationHints.push('Use trial_period_days in subscription config');
  if (isRemoval)     generationHints.push('Remove Stripe routes and pricing pages; remove STRIPE_ env vars from .env.example');

  return {
    sectionType:        'billing',
    filesToCreate,
    filesToPatch,
    envVarsNeeded:      isRemoval ? [] : ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
    dependenciesNeeded: isRemoval ? [] : ['stripe'],
    generationHints,
    validationHints: [
      'Verify STRIPE_SECRET_KEY is read from env — not hardcoded',
      'Check webhook handler verifies Stripe signature',
      'Verify checkout route returns { url } for redirect',
      'Run backend authenticity check on billing routes',
    ],
    repairHints: [
      'Replace hardcoded STRIPE_SECRET_KEY with process.env.STRIPE_SECRET_KEY',
      'Add signature verification to webhook handler',
      'Add placeholder UI if STRIPE_PUBLISHABLE_KEY not configured',
    ],
    placeholderMode:  false,  // billing must be real or explicitly config-required
    authenticityNote: 'Billing routes must use real Stripe SDK calls or be explicitly marked as config-required. Never simulate payment success.',
  };
}

module.exports = { regenerateBillingSection };
