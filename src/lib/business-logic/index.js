'use strict';

/**
 * Starter Business Logic Library — Public API
 *
 * Production-ready business logic modules for common SaaS patterns.
 * Use module-registry to select which modules apply to a given app.
 *
 * Service factory pattern: each module exports createXService(db) which
 * accepts a database adapter and returns a fully-functional service object.
 * No database engine is assumed — works with Sequelize, Mongoose, Prisma, etc.
 *
 * @example
 * const { createUserService, selectModules } = require('./lib/business-logic');
 * const modules = selectModules('saas', 'build a SaaS with subscriptions');
 * // → { modules: ['users', 'subscriptions', 'analytics'], ... }
 */

// ── Service factories ─────────────────────────────────────────────────────────

const { createUserService }         = require('./users/user-service');
const { createSubscriptionService } = require('./subscriptions/subscription-service');
const { createOrderService }        = require('./orders/order-service');
const { createNotificationService, ALERT_TEMPLATES } = require('./notifications/notification-service');
const { createContentService }      = require('./content/content-service');
const { createAdminService }        = require('./admin/admin-service');
const { createAnalyticsService }    = require('./analytics/analytics-service');

// ── Validation ────────────────────────────────────────────────────────────────

const { validateCreateUser, validateUpdateUser, validatePassword, sanitizeUser } = require('./users/user-validation');

// ── Event constants ───────────────────────────────────────────────────────────

const { USER_EVENTS, createUserEvent }                       = require('./users/user-events');
const { SUBSCRIPTION_EVENTS, createSubscriptionEvent }       = require('./subscriptions/subscription-events');
const { ORDER_EVENTS, createOrderEvent }                     = require('./orders/order-events');
const { NOTIFICATION_EVENTS, createNotificationEvent }       = require('./notifications/notification-events');
const { CONTENT_EVENTS, createContentEvent }                 = require('./content/content-events');
const { ADMIN_EVENTS, createAdminEvent }                     = require('./admin/admin-events');
const { ANALYTICS_EVENTS, ANALYTICS_PERIODS }                = require('./analytics/analytics-types');

// ── Type constants ────────────────────────────────────────────────────────────

const { USER_STATUSES, USER_ROLES }                          = require('./users/user-types');
const { SUBSCRIPTION_STATUSES, BILLING_INTERVALS, DEFAULT_TRIAL_DAYS } = require('./subscriptions/subscription-types');
const { ORDER_STATUSES, PAYMENT_STATUSES }                   = require('./orders/order-types');
const { NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES, NOTIFICATION_TYPES } = require('./notifications/notification-types');
const { CONTENT_STATUSES, CONTENT_TYPES }                    = require('./content/content-types');
const { MODERATION_ACTIONS, LOG_LEVELS }                     = require('./admin/admin-types');

// ── Module registry ───────────────────────────────────────────────────────────

const {
  MODULES,
  APP_TYPE_MODULES,
  getModulesForAppType,
  detectModulesFromPrompt,
  selectModules,
  getModuleDefinitions,
  buildModuleHints,
  buildModulesPayload,
} = require('./module-registry');

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // Service factories
  createUserService,
  createSubscriptionService,
  createOrderService,
  createNotificationService,
  createContentService,
  createAdminService,
  createAnalyticsService,

  // Validation helpers
  validateCreateUser,
  validateUpdateUser,
  validatePassword,
  sanitizeUser,

  // Events
  USER_EVENTS,         createUserEvent,
  SUBSCRIPTION_EVENTS, createSubscriptionEvent,
  ORDER_EVENTS,        createOrderEvent,
  NOTIFICATION_EVENTS, createNotificationEvent,
  CONTENT_EVENTS,      createContentEvent,
  ADMIN_EVENTS,        createAdminEvent,
  ANALYTICS_EVENTS,

  // Type constants
  USER_STATUSES,      USER_ROLES,
  SUBSCRIPTION_STATUSES, BILLING_INTERVALS, DEFAULT_TRIAL_DAYS,
  ORDER_STATUSES,     PAYMENT_STATUSES,
  NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES, NOTIFICATION_TYPES,
  CONTENT_STATUSES,   CONTENT_TYPES,
  MODERATION_ACTIONS, LOG_LEVELS,
  ANALYTICS_PERIODS,

  // Notification alert templates
  ALERT_TEMPLATES,

  // Module registry
  MODULES,
  APP_TYPE_MODULES,
  getModulesForAppType,
  detectModulesFromPrompt,
  selectModules,
  getModuleDefinitions,
  buildModuleHints,
  buildModulesPayload,
};
