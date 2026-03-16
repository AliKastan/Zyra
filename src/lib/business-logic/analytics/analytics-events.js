'use strict';

const ANALYTICS_SYSTEM_EVENTS = {
  TRACKED:       'analytics.tracked',
  METRIC_RECORDED: 'analytics.metric_recorded',
  ACTIVITY_LOGGED: 'analytics.activity_logged',
};

function createAnalyticsSystemEvent(eventName, data = {}) {
  return { event: eventName, timestamp: new Date(), data };
}

module.exports = { ANALYTICS_SYSTEM_EVENTS, createAnalyticsSystemEvent };
