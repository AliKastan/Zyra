const { Router } = require('express');
const ctrl = require('../controllers/billingController');

const router = Router();

// Credit usage for current period
router.get('/usage', ctrl.getUsage);

// Full subscription info + plan metadata
router.get('/subscription', ctrl.getSubscription);

// Start a Stripe checkout session → returns { url }
router.post('/checkout', ctrl.createCheckout);

// Open Stripe customer portal → returns { url }
router.post('/portal', ctrl.createPortal);

module.exports = router;
