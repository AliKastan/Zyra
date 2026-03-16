'use strict';

const CONTENT_EVENTS = {
  CREATED:    'content.created',
  UPDATED:    'content.updated',
  PUBLISHED:  'content.published',
  UNPUBLISHED:'content.unpublished',
  ARCHIVED:   'content.archived',
  DELETED:    'content.deleted',
  SCHEDULED:  'content.scheduled',
};

function createContentEvent(eventName, item, extra = {}) {
  return {
    event:     eventName,
    contentId: item.id,
    authorId:  item.authorId,
    timestamp: new Date(),
    data:      { title: item.title, type: item.type, status: item.status, slug: item.slug, ...extra },
  };
}

module.exports = { CONTENT_EVENTS, createContentEvent };
