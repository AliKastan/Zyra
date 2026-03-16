'use strict';

/**
 * Subscription Module — Type Definitions
 *
 * @typedef {'trialing'|'active'|'past_due'|'cancelled'|'expired'|'paused'} SubscriptionStatus
 * @typedef {'monthly'|'annual'|'lifetime'} BillingInterval
 *
 * @typedef {Object} PlanTier
 * @property {string}           id
 * @property {string}           name
 * @property {number}           priceMonthly
 * @property {number}           priceAnnual
 * @property {string[]}         features
 * @property {Object}           limits
 * @property {number}           limits.seats
 * @property {number}           limits.apiCalls
 * @property {number}           limits.storageGb
 * @property {boolean}          isDefault
 *
 * @typedef {Object} Subscription
 * @property {string}             id
 * @property {string}             userId
 * @property {string}             planId
 * @property {SubscriptionStatus} status
 * @property {BillingInterval}    billingInterval
 * @property {Date}               currentPeriodStart
 * @property {Date}               currentPeriodEnd
 * @property {Date|null}          trialStart
 * @property {Date|null}          trialEnd
 * @property {Date|null}          cancelledAt
 * @property {Date|null}          cancelAtPeriodEnd
 * @property {string|null}        externalId
 * @property {Object}             metadata
 * @property {Date}               createdAt
 * @property {Date}               updatedAt
 *
 * @typedef {Object} CreateSubscriptionInput
 * @property {string}           userId
 * @property {string}           planId
 * @property {BillingInterval}  billingInterval
 * @property {number}           [trialDays]
 * @property {string}           [externalId]
 *
 * @typedef {Object} SubscriptionDbAdapter
 * @property {function(string): Promise<Subscription|null>}              findById
 * @property {function(string): Promise<Subscription|null>}              findByUserId
 * @property {function(Partial<Subscription>): Promise<Subscription>}    create
 * @property {function(string, Partial<Subscription>): Promise<Subscription>} update
 * @property {function(): Promise<PlanTier[]>}                           listPlans
 * @property {function(string): Promise<PlanTier|null>}                  findPlan
 */

const SUBSCRIPTION_STATUSES = /** @type {const} */ (['trialing', 'active', 'past_due', 'cancelled', 'expired', 'paused']);
const BILLING_INTERVALS     = /** @type {const} */ (['monthly', 'annual', 'lifetime']);

const DEFAULT_TRIAL_DAYS = 14;

module.exports = { SUBSCRIPTION_STATUSES, BILLING_INTERVALS, DEFAULT_TRIAL_DAYS };
