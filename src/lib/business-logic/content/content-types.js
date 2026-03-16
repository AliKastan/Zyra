'use strict';

/**
 * Content Management Module — Type Definitions
 *
 * @typedef {'draft'|'published'|'archived'|'scheduled'} ContentStatus
 * @typedef {'article'|'page'|'post'|'product'|'media'|'custom'} ContentType
 *
 * @typedef {Object} ContentItem
 * @property {string}        id
 * @property {string}        title
 * @property {string}        slug
 * @property {ContentType}   type
 * @property {ContentStatus} status
 * @property {string}        body
 * @property {string|null}   excerpt
 * @property {string}        authorId
 * @property {string[]}      tags
 * @property {Object|null}   metadata
 * @property {Date|null}     publishedAt
 * @property {Date|null}     scheduledAt
 * @property {Date}          createdAt
 * @property {Date}          updatedAt
 *
 * @typedef {Object} CreateContentInput
 * @property {string}        title
 * @property {ContentType}   type
 * @property {string}        body
 * @property {string}        authorId
 * @property {string}        [slug]
 * @property {string}        [excerpt]
 * @property {string[]}      [tags]
 * @property {Object}        [metadata]
 * @property {Date}          [scheduledAt]
 *
 * @typedef {Object} UpdateContentInput
 * @property {string}        [title]
 * @property {string}        [slug]
 * @property {string}        [body]
 * @property {string}        [excerpt]
 * @property {string[]}      [tags]
 * @property {Object}        [metadata]
 * @property {Date}          [scheduledAt]
 *
 * @typedef {Object} ContentDbAdapter
 * @property {function(string): Promise<ContentItem|null>}                    findById
 * @property {function(string): Promise<ContentItem|null>}                    findBySlug
 * @property {function(Object): Promise<ContentItem[]>}                       query
 * @property {function(Partial<ContentItem>): Promise<ContentItem>}           create
 * @property {function(string, Partial<ContentItem>): Promise<ContentItem>}   update
 * @property {function(string): Promise<boolean>}                             delete
 */

const CONTENT_STATUSES = /** @type {const} */ (['draft', 'published', 'archived', 'scheduled']);
const CONTENT_TYPES    = /** @type {const} */ (['article', 'page', 'post', 'product', 'media', 'custom']);

module.exports = { CONTENT_STATUSES, CONTENT_TYPES };
