'use strict';

/**
 * Content Management Service — Business logic for content lifecycle
 *
 * Covers: create, update, delete, publish/unpublish, scheduling.
 */

const { CONTENT_EVENTS, createContentEvent } = require('./content-events');

/**
 * @param {import('./content-types').ContentDbAdapter} db
 * @param {Object} [opts]
 * @param {function(Object): void} [opts.emit]
 * @returns {Object}
 */
function createContentService(db, opts = {}) {
  const emit = opts.emit || (() => {});

  return {

    async createContent(input) {
      if (!input.title)    throw Object.assign(new Error('title is required'),    { code: 'VALIDATION_ERROR' });
      if (!input.authorId) throw Object.assign(new Error('authorId is required'), { code: 'VALIDATION_ERROR' });
      if (!input.body)     throw Object.assign(new Error('body is required'),     { code: 'VALIDATION_ERROR' });

      const slug = input.slug || _slugify(input.title);
      const existing = await db.findBySlug(slug);
      if (existing) {
        throw Object.assign(new Error('A content item with this slug already exists'), { code: 'SLUG_TAKEN' });
      }

      const now = new Date();
      const item = await db.create({
        title:       input.title,
        slug,
        type:        input.type || 'article',
        status:      'draft',
        body:        input.body,
        excerpt:     input.excerpt || _generateExcerpt(input.body),
        authorId:    input.authorId,
        tags:        input.tags || [],
        metadata:    input.metadata || null,
        publishedAt: null,
        scheduledAt: input.scheduledAt || null,
        createdAt:   now,
        updatedAt:   now,
      });

      emit(createContentEvent(CONTENT_EVENTS.CREATED, item));
      return item;
    },

    async getContent(id) {
      return db.findById(id);
    },

    async getContentBySlug(slug) {
      return db.findBySlug(slug);
    },

    async listContent(filter = {}) {
      return db.query(filter);
    },

    async updateContent(id, input) {
      const item = await db.findById(id);
      if (!item) throw Object.assign(new Error('Content not found'), { code: 'NOT_FOUND' });
      if (item.status === 'archived') {
        throw Object.assign(new Error('Cannot update archived content'), { code: 'ARCHIVED' });
      }

      const updates = { ...input, updatedAt: new Date() };
      if (input.title && !input.slug) updates.slug = _slugify(input.title);

      const updated = await db.update(id, updates);
      emit(createContentEvent(CONTENT_EVENTS.UPDATED, updated));
      return updated;
    },

    async publish(id) {
      const item = await db.findById(id);
      if (!item) throw Object.assign(new Error('Content not found'), { code: 'NOT_FOUND' });
      if (item.status === 'published') return item;

      const now     = new Date();
      const updated = await db.update(id, { status: 'published', publishedAt: now, updatedAt: now });
      emit(createContentEvent(CONTENT_EVENTS.PUBLISHED, updated));
      return updated;
    },

    async unpublish(id) {
      const item = await db.findById(id);
      if (!item) throw Object.assign(new Error('Content not found'), { code: 'NOT_FOUND' });

      const updated = await db.update(id, { status: 'draft', updatedAt: new Date() });
      emit(createContentEvent(CONTENT_EVENTS.UNPUBLISHED, updated));
      return updated;
    },

    async archive(id) {
      const item = await db.findById(id);
      if (!item) throw Object.assign(new Error('Content not found'), { code: 'NOT_FOUND' });

      const updated = await db.update(id, { status: 'archived', updatedAt: new Date() });
      emit(createContentEvent(CONTENT_EVENTS.ARCHIVED, updated));
      return updated;
    },

    async deleteContent(id) {
      const item = await db.findById(id);
      if (!item) throw Object.assign(new Error('Content not found'), { code: 'NOT_FOUND' });

      await db.delete(id);
      emit(createContentEvent(CONTENT_EVENTS.DELETED, item));
      return true;
    },

    async schedulePublish(id, publishAt) {
      if (!publishAt || !(publishAt instanceof Date) || publishAt <= new Date()) {
        throw Object.assign(new Error('scheduledAt must be a future date'), { code: 'VALIDATION_ERROR' });
      }
      const item = await db.findById(id);
      if (!item) throw Object.assign(new Error('Content not found'), { code: 'NOT_FOUND' });

      const updated = await db.update(id, { status: 'scheduled', scheduledAt: publishAt, updatedAt: new Date() });
      emit(createContentEvent(CONTENT_EVENTS.SCHEDULED, updated, { scheduledAt: publishAt }));
      return updated;
    },
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function _generateExcerpt(body, maxLength = 160) {
  const plain = body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > maxLength ? plain.slice(0, maxLength - 3) + '...' : plain;
}

module.exports = { createContentService };
