'use strict';

/**
 * Admin Tools Service — Business logic for moderation, logs, and admin actions
 *
 * Covers: user/content moderation, system logs, admin action audit trail.
 */

const { ADMIN_EVENTS, createAdminEvent } = require('./admin-events');

/**
 * @param {import('./admin-types').AdminDbAdapter} db
 * @param {Object} [opts]
 * @param {function(Object): void} [opts.emit]
 * @returns {Object}
 */
function createAdminService(db, opts = {}) {
  const emit = opts.emit || (() => {});

  return {

    // ── User moderation ──────────────────────────────────────────────────────

    async moderateUser(adminId, userId, action, reason) {
      if (!adminId) throw Object.assign(new Error('adminId is required'), { code: 'VALIDATION_ERROR' });
      if (!userId)  throw Object.assign(new Error('userId is required'),  { code: 'VALIDATION_ERROR' });
      if (!action)  throw Object.assign(new Error('action is required'),  { code: 'VALIDATION_ERROR' });
      if (!reason)  throw Object.assign(new Error('reason is required'),  { code: 'VALIDATION_ERROR' });

      const user = await db.users.findById(userId);
      if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });

      const prevStatus = user.status;
      let newStatus    = user.status;

      if (action === 'ban' || action === 'suspend') newStatus = 'suspended';
      if (action === 'unsuspend') newStatus = 'active';
      if (action === 'delete') {
        // Soft delete: set status to 'inactive' + record moderation
        newStatus = 'inactive';
      }

      const record = await db.moderation.create({
        adminId,
        targetType: 'user',
        targetId:   userId,
        action,
        reason,
        metadata:  { prevStatus, newStatus },
        createdAt: new Date(),
      });

      if (newStatus !== prevStatus) {
        await db.users.update(userId, { status: newStatus, updatedAt: new Date() });
      }

      await this.logAdminAction(adminId, action, 'user', userId, { prevStatus }, { status: newStatus });
      emit(createAdminEvent(ADMIN_EVENTS.USER_MODERATED, adminId, { userId, action, reason, prevStatus, newStatus }));
      return record;
    },

    // ── Content moderation ───────────────────────────────────────────────────

    async moderateContent(adminId, contentId, action, reason) {
      if (!adminId || !contentId || !action || !reason) {
        throw Object.assign(new Error('adminId, contentId, action, and reason are required'), { code: 'VALIDATION_ERROR' });
      }

      const content = await db.content.findById(contentId);
      if (!content) throw Object.assign(new Error('Content not found'), { code: 'NOT_FOUND' });

      const record = await db.moderation.create({
        adminId,
        targetType: 'content',
        targetId:   contentId,
        action,
        reason,
        metadata:  { prevStatus: content.status },
        createdAt: new Date(),
      });

      if (action === 'delete' || action === 'ban') {
        await db.content.update(contentId, { status: 'archived', updatedAt: new Date() });
      }

      await this.logAdminAction(adminId, action, 'content', contentId, { status: content.status }, { action });
      emit(createAdminEvent(ADMIN_EVENTS.CONTENT_MODERATED, adminId, { contentId, action, reason }));
      return record;
    },

    // ── Moderation history ───────────────────────────────────────────────────

    async getModerationHistory(filter = {}) {
      return db.moderation.query(filter);
    },

    async getModerationRecord(id) {
      return db.moderation.findById(id);
    },

    // ── System logs ──────────────────────────────────────────────────────────

    async writeLog(level, message, source, context = {}) {
      return db.logs.create({
        level,
        message,
        source,
        userId:    context.userId || null,
        context:   context,
        createdAt: new Date(),
      });
    },

    async getLogs(filter = {}) {
      return db.logs.query(filter);
    },

    // ── Admin action audit trail ─────────────────────────────────────────────

    async logAdminAction(adminId, action, targetType, targetId, before, after) {
      return db.actions.create({
        adminId,
        action,
        targetType,
        targetId,
        before:    before || null,
        after:     after  || null,
        ipAddress: 'server',
        createdAt: new Date(),
      });
    },

    async getAdminActions(filter = {}) {
      return db.actions.query(filter);
    },

    // ── Dashboard stats ──────────────────────────────────────────────────────

    async getSystemStats() {
      // Implementations should override with real DB queries
      return {
        totalModerations: 0,
        recentLogs:       [],
        recentActions:    [],
      };
    },
  };
}

module.exports = { createAdminService };
