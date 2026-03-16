'use strict';

/**
 * Admin Tools Module — Type Definitions
 *
 * @typedef {'ban'|'suspend'|'warn'|'unsuspend'|'delete'} ModerationAction
 * @typedef {'user'|'content'|'order'|'subscription'} ModerationTarget
 * @typedef {'info'|'warn'|'error'|'security'|'audit'} LogLevel
 *
 * @typedef {Object} ModerationRecord
 * @property {string}           id
 * @property {string}           adminId
 * @property {ModerationTarget} targetType
 * @property {string}           targetId
 * @property {ModerationAction} action
 * @property {string}           reason
 * @property {Object|null}      metadata
 * @property {Date}             createdAt
 *
 * @typedef {Object} SystemLog
 * @property {string}    id
 * @property {LogLevel}  level
 * @property {string}    message
 * @property {string}    source
 * @property {string|null} userId
 * @property {Object|null} context
 * @property {Date}      createdAt
 *
 * @typedef {Object} AdminAction
 * @property {string}           id
 * @property {string}           adminId
 * @property {string}           action
 * @property {string}           targetType
 * @property {string}           targetId
 * @property {Object|null}      before
 * @property {Object|null}      after
 * @property {string}           ipAddress
 * @property {Date}             createdAt
 *
 * @typedef {Object} AdminDbAdapter
 * @property {{ create: function, query: function, findById: function }} moderation
 * @property {{ create: function, query: function }}                     logs
 * @property {{ create: function, query: function }}                     actions
 * @property {{ findById: function, update: function }}                  users
 * @property {{ findById: function, update: function }}                  content
 */

const MODERATION_ACTIONS = /** @type {const} */ (['ban', 'suspend', 'warn', 'unsuspend', 'delete']);
const LOG_LEVELS         = /** @type {const} */ (['info', 'warn', 'error', 'security', 'audit']);

module.exports = { MODERATION_ACTIONS, LOG_LEVELS };
