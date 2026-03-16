'use strict';

/**
 * Analytics Service — Business logic for event tracking and usage metrics
 *
 * Covers: event tracking, usage metrics, user activity logs.
 */

const { ANALYTICS_EVENTS: EVENTS } = require('./analytics-types');

/**
 * @param {import('./analytics-types').AnalyticsDbAdapter} db
 * @param {Object} [opts]
 * @param {function(Object): void} [opts.emit]
 * @param {boolean} [opts.enabled]   - Set false to disable tracking (e.g. dev mode)
 * @returns {Object}
 */
function createAnalyticsService(db, opts = {}) {
  const emit    = opts.emit   || (() => {});
  const enabled = opts.enabled !== false;

  return {

    async track(input) {
      if (!enabled) return null;
      if (!input.name) throw Object.assign(new Error('Event name is required'), { code: 'VALIDATION_ERROR' });

      const event = await db.createEvent({
        name:       input.name,
        userId:     input.userId     || null,
        sessionId:  input.sessionId  || null,
        properties: input.properties || {},
        source:     input.source     || null,
        medium:     input.medium     || null,
        campaign:   input.campaign   || null,
        ipAddress:  input.ipAddress  || null,
        userAgent:  input.userAgent  || null,
        timestamp:  new Date(),
      });

      emit({ event: 'analytics.tracked', name: input.name, userId: input.userId });
      return event;
    },

    async trackPageView(userId, page, sessionId) {
      return this.track({ name: EVENTS.PAGE_VIEW, userId, sessionId, properties: { page } });
    },

    async trackSignUp(userId, method) {
      return this.track({ name: EVENTS.SIGN_UP, userId, properties: { method: method || 'email' } });
    },

    async trackSignIn(userId) {
      return this.track({ name: EVENTS.SIGN_IN, userId });
    },

    async trackFeatureUsed(userId, featureName, context = {}) {
      return this.track({ name: EVENTS.FEATURE_USED, userId, properties: { feature: featureName, ...context } });
    },

    async trackPurchase(userId, orderId, amount, currency) {
      return this.track({ name: EVENTS.PURCHASE, userId, properties: { orderId, amount, currency } });
    },

    async trackSubscriptionEvent(userId, eventType, planId) {
      const name = eventType === 'start' ? EVENTS.SUBSCRIPTION_START : EVENTS.SUBSCRIPTION_CANCEL;
      return this.track({ name, userId, properties: { planId } });
    },

    async trackError(userId, errorCode, context = {}) {
      return this.track({ name: EVENTS.ERROR_OCCURRED, userId, properties: { errorCode, ...context } });
    },

    // ── Metrics ──────────────────────────────────────────────────────────────

    async recordMetric(userId, metric, value, period) {
      return db.recordMetric({ userId, metric, value, period: period || 'day', recordedAt: new Date() });
    },

    async getMetrics(userId, opts = {}) {
      return db.getMetrics({ userId, ...opts });
    },

    // ── Activity logs ────────────────────────────────────────────────────────

    async logActivity(userId, action, context = {}) {
      return db.logActivity({ userId, action, context, timestamp: new Date() });
    },

    async getUserActivity(userId, opts = {}) {
      return db.getUserActivity(userId, { limit: opts.limit || 100, ...opts });
    },

    // ── Query events ─────────────────────────────────────────────────────────

    async queryEvents(filter = {}) {
      return db.queryEvents(filter);
    },

    async getEventCount(eventName, opts = {}) {
      const events = await db.queryEvents({ name: eventName, ...opts });
      return Array.isArray(events) ? events.length : 0;
    },
  };
}

module.exports = { createAnalyticsService };
