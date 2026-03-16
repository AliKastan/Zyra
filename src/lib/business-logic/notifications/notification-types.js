'use strict';

/**
 * Notifications Module — Type Definitions
 *
 * @typedef {'email'|'in_app'|'sms'|'push'} NotificationChannel
 * @typedef {'unread'|'read'|'dismissed'} NotificationStatus
 * @typedef {'info'|'success'|'warning'|'error'} NotificationType
 *
 * @typedef {Object} Notification
 * @property {string}             id
 * @property {string}             userId
 * @property {string}             title
 * @property {string}             body
 * @property {NotificationType}   type
 * @property {NotificationStatus} status
 * @property {NotificationChannel[]} channels
 * @property {string|null}        actionUrl
 * @property {Object|null}        metadata
 * @property {Date}               createdAt
 * @property {Date|null}          readAt
 * @property {Date|null}          sentAt
 *
 * @typedef {Object} CreateNotificationInput
 * @property {string}             userId
 * @property {string}             title
 * @property {string}             body
 * @property {NotificationType}   [type]
 * @property {NotificationChannel[]} [channels]
 * @property {string}             [actionUrl]
 * @property {Object}             [metadata]
 *
 * @typedef {Object} NotificationDbAdapter
 * @property {function(string): Promise<Notification|null>}                    findById
 * @property {function(string, Object): Promise<Notification[]>}               findByUserId
 * @property {function(string): Promise<number>}                               countUnread
 * @property {function(Partial<Notification>): Promise<Notification>}          create
 * @property {function(string, Partial<Notification>): Promise<Notification>}  update
 * @property {function(string): Promise<boolean>}                              markAllRead
 */

const NOTIFICATION_CHANNELS = /** @type {const} */ (['email', 'in_app', 'sms', 'push']);
const NOTIFICATION_STATUSES = /** @type {const} */ (['unread', 'read', 'dismissed']);
const NOTIFICATION_TYPES    = /** @type {const} */ (['info', 'success', 'warning', 'error']);

module.exports = { NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES, NOTIFICATION_TYPES };
