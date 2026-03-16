'use strict';

/**
 * User Module — Type Definitions
 *
 * @typedef {'active'|'inactive'|'suspended'|'pending_verification'} UserStatus
 * @typedef {'user'|'admin'|'moderator'|'superadmin'} UserRole
 *
 * @typedef {Object} User
 * @property {string}      id
 * @property {string}      email
 * @property {string}      passwordHash
 * @property {string}      displayName
 * @property {UserRole}    role
 * @property {UserStatus}  status
 * @property {boolean}     emailVerified
 * @property {string|null} emailVerificationToken
 * @property {string|null} passwordResetToken
 * @property {Date|null}   passwordResetExpiry
 * @property {Object|null} profile
 * @property {Date}        createdAt
 * @property {Date}        updatedAt
 * @property {Date|null}   lastLoginAt
 *
 * @typedef {Object} CreateUserInput
 * @property {string}    email
 * @property {string}    password
 * @property {string}    [displayName]
 * @property {UserRole}  [role]
 *
 * @typedef {Object} UpdateUserInput
 * @property {string}    [displayName]
 * @property {string}    [email]
 * @property {UserRole}  [role]
 * @property {UserStatus}[status]
 * @property {Object}    [profile]
 *
 * @typedef {Object} UserDbAdapter
 * @property {function(string): Promise<User|null>}           findById
 * @property {function(string): Promise<User|null>}           findByEmail
 * @property {function(string): Promise<User|null>}           findByToken
 * @property {function(Partial<User>): Promise<User>}         create
 * @property {function(string, Partial<User>): Promise<User>} update
 * @property {function(string): Promise<boolean>}             delete
 * @property {function(UserRole): Promise<User[]>}            findByRole
 */

const USER_STATUSES = /** @type {const} */ (['active', 'inactive', 'suspended', 'pending_verification']);
const USER_ROLES    = /** @type {const} */ (['user', 'admin', 'moderator', 'superadmin']);

module.exports = { USER_STATUSES, USER_ROLES };
