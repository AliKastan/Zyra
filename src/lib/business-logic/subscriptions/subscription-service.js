'use strict';

/**
 * Subscription Service — Business logic for subscription lifecycle management
 *
 * Covers: creation, trial handling, upgrade/downgrade, cancellation, renewal.
 * Inject a `db` adapter implementing SubscriptionDbAdapter interface.
 */

const { SUBSCRIPTION_STATUSES, DEFAULT_TRIAL_DAYS } = require('./subscription-types');
const { SUBSCRIPTION_EVENTS, createSubscriptionEvent } = require('./subscription-events');

/**
 * @param {import('./subscription-types').SubscriptionDbAdapter} db
 * @param {Object} [opts]
 * @param {function(Object): void} [opts.emit]
 * @returns {Object}
 */
function createSubscriptionService(db, opts = {}) {
  const emit = opts.emit || (() => {});

  return {

    // ── Create ──────────────────────────────────────────────────────────────

    async createSubscription(input) {
      _validate(input, ['userId', 'planId', 'billingInterval']);

      const plan = await db.findPlan(input.planId);
      if (!plan) throw Object.assign(new Error('Plan not found'), { code: 'NOT_FOUND' });

      const existing = await db.findByUserId(input.userId);
      if (existing && ['active', 'trialing'].includes(existing.status)) {
        throw Object.assign(new Error('User already has an active subscription'), { code: 'ALREADY_SUBSCRIBED' });
      }

      const trialDays   = input.trialDays != null ? input.trialDays : DEFAULT_TRIAL_DAYS;
      const hasTrialDays = trialDays > 0;
      const now         = new Date();
      const periodEnd   = _addDays(now, hasTrialDays ? trialDays : _periodDays(input.billingInterval));

      const sub = await db.create({
        userId:             input.userId,
        planId:             input.planId,
        status:             hasTrialDays ? 'trialing' : 'active',
        billingInterval:    input.billingInterval,
        currentPeriodStart: now,
        currentPeriodEnd:   periodEnd,
        trialStart:         hasTrialDays ? now : null,
        trialEnd:           hasTrialDays ? _addDays(now, trialDays) : null,
        cancelledAt:        null,
        cancelAtPeriodEnd:  null,
        externalId:         input.externalId || null,
        metadata:           {},
        createdAt:          now,
        updatedAt:          now,
      });

      emit(createSubscriptionEvent(SUBSCRIPTION_EVENTS.CREATED, sub, { plan }));
      return sub;
    },

    // ── Read ────────────────────────────────────────────────────────────────

    async getSubscription(id) {
      return db.findById(id);
    },

    async getUserSubscription(userId) {
      return db.findByUserId(userId);
    },

    async getSubscriptionStatus(userId) {
      const sub = await db.findByUserId(userId);
      if (!sub) return { hasSubscription: false, status: null, plan: null, isTrialing: false, isActive: false };

      const isActive   = sub.status === 'active';
      const isTrialing = sub.status === 'trialing';
      const plan       = await db.findPlan(sub.planId);

      return { hasSubscription: true, status: sub.status, plan, isTrialing, isActive, sub };
    },

    async listPlans() {
      return db.listPlans();
    },

    // ── Upgrade / Downgrade ──────────────────────────────────────────────────

    async changePlan(subscriptionId, newPlanId) {
      const sub = await db.findById(subscriptionId);
      if (!sub) throw Object.assign(new Error('Subscription not found'), { code: 'NOT_FOUND' });
      if (!['active', 'trialing'].includes(sub.status)) {
        throw Object.assign(new Error('Cannot change plan on inactive subscription'), { code: 'INACTIVE' });
      }

      const newPlan = await db.findPlan(newPlanId);
      if (!newPlan) throw Object.assign(new Error('Plan not found'), { code: 'NOT_FOUND' });

      const oldPlanId = sub.planId;
      const updated   = await db.update(subscriptionId, { planId: newPlanId, updatedAt: new Date() });

      const event = oldPlanId < newPlanId
        ? SUBSCRIPTION_EVENTS.UPGRADED
        : SUBSCRIPTION_EVENTS.DOWNGRADED;
      emit(createSubscriptionEvent(event, updated, { oldPlanId, newPlanId }));
      return updated;
    },

    // ── Trial handling ───────────────────────────────────────────────────────

    async convertTrialToActive(subscriptionId, externalId) {
      const sub = await db.findById(subscriptionId);
      if (!sub) throw Object.assign(new Error('Subscription not found'), { code: 'NOT_FOUND' });
      if (sub.status !== 'trialing') return sub; // already converted

      const now     = new Date();
      const updated = await db.update(subscriptionId, {
        status:             'active',
        trialEnd:           now,
        currentPeriodStart: now,
        currentPeriodEnd:   _addDays(now, _periodDays(sub.billingInterval)),
        externalId:         externalId || sub.externalId,
        updatedAt:          now,
      });
      emit(createSubscriptionEvent(SUBSCRIPTION_EVENTS.TRIAL_ENDED, updated));
      return updated;
    },

    async isTrialExpired(subscriptionId) {
      const sub = await db.findById(subscriptionId);
      if (!sub || sub.status !== 'trialing') return false;
      return sub.trialEnd != null && new Date() > new Date(sub.trialEnd);
    },

    // ── Cancellation ────────────────────────────────────────────────────────

    async cancelSubscription(subscriptionId, opts = {}) {
      const sub = await db.findById(subscriptionId);
      if (!sub) throw Object.assign(new Error('Subscription not found'), { code: 'NOT_FOUND' });

      const now = new Date();
      const update = opts.atPeriodEnd
        ? { cancelAtPeriodEnd: sub.currentPeriodEnd, updatedAt: now }
        : { status: 'cancelled', cancelledAt: now, updatedAt: now };

      const updated = await db.update(subscriptionId, update);
      emit(createSubscriptionEvent(SUBSCRIPTION_EVENTS.CANCELLED, updated, { atPeriodEnd: !!opts.atPeriodEnd }));
      return updated;
    },

    // ── Renewal ─────────────────────────────────────────────────────────────

    async renewSubscription(subscriptionId) {
      const sub = await db.findById(subscriptionId);
      if (!sub) throw Object.assign(new Error('Subscription not found'), { code: 'NOT_FOUND' });

      const now     = new Date(sub.currentPeriodEnd);
      const updated = await db.update(subscriptionId, {
        status:             'active',
        currentPeriodStart: now,
        currentPeriodEnd:   _addDays(now, _periodDays(sub.billingInterval)),
        cancelAtPeriodEnd:  null,
        updatedAt:          new Date(),
      });
      emit(createSubscriptionEvent(SUBSCRIPTION_EVENTS.RENEWED, updated));
      return updated;
    },
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _validate(input, required) {
  for (const field of required) {
    if (!input[field]) {
      throw Object.assign(new Error(`${field} is required`), { code: 'VALIDATION_ERROR' });
    }
  }
}

function _addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function _periodDays(interval) {
  if (interval === 'annual')   return 365;
  if (interval === 'lifetime') return 36500;
  return 30; // monthly default
}

module.exports = { createSubscriptionService };
