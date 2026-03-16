'use strict';

const NOTIFICATION_EVENTS = {
  SENT:     'notification.sent',
  READ:     'notification.read',
  ALL_READ: 'notification.all_read',
  DISMISSED:'notification.dismissed',
};

function createNotificationEvent(eventName, notification, extra = {}) {
  return {
    event:          eventName,
    notificationId: notification.id,
    userId:         notification.userId,
    timestamp:      new Date(),
    data:           { type: notification.type, channels: notification.channels, ...extra },
  };
}

module.exports = { NOTIFICATION_EVENTS, createNotificationEvent };
