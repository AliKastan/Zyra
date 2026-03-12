/**
 * Stripe Client
 * Lazy-initialised singleton — throws a clear error if STRIPE_SECRET_KEY is missing.
 */

let _stripe = null;

function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set. Add it to .env.local to enable billing.');
    // require here so the rest of the app loads fine even without stripe installed
    _stripe = require('stripe')(key, { apiVersion: '2024-04-10' });
  }
  return _stripe;
}

function isStripeConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY);
}

module.exports = { getStripe, isStripeConfigured };
