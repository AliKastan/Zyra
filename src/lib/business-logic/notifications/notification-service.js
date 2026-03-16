'use strict';

/**
 * Notification Service — Business logic for multi-channel notifications
 *
 * Covers: create, send, in-app inbox, mark read, event-based alerts.
 */

const { NOTIFICATION_EVENTS, createNotificationEvent } = require('./notification-events');

/**
 * @param {import('./notification-types').NotificationDbAdapter} db
 * @param {Object} [opts]
 * @param {function(Object): void} [opts.emit]
 * @param {function(Object): Promise<void>} [opts.sendEmail]  - Email sender adapter
 * @param {function(Object): Promise<void>} [opts.sendPush]   - Push notification adapter
 * @returns {Object}
 */
function createNotificationService(db, opts = {}) {
  const emit      = opts.emit      || (() => {});
  const sendEmail = opts.sendEmail || _noop;
  const sendPush  = opts.sendPush  || _noop;

  return {

    async createNotification(input) {
      if (!input.userId) throw Object.assign(new Error('userId is required'), { code: 'VALIDATION_ERROR' });
      if (!input.title)  throw Object.assign(new Error('title is required'),  { code: 'VALIDATION_ERROR' });
      if (!input.body)   throw Object.assign(new Error('body is required'),   { code: 'VALIDATION_ERROR' });

      const channels = input.channels || ['in_app'];
      const now      = new Date();

      const notification = await db.create({
        userId:    input.userId,
        title:     input.title,
        body:      input.body,
        type:      input.type || 'info',
        status:    'unread',
        channels,
        actionUrl: input.actionUrl || null,
        metadata:  input.metadata  || null,
        createdAt: now,
        readAt:    null,
        sentAt:    null,
      });

      // Dispatch to channels
      await _dispatch(notification, { sendEmail, sendPush });
      const sent = await db.update(notification.id, { sentAt: now });

      emit(createNotificationEvent(NOTIFICATION_EVENTS.SENT, sent));
      return sent;
    },

    async getNotifications(userId, opts = {}) {
      return db.findByUserId(userId, { limit: opts.limit || 50, unreadOnly: opts.unreadOnly || false });
    },

    async getUnreadCount(userId) {
      return db.countUnread(userId);
    },

    async markRead(notificationId) {
      const n = await db.update(notificationId, { status: 'read', readAt: new Date() });
      emit(createNotificationEvent(NOTIFICATION_EVENTS.READ, n));
      return n;
    },

    async markAllRead(userId) {
      await db.markAllRead(userId);
      emit({ event: NOTIFICATION_EVENTS.ALL_READ, userId, timestamp: new Date() });
      return true;
    },

    async dismiss(notificationId) {
      const n = await db.update(notificationId, { status: 'dismissed' });
      return n;
    },

    // ── Event-based alert factory ────────────────────────────────────────────

    async alertOnEvent(eventType, userId, context = {}) {
      const template = ALERT_TEMPLATES[eventType];
      if (!template) return null;
      return this.createNotification({
        userId,
        title:     template.title(context),
        body:      template.body(context),
        type:      template.type || 'info',
        channels:  template.channels || ['in_app'],
        actionUrl: template.actionUrl ? template.actionUrl(context) : null,
        metadata:  { eventType, ...context },
      });
    },
  };
}

// ── Alert templates ───────────────────────────────────────────────────────────

const ALERT_TEMPLATES = {
  'subscription.created': {
    title:    () => 'Welcome! Your subscription is active',
    body:     (ctx) => `You're now on the ${ctx.planName || 'selected'} plan.`,
    type:     'success',
    channels: ['in_app', 'email'],
  },
  'subscription.cancelled': {
    title:    () => 'Subscription cancelled',
    body:     (ctx) => `Your subscription ends on ${ctx.endDate || 'the end of the billing period'}.`,
    type:     'warning',
    channels: ['in_app', 'email'],
  },
  'order.payment_confirmed': {
    title:    () => 'Payment confirmed',
    body:     (ctx) => `Your order #${ctx.orderId || ''} has been confirmed.`,
    type:     'success',
    channels: ['in_app', 'email'],
  },
  'order.shipped': {
    title:    () => 'Your order has shipped',
    body:     (ctx) => `Order #${ctx.orderId || ''} is on the way.`,
    type:     'info',
    channels: ['in_app', 'email'],
  },
  'user.email_verified': {
    title:    () => 'Email verified',
    body:     () => 'Your email address has been verified.',
    type:     'success',
    channels: ['in_app'],
  },
};

// ── Private ───────────────────────────────────────────────────────────────────

async function _dispatch(notification, { sendEmail, sendPush }) {
  const tasks = [];
  if (notification.channels.includes('email')) {
    tasks.push(sendEmail({ to: notification.userId, subject: notification.title, body: notification.body, actionUrl: notification.actionUrl }).catch(() => {}));
  }
  if (notification.channels.includes('push')) {
    tasks.push(sendPush({ userId: notification.userId, title: notification.title, body: notification.body }).catch(() => {}));
  }
  await Promise.all(tasks);
}

async function _noop() {}

module.exports = { createNotificationService, ALERT_TEMPLATES };
