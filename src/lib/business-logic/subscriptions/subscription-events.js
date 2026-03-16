'use strict';

const SUBSCRIPTION_EVENTS = {
  CREATED:      'subscription.created',
  UPGRADED:     'subscription.upgraded',
  DOWNGRADED:   'subscription.downgraded',
  CANCELLED:    'subscription.cancelled',
  RENEWED:      'subscription.renewed',
  TRIAL_ENDED:  'subscription.trial_ended',
  PAST_DUE:     'subscription.past_due',
  REACTIVATED:  'subscription.reactivated',
  EXPIRED:      'subscription.expired',
};

/**
 * @param {string} eventName
 * @param {import('./subscription-types').Subscription} sub
 * @param {Object} [extra]
 */
function createSubscriptionEvent(eventName, sub, extra = {}) {
  return {
    event:          eventName,
    subscriptionId: sub.id,
    userId:         sub.userId,
    timestamp:      new Date(),
    data:           { planId: sub.planId, status: sub.status, billingInterval: sub.billingInterval, ...extra },
  };
}

module.exports = { SUBSCRIPTION_EVENTS, createSubscriptionEvent };
