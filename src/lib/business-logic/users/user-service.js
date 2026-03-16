'use strict';

/**
 * User Service — Business logic for user management
 *
 * Uses repository pattern: inject a `db` adapter so the service works with any database.
 * All methods are async; the db adapter must implement UserDbAdapter interface.
 *
 * @example
 * const { createUserService } = require('./user-service');
 * const userService = createUserService(myDbAdapter);
 * const user = await userService.createUser({ email: 'a@b.com', password: 'secret123' });
 */

const crypto = require('crypto');
const { validateCreateUser, validateUpdateUser, sanitizeUser } = require('./user-validation');
const { USER_EVENTS, createUserEvent } = require('./user-events');

// ── Service Factory ───────────────────────────────────────────────────────────

/**
 * Create a user service bound to a DB adapter.
 *
 * @param {import('./user-types').UserDbAdapter} db
 * @param {Object} [opts]
 * @param {function(Object): void} [opts.emit]    - Optional event emitter
 * @param {function(string): Promise<string>} [opts.hashPassword]   - Override hash fn
 * @param {function(string, string): Promise<boolean>} [opts.verifyPassword] - Override verify fn
 * @returns {Object}
 */
function createUserService(db, opts = {}) {
  const emit         = opts.emit         || (() => {});
  const hashPassword = opts.hashPassword || _defaultHash;
  const verifyHash   = opts.verifyPassword || _defaultVerify;

  return {

    // ── Create ──────────────────────────────────────────────────────────────

    async createUser(input) {
      const validation = validateCreateUser(input);
      if (!validation.valid) {
        const err = new Error(`Validation failed: ${validation.errors.join(', ')}`);
        err.code  = 'VALIDATION_ERROR';
        err.errors = validation.errors;
        throw err;
      }

      const existing = await db.findByEmail(input.email.toLowerCase().trim());
      if (existing) {
        const err = new Error('A user with this email already exists');
        err.code  = 'EMAIL_TAKEN';
        throw err;
      }

      const passwordHash            = await hashPassword(input.password);
      const emailVerificationToken  = _generateToken();
      const now                     = new Date();

      const user = await db.create({
        email:                  input.email.toLowerCase().trim(),
        passwordHash,
        displayName:            input.displayName || input.email.split('@')[0],
        role:                   input.role || 'user',
        status:                 'pending_verification',
        emailVerified:          false,
        emailVerificationToken,
        passwordResetToken:     null,
        passwordResetExpiry:    null,
        profile:                null,
        lastLoginAt:            null,
        createdAt:              now,
        updatedAt:              now,
      });

      emit(createUserEvent(USER_EVENTS.CREATED, user, { verificationToken: emailVerificationToken }));
      return sanitizeUser(user);
    },

    // ── Read ────────────────────────────────────────────────────────────────

    async getUserById(id) {
      const user = await db.findById(id);
      return user ? sanitizeUser(user) : null;
    },

    async getUserByEmail(email) {
      const user = await db.findByEmail(email.toLowerCase().trim());
      return user ? sanitizeUser(user) : null;
    },

    async getUsersByRole(role) {
      const users = await db.findByRole(role);
      return users.map(sanitizeUser);
    },

    // ── Update ──────────────────────────────────────────────────────────────

    async updateUser(id, input) {
      const validation = validateUpdateUser(input);
      if (!validation.valid) {
        const err = new Error(`Validation failed: ${validation.errors.join(', ')}`);
        err.code  = 'VALIDATION_ERROR';
        err.errors = validation.errors;
        throw err;
      }

      const existing = await db.findById(id);
      if (!existing) {
        const err = new Error('User not found');
        err.code  = 'NOT_FOUND';
        throw err;
      }

      const updates = { ...input, updatedAt: new Date() };
      if (input.email) updates.email = input.email.toLowerCase().trim();

      const updated = await db.update(id, updates);
      emit(createUserEvent(USER_EVENTS.UPDATED, updated));
      return sanitizeUser(updated);
    },

    // ── Delete ──────────────────────────────────────────────────────────────

    async deleteUser(id) {
      const existing = await db.findById(id);
      if (!existing) {
        const err = new Error('User not found');
        err.code  = 'NOT_FOUND';
        throw err;
      }
      await db.delete(id);
      emit(createUserEvent(USER_EVENTS.DELETED, existing));
      return true;
    },

    // ── Email verification ───────────────────────────────────────────────────

    async initiateEmailVerification(userId) {
      const user  = await db.findById(userId);
      if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
      if (user.emailVerified) return true; // already verified

      const token   = _generateToken();
      await db.update(userId, { emailVerificationToken: token, updatedAt: new Date() });
      emit(createUserEvent(USER_EVENTS.VERIFICATION_SENT, user, { token }));
      return true;
    },

    async verifyEmail(token) {
      const user = await db.findByToken(token);
      if (!user) throw Object.assign(new Error('Invalid or expired verification token'), { code: 'INVALID_TOKEN' });
      if (user.emailVerified) return sanitizeUser(user);

      const updated = await db.update(user.id, {
        emailVerified:          true,
        emailVerificationToken: null,
        status:                 'active',
        updatedAt:              new Date(),
      });
      emit(createUserEvent(USER_EVENTS.EMAIL_VERIFIED, updated));
      return sanitizeUser(updated);
    },

    // ── Password reset ───────────────────────────────────────────────────────

    async requestPasswordReset(email) {
      const user = await db.findByEmail(email.toLowerCase().trim());
      if (!user) return true; // don't reveal if email exists

      const token  = _generateToken();
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.update(user.id, { passwordResetToken: token, passwordResetExpiry: expiry, updatedAt: new Date() });
      emit(createUserEvent(USER_EVENTS.PASSWORD_RESET_REQUESTED, user, { token, expiry }));
      return true;
    },

    async resetPassword(token, newPassword) {
      const user = await db.findByToken(token);
      if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
        throw Object.assign(new Error('Invalid or expired password reset token'), { code: 'INVALID_TOKEN' });
      }
      const passwordHash = await hashPassword(newPassword);
      const updated = await db.update(user.id, {
        passwordHash,
        passwordResetToken:  null,
        passwordResetExpiry: null,
        updatedAt:           new Date(),
      });
      emit(createUserEvent(USER_EVENTS.PASSWORD_RESET, updated));
      return true;
    },

    // ── Role management ──────────────────────────────────────────────────────

    async assignRole(userId, role) {
      const user = await db.findById(userId);
      if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });

      const prevRole = user.role;
      const updated  = await db.update(userId, { role, updatedAt: new Date() });
      emit(createUserEvent(USER_EVENTS.ROLE_CHANGED, updated, { prevRole, newRole: role }));
      return sanitizeUser(updated);
    },

    // ── Authentication helper (verify password) ──────────────────────────────

    async verifyCredentials(email, password) {
      const user = await db.findByEmail(email.toLowerCase().trim());
      if (!user) return null;
      const ok = await verifyHash(password, user.passwordHash);
      if (!ok) return null;
      await db.update(user.id, { lastLoginAt: new Date() });
      emit(createUserEvent(USER_EVENTS.LOGIN, user));
      return sanitizeUser(user);
    },
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Default hash/verify uses a simple hex-based mock (replace with bcrypt in production)
async function _defaultHash(password) {
  // In generated apps, replace with: const bcrypt = require('bcryptjs'); return bcrypt.hash(password, 12);
  return 'hashed:' + crypto.createHash('sha256').update(password).digest('hex');
}

async function _defaultVerify(password, hash) {
  const expected = 'hashed:' + crypto.createHash('sha256').update(password).digest('hex');
  return expected === hash;
}

module.exports = { createUserService };
