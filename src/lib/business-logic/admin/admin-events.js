'use strict';

const ADMIN_EVENTS = {
  USER_MODERATED:    'admin.user_moderated',
  CONTENT_MODERATED: 'admin.content_moderated',
  LOG_WRITTEN:       'admin.log_written',
  ACTION_LOGGED:     'admin.action_logged',
};

function createAdminEvent(eventName, adminId, data = {}) {
  return {
    event:     eventName,
    adminId,
    timestamp: new Date(),
    data,
  };
}

module.exports = { ADMIN_EVENTS, createAdminEvent };
