'use strict';

/**
 * Analytics Module — Type Definitions
 *
 * @typedef {Object} AnalyticsEvent
 * @property {string}      id
 * @property {string}      name
 * @property {string|null} userId
 * @property {string|null} sessionId
 * @property {Object}      properties
 * @property {string|null} source
 * @property {string|null} medium
 * @property {string|null} campaign
 * @property {string|null} ipAddress
 * @property {string|null} userAgent
 * @property {Date}        timestamp
 *
 * @typedef {Object} TrackEventInput
 * @property {string}      name
 * @property {string}      [userId]
 * @property {string}      [sessionId]
 * @property {Object}      [properties]
 * @property {string}      [source]
 * @property {string}      [medium]
 * @property {string}      [campaign]
 *
 * @typedef {Object} UsageMetric
 * @property {string}  userId
 * @property {string}  metric
 * @property {number}  value
 * @property {string}  period
 * @property {Date}    recordedAt
 *
 * @typedef {Object} ActivityLog
 * @property {string}  id
 * @property {string}  userId
 * @property {string}  action
 * @property {Object}  context
 * @property {Date}    timestamp
 *
 * @typedef {Object} AnalyticsDbAdapter
 * @property {function(Partial<AnalyticsEvent>): Promise<AnalyticsEvent>}  createEvent
 * @property {function(Object): Promise<AnalyticsEvent[]>}                 queryEvents
 * @property {function(Object): Promise<UsageMetric[]>}                    getMetrics
 * @property {function(Partial<UsageMetric>): Promise<void>}               recordMetric
 * @property {function(Partial<ActivityLog>): Promise<ActivityLog>}        logActivity
 * @property {function(string, Object): Promise<ActivityLog[]>}            getUserActivity
 */

const ANALYTICS_PERIODS = /** @type {const} */ (['hour', 'day', 'week', 'month', 'year']);

// Common event names
const ANALYTICS_EVENTS = {
  PAGE_VIEW:         'page_view',
  SIGN_UP:           'sign_up',
  SIGN_IN:           'sign_in',
  SIGN_OUT:          'sign_out',
  SUBSCRIPTION_START: 'subscription_start',
  SUBSCRIPTION_CANCEL: 'subscription_cancel',
  PURCHASE:          'purchase',
  FEATURE_USED:      'feature_used',
  ERROR_OCCURRED:    'error_occurred',
  EXPORT_DATA:       'export_data',
};

module.exports = { ANALYTICS_PERIODS, ANALYTICS_EVENTS };
