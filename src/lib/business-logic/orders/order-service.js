'use strict';

/**
 * Orders Service — Business logic for order and payment lifecycle
 *
 * Covers: creation, status transitions, payment confirmation, refunds.
 */

const { ORDER_STATUSES } = require('./order-types');
const { ORDER_EVENTS, createOrderEvent } = require('./order-events');

/**
 * @param {import('./order-types').OrderDbAdapter} db
 * @param {Object} [opts]
 * @param {function(Object): void} [opts.emit]
 * @returns {Object}
 */
function createOrderService(db, opts = {}) {
  const emit = opts.emit || (() => {});

  return {

    async createOrder(input) {
      if (!input.userId)  throw Object.assign(new Error('userId is required'), { code: 'VALIDATION_ERROR' });
      if (!input.items || input.items.length === 0) {
        throw Object.assign(new Error('Order must contain at least one item'), { code: 'VALIDATION_ERROR' });
      }
      for (const item of input.items) {
        if (!item.productId || !item.quantity || item.quantity < 1) {
          throw Object.assign(new Error('Each item needs productId and quantity >= 1'), { code: 'VALIDATION_ERROR' });
        }
        item.totalPrice = (item.unitPrice || 0) * item.quantity;
      }

      const subtotal = input.items.reduce((s, i) => s + i.totalPrice, 0);
      const tax      = _computeTax(subtotal);
      const shipping = input.shippingAddress ? _computeShipping(subtotal) : 0;
      const now      = new Date();

      const order = await db.create({
        userId:            input.userId,
        items:             input.items,
        status:            'pending',
        paymentStatus:     'pending',
        subtotal,
        tax,
        shipping,
        total:             subtotal + tax + shipping,
        currency:          input.currency || 'usd',
        externalPaymentId: null,
        refundId:          null,
        refundAmount:      null,
        shippingAddress:   input.shippingAddress || null,
        notes:             input.notes || null,
        createdAt:         now,
        updatedAt:         now,
      });

      emit(createOrderEvent(ORDER_EVENTS.CREATED, order));
      return order;
    },

    async getOrder(id) {
      return db.findById(id);
    },

    async getUserOrders(userId) {
      return db.findByUserId(userId);
    },

    async updateStatus(orderId, newStatus) {
      if (!ORDER_STATUSES.includes(newStatus)) {
        throw Object.assign(new Error(`Invalid status: ${newStatus}`), { code: 'VALIDATION_ERROR' });
      }
      const order = await db.findById(orderId);
      if (!order) throw Object.assign(new Error('Order not found'), { code: 'NOT_FOUND' });

      _assertTransitionAllowed(order.status, newStatus);

      const updated = await db.update(orderId, { status: newStatus, updatedAt: new Date() });
      emit(createOrderEvent(ORDER_EVENTS.STATUS_UPDATED, updated, { prevStatus: order.status }));
      return updated;
    },

    async confirmPayment(orderId, externalPaymentId) {
      const order = await db.findById(orderId);
      if (!order) throw Object.assign(new Error('Order not found'), { code: 'NOT_FOUND' });

      const updated = await db.update(orderId, {
        status:            'confirmed',
        paymentStatus:     'paid',
        externalPaymentId: externalPaymentId || null,
        updatedAt:         new Date(),
      });
      emit(createOrderEvent(ORDER_EVENTS.PAYMENT_CONFIRMED, updated));
      return updated;
    },

    async refundOrder(orderId, refundAmount) {
      const order = await db.findById(orderId);
      if (!order) throw Object.assign(new Error('Order not found'), { code: 'NOT_FOUND' });
      if (order.paymentStatus !== 'paid') {
        throw Object.assign(new Error('Order has not been paid'), { code: 'NOT_PAID' });
      }

      const amount        = refundAmount != null ? refundAmount : order.total;
      const isPartial     = amount < order.total;
      const paymentStatus = isPartial ? 'partially_refunded' : 'refunded';

      const updated = await db.update(orderId, {
        status:        isPartial ? order.status : 'refunded',
        paymentStatus,
        refundAmount:  amount,
        updatedAt:     new Date(),
      });
      emit(createOrderEvent(ORDER_EVENTS.REFUNDED, updated, { refundAmount: amount, isPartial }));
      return updated;
    },

    async cancelOrder(orderId, reason) {
      const order = await db.findById(orderId);
      if (!order) throw Object.assign(new Error('Order not found'), { code: 'NOT_FOUND' });
      if (['delivered', 'refunded', 'cancelled'].includes(order.status)) {
        throw Object.assign(new Error(`Cannot cancel order in status: ${order.status}`), { code: 'INVALID_STATUS' });
      }

      const updated = await db.update(orderId, {
        status:    'cancelled',
        notes:     reason ? `Cancelled: ${reason}` : order.notes,
        updatedAt: new Date(),
      });
      emit(createOrderEvent(ORDER_EVENTS.CANCELLED, updated, { reason }));
      return updated;
    },
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS = {
  pending:    ['confirmed', 'cancelled'],
  confirmed:  ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped:    ['delivered'],
  delivered:  ['refunded'],
  cancelled:  [],
  refunded:   [],
};

function _assertTransitionAllowed(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw Object.assign(
      new Error(`Cannot transition order from "${from}" to "${to}"`),
      { code: 'INVALID_TRANSITION' },
    );
  }
}

function _computeTax(subtotal) {
  return Math.round(subtotal * 0.10 * 100) / 100; // 10% tax placeholder
}

function _computeShipping(subtotal) {
  if (subtotal >= 100) return 0; // free shipping over $100
  return 9.99;
}

module.exports = { createOrderService };
