'use strict';

/**
 * Billing Planning Checks
 *
 * Detects billing requirements without corresponding plan:
 * - Stripe env vars missing
 * - Webhook handler not planned
 * - Billing utility/wrapper not planned
 * - Checkout flow not planned
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').PreventionInput} input
 * @returns {import('./types').PreventionIssue[]}
 */
function checkBillingPlanning(input) {
  const { intent = {}, product = {}, stack = {}, blueprint = {}, complexityReport = null } = input;

  const issues = [];
  const allText  = _buildAllText(intent, product, blueprint, stack);
  const signals  = complexityReport?.signals || {};
  const fileList = _getFileList(stack, blueprint);

  const needsBilling = (
    signals.hasBilling ||
    /\b(stripe|billing|payment|subscription|pricing|checkout|invoice|plan|tier|monetize|paid|free.?trial|saas.pricing)\b/.test(allText)
  );

  if (!needsBilling) return issues;

  // ── Stripe env vars ────────────────────────────────────────────────────────
  if (!allText.includes('stripe_secret_key')) {
    issues.push({
      id: 'billing-missing-stripe-env-vars',
      category: 'billing',
      severity: 'high',
      action: 'safe_default_injected',
      reason: 'Stripe billing is required but STRIPE_SECRET_KEY is not in the env plan.',
      fix: 'Add STRIPE_SECRET_KEY=sk_test_... and STRIPE_PUBLISHABLE_KEY=pk_test_... to .env.example',
    });
  }

  // ── Billing utility file ──────────────────────────────────────────────────
  const hasBillingFile = fileList.some(f =>
    /billing|stripe|payment|checkout|subscription/i.test(f),
  );

  if (!hasBillingFile) {
    issues.push({
      id: 'billing-missing-utility-plan',
      category: 'billing',
      severity: 'medium',
      action: 'generation_hint_added',
      reason: 'Billing is required but no billing utility file is planned. Billing logic scattered across files is hard to maintain.',
      fix: 'Add billing.js or lib/stripe.js to planned files for centralized Stripe logic',
    });
  }

  // ── Webhook handler ───────────────────────────────────────────────────────
  const hasWebhookPlan = (
    allText.includes('webhook') ||
    fileList.some(f => /webhook/i.test(f))
  );

  if (!hasWebhookPlan) {
    issues.push({
      id: 'billing-missing-webhook-plan',
      category: 'billing',
      severity: 'medium',
      action: 'warning_only',
      reason: 'Stripe billing is planned without a webhook handler. Subscription status and payment events will not be processed.',
      fix: 'Plan a POST /webhook route that handles stripe.webhooks.constructEvent()',
    });
  }

  // ── Stripe webhook secret ─────────────────────────────────────────────────
  if (!allText.includes('stripe_webhook_secret') && hasWebhookPlan) {
    issues.push({
      id: 'billing-missing-webhook-secret-env',
      category: 'env',
      severity: 'medium',
      action: 'generation_hint_added',
      reason: 'Stripe webhook handler requires STRIPE_WEBHOOK_SECRET to verify event signatures.',
      fix: 'Add STRIPE_WEBHOOK_SECRET=whsec_... to .env.example',
    });
  }

  // ── Checkout logic ────────────────────────────────────────────────────────
  const hasCheckoutPlan = (
    allText.includes('checkout') ||
    allText.includes('payment intent') ||
    allText.includes('create session')
  );

  if (!hasCheckoutPlan) {
    issues.push({
      id: 'billing-missing-checkout-plan',
      category: 'billing',
      severity: 'low',
      action: 'generation_hint_added',
      reason: 'Billing is planned but no checkout flow is described. Users cannot complete payments without a checkout session.',
      fix: 'Plan a checkout route that creates a Stripe Checkout Session and redirects the user',
    });
  }

  // ── Auth required with billing ────────────────────────────────────────────
  const hasAuth = /\b(auth|login|signup|user|account)\b/.test(allText) || signals.hasAuth;
  if (!hasAuth) {
    issues.push({
      id: 'billing-without-auth-context',
      category: 'auth',
      severity: 'medium',
      action: 'warning_only',
      reason: 'Billing is planned without any user auth. Without user accounts, subscription management is impossible.',
      fix: 'Ensure the app includes user authentication before billing flows',
    });
  }

  return issues;
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _getFileList(stack, blueprint) {
  return [...new Set([...(stack?.files || []), ...(blueprint?.fileList || [])])];
}

function _buildAllText(intent, product, blueprint, stack) {
  return [
    intent.appType || '',
    (intent.features || []).map(f => `${f.name} ${f.description || ''}`).join(' '),
    product.summary || '',
    (product.pages || []).map(p => p.name || p).join(' '),
    blueprint.designNotes || '',
    (blueprint._designSpec?.generationHints || []).join(' '),
    (stack?.files || []).join(' '),
    (stack?.tech ? JSON.stringify(stack.tech) : ''),
  ].join(' ').toLowerCase();
}

module.exports = { checkBillingPlanning };
