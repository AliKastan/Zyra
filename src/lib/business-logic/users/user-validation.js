'use strict';

/**
 * User Validation — Pure validation functions (no DB, no side effects)
 */

const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const { USER_ROLES, USER_STATUSES } = require('./user-types');

/**
 * @param {import('./user-types').CreateUserInput} input
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCreateUser(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { valid: false, errors: ['Input is required'] };

  if (!input.email || !EMAIL_RE.test(input.email)) {
    errors.push('Valid email is required');
  }
  if (!input.password || input.password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (input.password && /^\s|\s$/.test(input.password)) {
    errors.push('Password must not have leading or trailing whitespace');
  }
  if (input.displayName !== undefined && typeof input.displayName !== 'string') {
    errors.push('displayName must be a string');
  }
  if (input.role !== undefined && !USER_ROLES.includes(input.role)) {
    errors.push(`role must be one of: ${USER_ROLES.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * @param {import('./user-types').UpdateUserInput} input
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateUpdateUser(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { valid: false, errors: ['Input is required'] };

  if (input.email !== undefined && !EMAIL_RE.test(input.email)) {
    errors.push('Valid email is required');
  }
  if (input.role !== undefined && !USER_ROLES.includes(input.role)) {
    errors.push(`role must be one of: ${USER_ROLES.join(', ')}`);
  }
  if (input.status !== undefined && !USER_STATUSES.includes(input.status)) {
    errors.push(`status must be one of: ${USER_STATUSES.join(', ')}`);
  }
  if (input.displayName !== undefined && typeof input.displayName !== 'string') {
    errors.push('displayName must be a string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * @param {string} password
 * @param {string} [confirmPassword]
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePassword(password, confirmPassword) {
  const errors = [];
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters');
  if (password && !/[A-Z]/.test(password))    errors.push('Password must contain at least one uppercase letter');
  if (password && !/[0-9]/.test(password))    errors.push('Password must contain at least one number');
  if (confirmPassword !== undefined && password !== confirmPassword) {
    errors.push('Passwords do not match');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize a user object for safe public output (strip sensitive fields).
 * @param {import('./user-types').User} user
 * @returns {Object}
 */
function sanitizeUser(user) {
  const { passwordHash, emailVerificationToken, passwordResetToken, passwordResetExpiry, ...safe } = user;
  return safe;
}

module.exports = { validateCreateUser, validateUpdateUser, validatePassword, sanitizeUser };
