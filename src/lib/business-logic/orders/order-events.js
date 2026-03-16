'use strict';

const ORDER_EVENTS = {
  CREATED:           'order.created',
  STATUS_UPDATED:    'order.status_updated',
  PAYMENT_CONFIRMED: 'order.payment_confirmed',
  PAYMENT_FAILED:    'order.payment_failed',
  REFUNDED:          'order.refunded',
  CANCELLED:         'order.cancelled',
  SHIPPED:           'order.shipped',
  DELIVERED:         'order.delivered',
};

/**
 * @param {string} eventName
 * @param {import('./order-types').Order} order
 * @param {Object} [extra]
 */
function createOrderEvent(eventName, order, extra = {}) {
  return {
    event:     eventName,
    orderId:   order.id,
    userId:    order.userId,
    timestamp: new Date(),
    data:      { status: order.status, paymentStatus: order.paymentStatus, total: order.total, currency: order.currency, ...extra },
  };
}

module.exports = { ORDER_EVENTS, createOrderEvent };
