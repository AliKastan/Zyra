'use strict';

/**
 * User Events — Event type constants and factory functions
 */

const USER_EVENTS = {
  CREATED:              'user.created',
  UPDATED:              'user.updated',
  DELETED:              'user.deleted',
  EMAIL_VERIFIED:       'user.email_verified',
  VERIFICATION_SENT:    'user.verification_sent',
  PASSWORD_RESET_REQUESTED: 'user.password_reset_requested',
  PASSWORD_RESET:       'user.password_reset',
  ROLE_CHANGED:         'user.role_changed',
  STATUS_CHANGED:       'user.status_changed',
  LOGIN:                'user.login',
  LOGOUT:               'user.logout',
};

/**
 * @param {string} eventName
 * @param {import('./user-types').User} user
 * @param {Object} [extra]
 * @returns {{ event: string, userId: string, timestamp: Date, data: Object }}
 */
function createUserEvent(eventName, user, extra = {}) {
  return {
    event:     eventName,
    userId:    user.id,
    timestamp: new Date(),
    data:      { email: user.email, role: user.role, status: user.status, ...extra },
  };
}

module.exports = { USER_EVENTS, createUserEvent };
