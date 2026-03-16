'use strict';

/**
 * Orders Module — Type Definitions
 *
 * @typedef {'pending'|'confirmed'|'processing'|'shipped'|'delivered'|'cancelled'|'refunded'} OrderStatus
 * @typedef {'pending'|'paid'|'failed'|'refunded'|'partially_refunded'} PaymentStatus
 *
 * @typedef {Object} OrderItem
 * @property {string} productId
 * @property {string} productName
 * @property {number} quantity
 * @property {number} unitPrice
 * @property {number} totalPrice
 * @property {Object} [metadata]
 *
 * @typedef {Object} Order
 * @property {string}        id
 * @property {string}        userId
 * @property {OrderItem[]}   items
 * @property {OrderStatus}   status
 * @property {PaymentStatus} paymentStatus
 * @property {number}        subtotal
 * @property {number}        tax
 * @property {number}        shipping
 * @property {number}        total
 * @property {string}        currency
 * @property {string|null}   externalPaymentId
 * @property {string|null}   refundId
 * @property {number|null}   refundAmount
 * @property {Object|null}   shippingAddress
 * @property {string|null}   notes
 * @property {Date}          createdAt
 * @property {Date}          updatedAt
 *
 * @typedef {Object} CreateOrderInput
 * @property {string}      userId
 * @property {OrderItem[]} items
 * @property {Object}      [shippingAddress]
 * @property {string}      [currency]
 * @property {string}      [notes]
 *
 * @typedef {Object} OrderDbAdapter
 * @property {function(string): Promise<Order|null>}              findById
 * @property {function(string): Promise<Order[]>}                 findByUserId
 * @property {function(Partial<Order>): Promise<Order>}           create
 * @property {function(string, Partial<Order>): Promise<Order>}   update
 * @property {function(Object): Promise<Order[]>}                 query
 */

const ORDER_STATUSES   = /** @type {const} */ (['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']);
const PAYMENT_STATUSES = /** @type {const} */ (['pending', 'paid', 'failed', 'refunded', 'partially_refunded']);

module.exports = { ORDER_STATUSES, PAYMENT_STATUSES };
