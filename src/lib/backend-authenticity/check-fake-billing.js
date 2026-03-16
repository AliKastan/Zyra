'use strict';

/**
 * Fake Billing Detector
 *
 * Detects simulated payment flows:
 * - Payment buttons that don't call real Stripe API
 * - Checkout handlers that just set state or console.log
 * - Stripe UI without STRIPE_SECRET_KEY in backend
 * - Missing webhook handler for subscription lifecycle
 */

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {Object} files - Normalized file map { path: content }
 * @returns {import('./types').AuthenticityIssue[]}
 */
function checkFakeBilling(files) {
  const issues        = [];
  const allContent    = Object.values(files).join('\n');

  // Determine if billing is even attempted
  const attemptsBilling = _attemptsBilling(allContent);
  if (!attemptsBilling) return issues;

  const hasRealStripe = _hasRealStripeBackend(files, allContent);

  // ── 1. Stripe UI without backend Stripe integration ──────────────────
  if (!hasRealStripe) {
    issues.push({
      id:       'fake-billing-no-stripe-backend',
      category: 'fake_billing',
      severity: 'critical',
      message:  'Project includes payment/billing UI but has no real Stripe backend integration (no stripe.charges.create, no stripe.paymentIntents.create, no STRIPE_SECRET_KEY).',
      fix:      'Implement POST /api/billing/create-payment-intent using the stripe npm package and process.env.STRIPE_SECRET_KEY.',
    });
  }

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    if (/\.(test|spec)\.[jt]sx?$/.test(path)) continue;

    // ── 2. Payment handler that just sets state / alerts ──────────────
    const paymentFnMatch = content.match(
      /(?:handlePayment|handleCheckout|onPayment|processPurchase|buyNow|handleBuy)\s*=?\s*(?:async\s*)?\([^)]*\)\s*(?:=>)?\s*\{([^}]{0,500})\}/s,
    );
    if (paymentFnMatch) {
      const body = paymentFnMatch[1];
      const hasFetch   = /await\s+(?:fetch|axios)/.test(body);
      const hasStripe  = /stripe\.|Stripe\(|stripePromise/.test(body);
      const isFake     = (
        /(?:setIsPaid|setPaid|setSuccess|setCompleted)\s*\(\s*true/.test(body) ||
        /console\.log/.test(body) ||
        /alert\s*\(/.test(body)
      );

      if (isFake || (!hasFetch && !hasStripe)) {
        issues.push({
          id:       `fake-billing-stub-handler-${_slug(path)}`,
          category: 'fake_billing',
          severity: 'critical',
          message:  `${path} has a payment handler that simulates success (setIsPaid(true), console.log, alert) without calling a real payment API.`,
          fix:      'Redirect to Stripe Checkout (stripe.redirectToCheckout) or call POST /api/billing/create-payment-intent and confirm with Stripe.js.',
          file:     path,
          pattern:  'handlePayment = () => setIsPaid(true)',
        });
      }
    }

    // ── 3. Hardcoded plan prices without Stripe Price IDs ─────────────
    if (
      /price_[A-Za-z0-9]{10,}/.test(content) === false &&
      /(?:monthly|annual|pro|premium|plan).*\$\d+/.test(content) &&
      /stripe/i.test(content)
    ) {
      // Stripe plan pricing UI with no actual Stripe Price IDs
      issues.push({
        id:       `fake-billing-missing-price-ids-${_slug(path)}`,
        category: 'fake_billing',
        severity: 'medium',
        message:  `${path} shows pricing UI without Stripe Price IDs (price_xxx). Checkout will not work without real Price IDs.`,
        fix:      "Add Stripe Price IDs (e.g., price_1ABC...) from your Stripe dashboard to STRIPE_PRICE_PRO in .env.example.",
        file:     path,
        pattern:  'Plan pricing UI missing price_xxx IDs',
      });
    }

    // ── 4. Missing webhook handler ─────────────────────────────────────
    if (_isBackendFile(path) && hasRealStripe) {
      const hasWebhook = /webhook|stripe\.webhooks\.constructEvent/.test(content);
      const allBackendContent = Object.entries(files)
        .filter(([p]) => _isBackendFile(p))
        .map(([, c]) => c).join('\n');

      if (!hasWebhook && !allBackendContent.includes('webhook') && !allBackendContent.includes('constructEvent')) {
        issues.push({
          id:       'fake-billing-missing-webhook',
          category: 'fake_billing',
          severity: 'high',
          message:  'Project uses Stripe but has no webhook handler. Subscription lifecycle events (renewal, cancellation, failure) will be lost.',
          fix:      "Add POST /api/billing/webhook with stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET).",
        });
        break; // only flag once
      }
    }
  }

  return _dedup(issues);
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _attemptsBilling(allContent) {
  return (
    /stripe|paypal|paddle|billing|checkout|payment|subscribe|subscription/i.test(allContent) &&
    /\$\d+|price|plan|tier|monthly|annual|premium|pro\s+plan/i.test(allContent)
  );
}

function _hasRealStripeBackend(files, allContent) {
  // Stripe server-side calls
  if (/stripe\.(?:paymentIntents|charges|subscriptions|customers|checkout\.sessions)\.create/.test(allContent)) return true;
  // Stripe npm import in a backend file
  const backendContent = Object.entries(files)
    .filter(([p]) => _isBackendFile(p))
    .map(([, c]) => c).join('\n');

  if (/require\(['"`]stripe['"`]\)|from\s+['"`]stripe['"`]/.test(backendContent)) return true;

  // STRIPE_SECRET_KEY used in backend
  if (/process\.env\.STRIPE_SECRET_KEY/.test(backendContent)) return true;

  return false;
}

function _isBackendFile(path) {
  if (/\.(test|spec)\.[jt]sx?$/.test(path)) return false;
  return (
    path.endsWith('server.js') || path.endsWith('server.ts') ||
    path.endsWith('app.js')    || path.endsWith('app.ts') ||
    path.includes('routes/')   || path.includes('controllers/') ||
    path.includes('services/') || path.endsWith('src/index.js')
  );
}

function _dedup(issues) {
  const seen = new Set();
  return issues.filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

function _slug(str) {
  return str.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').slice(0, 40);
}

module.exports = { checkFakeBilling };
