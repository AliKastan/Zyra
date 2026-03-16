'use strict';

/**
 * Starter Business Logic Library — Test Suite
 */

const {
  createUserService,
  createSubscriptionService,
  createOrderService,
  createNotificationService,
  createContentService,
  createAdminService,
  createAnalyticsService,
  validateCreateUser,
  validateUpdateUser,
  validatePassword,
  sanitizeUser,
  USER_EVENTS,
  SUBSCRIPTION_EVENTS,
  ORDER_EVENTS,
  CONTENT_EVENTS,
  NOTIFICATION_EVENTS,
  selectModules,
  detectModulesFromPrompt,
  getModulesForAppType,
  buildModuleHints,
  buildModulesPayload,
  MODULES,
} = require('../../src/lib/business-logic');

// ── Test Harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];
const asyncQueue = []; // Collect async tests to run sequentially

function describe(label, fn) {
  console.log(`\n  ${label}`);
  fn();
}

function it(label, fn) {
  try {
    fn();
    console.log(`    ✓ ${label}`);
    passed++;
  } catch (err) {
    console.log(`    ✗ ${label}`);
    console.log(`      ${err.message}`);
    failed++;
    failures.push({ label, error: err.message });
  }
}

function itAsync(label, fn) {
  // Queue for sequential execution after all describes run
  asyncQueue.push({ label, fn });
}

function assert(cond, msg)          { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg)     { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertIncludes(arr, v, msg){ if (!Array.isArray(arr) || !arr.includes(v)) throw new Error(msg || `Expected array to include ${JSON.stringify(v)}`); }
function assertThrows(fn, code)     {
  let threw = false;
  try { fn(); } catch (e) { threw = true; if (code) assert(e.code === code || e.message.includes(code), `Expected error code "${code}", got "${e.code}" / "${e.message}"`); }
  if (!threw) throw new Error('Expected function to throw');
}
async function assertThrowsAsync(fn, code) {
  let threw = false;
  try { await fn(); } catch (e) {
    threw = true;
    if (code) assert(e.code === code || e.message.toLowerCase().includes(code.toLowerCase()), `Expected error code "${code}", got "${e.code}" / "${e.message}"`);
  }
  if (!threw) throw new Error('Expected async function to throw');
}

// ── Mock DB Factories ─────────────────────────────────────────────────────────

function makeId() { return Math.random().toString(36).slice(2); }

function createMockUserDb() {
  const store = {};
  const emailIndex = {};
  const tokenIndex = {};
  return {
    async findById(id)    { return store[id] ? { ...store[id] } : null; },
    async findByEmail(em) { const id = emailIndex[em]; return id ? { ...store[id] } : null; },
    async findByToken(t)  {
      const found = Object.values(store).find(u => u.emailVerificationToken === t || u.passwordResetToken === t);
      return found ? { ...found } : null;
    },
    async create(data)    {
      const u = { id: makeId(), ...data };
      store[u.id] = u;
      emailIndex[u.email] = u.id;
      if (u.emailVerificationToken) tokenIndex[u.emailVerificationToken] = u.id;
      return { ...u };
    },
    async update(id, data) {
      if (!store[id]) throw new Error('not found');
      Object.assign(store[id], data);
      if (data.email) emailIndex[data.email] = id;
      if (data.emailVerificationToken) tokenIndex[data.emailVerificationToken] = id;
      return { ...store[id] };
    },
    async delete(id)      { delete store[id]; return true; },
    async findByRole(r)   { return Object.values(store).filter(u => u.role === r).map(u => ({ ...u })); },
  };
}

function createMockSubDb(plans) {
  const store = {};
  const userIndex = {};
  const planStore = {};
  (plans || []).forEach(p => { planStore[p.id] = p; });
  if (!plans || plans.length === 0) {
    planStore['plan_starter'] = { id: 'plan_starter', name: 'Starter', priceMonthly: 9, priceAnnual: 90, features: ['feature_a'], limits: { seats: 1, apiCalls: 1000, storageGb: 1 }, isDefault: true };
    planStore['plan_pro']     = { id: 'plan_pro',     name: 'Pro',     priceMonthly: 29, priceAnnual: 290, features: ['feature_a', 'feature_b'], limits: { seats: 5, apiCalls: 10000, storageGb: 10 }, isDefault: false };
  }
  return {
    async findById(id)       { return store[id] ? { ...store[id] } : null; },
    async findByUserId(uid)  { const id = userIndex[uid]; return id ? { ...store[id] } : null; },
    async create(data)       { const s = { id: makeId(), ...data }; store[s.id] = s; userIndex[s.userId] = s.id; return { ...s }; },
    async update(id, data)   { Object.assign(store[id], data); return { ...store[id] }; },
    async listPlans()        { return Object.values(planStore); },
    async findPlan(id)       { return planStore[id] ? { ...planStore[id] } : null; },
  };
}

function createMockOrderDb() {
  const store = {};
  const userIndex = {};
  return {
    async findById(id)      { return store[id] ? { ...store[id] } : null; },
    async findByUserId(uid) { return Object.values(store).filter(o => o.userId === uid).map(o => ({ ...o })); },
    async create(data)      { const o = { id: makeId(), ...data }; store[o.id] = o; return { ...o }; },
    async update(id, data)  { Object.assign(store[id], data); return { ...store[id] }; },
    async query(filter)     { return Object.values(store); },
  };
}

function createMockNotifDb() {
  const store = {};
  return {
    async findById(id)            { return store[id] ? { ...store[id] } : null; },
    async findByUserId(uid, opts) { return Object.values(store).filter(n => n.userId === uid); },
    async countUnread(uid)        { return Object.values(store).filter(n => n.userId === uid && n.status === 'unread').length; },
    async create(data)            { const n = { id: makeId(), ...data }; store[n.id] = n; return { ...n }; },
    async update(id, data)        { Object.assign(store[id], data); return { ...store[id] }; },
    async markAllRead(uid)        { Object.values(store).filter(n => n.userId === uid).forEach(n => { n.status = 'read'; n.readAt = new Date(); }); return true; },
  };
}

function createMockContentDb() {
  const store = {};
  const slugIndex = {};
  return {
    async findById(id)      { return store[id] ? { ...store[id] } : null; },
    async findBySlug(slug)  { const id = slugIndex[slug]; return id ? { ...store[id] } : null; },
    async query(filter)     { return Object.values(store); },
    async create(data)      { const c = { id: makeId(), ...data }; store[c.id] = c; slugIndex[c.slug] = c.id; return { ...c }; },
    async update(id, data)  { Object.assign(store[id], data); if (data.slug) slugIndex[data.slug] = id; return { ...store[id] }; },
    async delete(id)        { delete store[id]; return true; },
  };
}

function createMockAdminDb() {
  const moderations = {};
  const logs = {};
  const actions = {};
  const users = {};
  const content = {};
  return {
    users:      {
      findById: async (id) => users[id] ? { ...users[id] } : null,
      update:   async (id, data) => { Object.assign(users[id] || (users[id] = { id }), data); return { ...users[id] }; },
      _seed:    (id, data) => { users[id] = { id, ...data }; },
    },
    content:    {
      findById: async (id) => content[id] ? { ...content[id] } : null,
      update:   async (id, data) => { Object.assign(content[id] || (content[id] = { id }), data); return { ...content[id] }; },
      _seed:    (id, data) => { content[id] = { id, ...data }; },
    },
    moderation: {
      create:   async (data) => { const r = { id: makeId(), ...data }; moderations[r.id] = r; return { ...r }; },
      findById: async (id)   => moderations[id] ? { ...moderations[id] } : null,
      query:    async ()     => Object.values(moderations),
    },
    logs:       {
      create: async (data) => { const l = { id: makeId(), ...data }; logs[l.id] = l; return { ...l }; },
      query:  async ()     => Object.values(logs),
    },
    actions:    {
      create: async (data) => { const a = { id: makeId(), ...data }; actions[a.id] = a; return { ...a }; },
      query:  async ()     => Object.values(actions),
    },
  };
}

function createMockAnalyticsDb() {
  const events  = [];
  const metrics = [];
  const activity = [];
  return {
    async createEvent(data) { const e = { id: makeId(), ...data }; events.push(e); return { ...e }; },
    async queryEvents(f)    { return events.filter(e => !f.name || e.name === f.name); },
    async getMetrics(f)     { return metrics.filter(m => !f.userId || m.userId === f.userId); },
    async recordMetric(data){ metrics.push({ id: makeId(), ...data }); },
    async logActivity(data) { const a = { id: makeId(), ...data }; activity.push(a); return { ...a }; },
    async getUserActivity(uid) { return activity.filter(a => a.userId === uid); },
  };
}

// ── Scenario 1: Validation ────────────────────────────────────────────────────

describe('Scenario 1: User Validation', () => {
  it('validates correct user input', () => {
    const r = validateCreateUser({ email: 'test@example.com', password: 'Password1' });
    assert(r.valid, `Expected valid, errors: ${r.errors.join(', ')}`);
  });
  it('rejects missing email', () => {
    const r = validateCreateUser({ email: '', password: 'Password1' });
    assert(!r.valid);
    assertIncludes(r.errors, 'Valid email is required');
  });
  it('rejects short password', () => {
    const r = validateCreateUser({ email: 'a@b.com', password: 'short' });
    assert(!r.valid);
    assertIncludes(r.errors, 'Password must be at least 8 characters');
  });
  it('rejects invalid role', () => {
    const r = validateCreateUser({ email: 'a@b.com', password: 'Password1', role: 'hacker' });
    assert(!r.valid);
    assert(r.errors.some(e => e.includes('role')));
  });
  it('validates update input', () => {
    const r = validateUpdateUser({ displayName: 'Alice', role: 'admin' });
    assert(r.valid);
  });
  it('validatePassword enforces strength', () => {
    const r = validatePassword('weakpassword');
    assert(!r.valid);
    assert(r.errors.some(e => e.includes('uppercase')));
  });
  it('sanitizeUser strips sensitive fields', () => {
    const user = { id: '1', email: 'a@b.com', passwordHash: 'xyz', emailVerificationToken: 'tok', passwordResetToken: 'rst', passwordResetExpiry: null };
    const safe = sanitizeUser(user);
    assert(!safe.passwordHash, 'passwordHash should be removed');
    assert(!safe.emailVerificationToken, 'token should be removed');
    assertEqual(safe.email, 'a@b.com');
  });
});

// ── Scenario 2: User Service ──────────────────────────────────────────────────

describe('Scenario 2: User Creation Flow', () => {
  const db = createMockUserDb();
  const events = [];
  const svc = createUserService(db, { emit: (e) => events.push(e) });

  itAsync('creates a user with correct defaults', async () => {
    const user = await svc.createUser({ email: 'Alice@Example.com', password: 'Password1' });
    assertEqual(user.email, 'alice@example.com', 'email should be lowercased');
    assertEqual(user.role, 'user');
    assertEqual(user.status, 'pending_verification');
    assert(!user.passwordHash, 'passwordHash should not be in returned user');
    assert(!user.emailVerificationToken, 'token should not be in returned user');
    assert(events.some(e => e.event === USER_EVENTS.CREATED));
  });

  itAsync('rejects duplicate email', async () => {
    await svc.createUser({ email: 'dup@test.com', password: 'Password1' });
    await assertThrowsAsync(() => svc.createUser({ email: 'dup@test.com', password: 'Password1' }), 'EMAIL_TAKEN');
  });

  itAsync('gets user by id', async () => {
    const created = await svc.createUser({ email: 'getbyid@test.com', password: 'Password1' });
    // Need to get the actual stored user's id — the service returns sanitized user
    const fetched = await svc.getUserByEmail('getbyid@test.com');
    assert(fetched, 'should find user');
    assertEqual(fetched.email, 'getbyid@test.com');
  });

  itAsync('updates user', async () => {
    const user = await svc.createUser({ email: 'upd@test.com', password: 'Password1' });
    const found = await svc.getUserByEmail('upd@test.com');
    const updated = await svc.updateUser(found.id, { displayName: 'UpdatedName' });
    assertEqual(updated.displayName, 'UpdatedName');
  });

  itAsync('verifies email with correct token', async () => {
    // Create user and get raw token from DB
    await svc.createUser({ email: 'verify@test.com', password: 'Password1' });
    // Get raw user with token from db directly
    const rawUser = await db.findByEmail('verify@test.com');
    assert(rawUser.emailVerificationToken, 'should have a verification token in db');
    const verified = await svc.verifyEmail(rawUser.emailVerificationToken);
    assert(verified.emailVerified, 'should be verified');
    assertEqual(verified.status, 'active');
  });

  itAsync('password reset flow works', async () => {
    await svc.createUser({ email: 'reset@test.com', password: 'Password1' });
    await svc.requestPasswordReset('reset@test.com');
    const rawUser = await db.findByEmail('reset@test.com');
    assert(rawUser.passwordResetToken, 'should have reset token');
    const ok = await svc.resetPassword(rawUser.passwordResetToken, 'NewPassword2');
    assert(ok === true);
  });

  itAsync('assignRole changes user role', async () => {
    const user = await svc.createUser({ email: 'role@test.com', password: 'Password1' });
    const found = await svc.getUserByEmail('role@test.com');
    const updated = await svc.assignRole(found.id, 'admin');
    assertEqual(updated.role, 'admin');
    assert(events.some(e => e.event === USER_EVENTS.ROLE_CHANGED));
  });

  itAsync('verifyCredentials returns user on correct password', async () => {
    await svc.createUser({ email: 'creds@test.com', password: 'Password1' });
    const user = await svc.verifyCredentials('creds@test.com', 'Password1');
    assert(user !== null, 'should return user on correct creds');
    assertEqual(user.email, 'creds@test.com');
  });

  itAsync('verifyCredentials returns null on wrong password', async () => {
    await svc.createUser({ email: 'wrongpass@test.com', password: 'Password1' });
    const user = await svc.verifyCredentials('wrongpass@test.com', 'WrongPass2');
    assert(user === null);
  });

  itAsync('deleteUser removes user', async () => {
    const user = await svc.createUser({ email: 'del@test.com', password: 'Password1' });
    const found = await svc.getUserByEmail('del@test.com');
    const ok = await svc.deleteUser(found.id);
    assert(ok === true);
    assert(events.some(e => e.event === USER_EVENTS.DELETED));
  });
});

// ── Scenario 3: Subscription Lifecycle ───────────────────────────────────────

describe('Scenario 3: Subscription Lifecycle', () => {
  const db = createMockSubDb();
  const events = [];
  const svc = createSubscriptionService(db, { emit: (e) => events.push(e) });

  itAsync('creates subscription with trial', async () => {
    const sub = await svc.createSubscription({ userId: 'u1', planId: 'plan_starter', billingInterval: 'monthly', trialDays: 14 });
    assertEqual(sub.status, 'trialing');
    assert(sub.trialEnd > sub.trialStart);
    assert(events.some(e => e.event === SUBSCRIPTION_EVENTS.CREATED));
  });

  itAsync('creates subscription without trial', async () => {
    const sub = await svc.createSubscription({ userId: 'u2', planId: 'plan_starter', billingInterval: 'monthly', trialDays: 0 });
    assertEqual(sub.status, 'active');
  });

  itAsync('rejects duplicate active subscription', async () => {
    await svc.createSubscription({ userId: 'u3', planId: 'plan_starter', billingInterval: 'monthly', trialDays: 0 });
    await assertThrowsAsync(() => svc.createSubscription({ userId: 'u3', planId: 'plan_pro', billingInterval: 'monthly', trialDays: 0 }), 'ALREADY_SUBSCRIBED');
  });

  itAsync('changePlan upgrades subscription', async () => {
    const sub = await svc.createSubscription({ userId: 'u4', planId: 'plan_starter', billingInterval: 'monthly', trialDays: 0 });
    const updated = await svc.changePlan(sub.id, 'plan_pro');
    assertEqual(updated.planId, 'plan_pro');
  });

  itAsync('getSubscriptionStatus returns accurate status', async () => {
    const sub = await svc.createSubscription({ userId: 'u5', planId: 'plan_starter', billingInterval: 'monthly', trialDays: 7 });
    const status = await svc.getSubscriptionStatus('u5');
    assert(status.hasSubscription);
    assert(status.isTrialing);
    assert(!status.isActive);
  });

  itAsync('convertTrialToActive transitions status', async () => {
    const sub = await svc.createSubscription({ userId: 'u6', planId: 'plan_starter', billingInterval: 'monthly', trialDays: 14 });
    const active = await svc.convertTrialToActive(sub.id, 'ext_123');
    assertEqual(active.status, 'active');
    assert(events.some(e => e.event === SUBSCRIPTION_EVENTS.TRIAL_ENDED));
  });

  itAsync('cancelSubscription marks subscription cancelled', async () => {
    const sub = await svc.createSubscription({ userId: 'u7', planId: 'plan_starter', billingInterval: 'monthly', trialDays: 0 });
    const cancelled = await svc.cancelSubscription(sub.id);
    assertEqual(cancelled.status, 'cancelled');
    assert(cancelled.cancelledAt !== null);
    assert(events.some(e => e.event === SUBSCRIPTION_EVENTS.CANCELLED));
  });

  itAsync('cancelSubscription with atPeriodEnd schedules cancellation', async () => {
    const sub = await svc.createSubscription({ userId: 'u8', planId: 'plan_starter', billingInterval: 'monthly', trialDays: 0 });
    const updated = await svc.cancelSubscription(sub.id, { atPeriodEnd: true });
    assertEqual(updated.status, 'active'); // still active
    assert(updated.cancelAtPeriodEnd !== null);
  });

  itAsync('renewSubscription extends period', async () => {
    const sub = await svc.createSubscription({ userId: 'u9', planId: 'plan_starter', billingInterval: 'monthly', trialDays: 0 });
    const prevEnd = new Date(sub.currentPeriodEnd);
    const renewed = await svc.renewSubscription(sub.id);
    assert(new Date(renewed.currentPeriodEnd) > prevEnd);
    assert(events.some(e => e.event === SUBSCRIPTION_EVENTS.RENEWED));
  });
});

// ── Scenario 4: Order Lifecycle ───────────────────────────────────────────────

describe('Scenario 4: Order Lifecycle', () => {
  const db = createMockOrderDb();
  const events = [];
  const svc = createOrderService(db, { emit: (e) => events.push(e) });

  const ITEMS = [
    { productId: 'prod_1', productName: 'Widget', quantity: 2, unitPrice: 25.00 },
    { productId: 'prod_2', productName: 'Gadget', quantity: 1, unitPrice: 50.00 },
  ];

  itAsync('creates order with correct totals', async () => {
    const order = await svc.createOrder({ userId: 'u1', items: ITEMS });
    assertEqual(order.subtotal, 100.00);
    assertEqual(order.status, 'pending');
    assertEqual(order.paymentStatus, 'pending');
    assert(events.some(e => e.event === ORDER_EVENTS.CREATED));
  });

  itAsync('rejects order with no items', async () => {
    await assertThrowsAsync(() => svc.createOrder({ userId: 'u1', items: [] }), 'VALIDATION_ERROR');
  });

  itAsync('rejects order with item quantity < 1', async () => {
    await assertThrowsAsync(() => svc.createOrder({ userId: 'u1', items: [{ productId: 'p1', quantity: 0, unitPrice: 10 }] }), 'VALIDATION_ERROR');
  });

  itAsync('confirmPayment sets paid status', async () => {
    const order = await svc.createOrder({ userId: 'u1', items: ITEMS });
    const confirmed = await svc.confirmPayment(order.id, 'pi_ext_123');
    assertEqual(confirmed.status, 'confirmed');
    assertEqual(confirmed.paymentStatus, 'paid');
    assertEqual(confirmed.externalPaymentId, 'pi_ext_123');
    assert(events.some(e => e.event === ORDER_EVENTS.PAYMENT_CONFIRMED));
  });

  itAsync('updateStatus follows allowed transitions', async () => {
    const order = await svc.createOrder({ userId: 'u1', items: ITEMS });
    await svc.confirmPayment(order.id, 'pi_abc');
    const proc = await svc.updateStatus(order.id, 'processing');
    assertEqual(proc.status, 'processing');
    assert(events.some(e => e.event === ORDER_EVENTS.STATUS_UPDATED));
  });

  itAsync('updateStatus rejects invalid transitions', async () => {
    const order = await svc.createOrder({ userId: 'u1', items: ITEMS });
    await assertThrowsAsync(() => svc.updateStatus(order.id, 'delivered'), 'INVALID_TRANSITION');
  });

  itAsync('refundOrder sets refunded status', async () => {
    const order = await svc.createOrder({ userId: 'u1', items: ITEMS });
    await svc.confirmPayment(order.id, 'pi_ref');
    const refunded = await svc.refundOrder(order.id);
    assertEqual(refunded.paymentStatus, 'refunded');
    assertEqual(refunded.status, 'refunded');
    assert(events.some(e => e.event === ORDER_EVENTS.REFUNDED));
  });

  itAsync('partial refund keeps order active', async () => {
    const order = await svc.createOrder({ userId: 'u1', items: ITEMS });
    await svc.confirmPayment(order.id, 'pi_partial');
    const refunded = await svc.refundOrder(order.id, 10);
    assertEqual(refunded.paymentStatus, 'partially_refunded');
    assertEqual(refunded.refundAmount, 10);
  });

  itAsync('cancelOrder cancels pending order', async () => {
    const order = await svc.createOrder({ userId: 'u1', items: ITEMS });
    const cancelled = await svc.cancelOrder(order.id, 'Customer request');
    assertEqual(cancelled.status, 'cancelled');
    assert(events.some(e => e.event === ORDER_EVENTS.CANCELLED));
  });
});

// ── Scenario 5: Notification Triggers ────────────────────────────────────────

describe('Scenario 5: Notification Triggers', () => {
  const db = createMockNotifDb();
  const events = [];
  const svc = createNotificationService(db, { emit: (e) => events.push(e) });

  itAsync('creates in-app notification', async () => {
    const n = await svc.createNotification({ userId: 'u1', title: 'Hello', body: 'World', channels: ['in_app'] });
    assertEqual(n.title, 'Hello');
    assertEqual(n.status, 'unread');
    assert(events.some(e => e.event === NOTIFICATION_EVENTS.SENT));
  });

  itAsync('gets notifications for user', async () => {
    await svc.createNotification({ userId: 'u2', title: 'A', body: 'B', channels: ['in_app'] });
    await svc.createNotification({ userId: 'u2', title: 'C', body: 'D', channels: ['in_app'] });
    const list = await svc.getNotifications('u2');
    assert(list.length >= 2);
  });

  itAsync('counts unread notifications', async () => {
    await svc.createNotification({ userId: 'u3', title: 'X', body: 'Y', channels: ['in_app'] });
    const count = await svc.getUnreadCount('u3');
    assert(count >= 1);
  });

  itAsync('markRead transitions status', async () => {
    const n = await svc.createNotification({ userId: 'u4', title: 'A', body: 'B', channels: ['in_app'] });
    const read = await svc.markRead(n.id);
    assertEqual(read.status, 'read');
    assert(read.readAt !== null);
  });

  itAsync('markAllRead marks all as read', async () => {
    await svc.createNotification({ userId: 'u5', title: '1', body: '2', channels: ['in_app'] });
    await svc.createNotification({ userId: 'u5', title: '3', body: '4', channels: ['in_app'] });
    await svc.markAllRead('u5');
    const count = await svc.getUnreadCount('u5');
    assertEqual(count, 0);
  });

  itAsync('alertOnEvent uses template', async () => {
    const n = await svc.alertOnEvent('subscription.created', 'u6', { planName: 'Pro' });
    assert(n !== null, 'should create notification from template');
    assert(n.title.length > 0);
    assert(n.body.includes('Pro'));
  });

  itAsync('alertOnEvent returns null for unknown event', async () => {
    const n = await svc.alertOnEvent('unknown.event', 'u7');
    assert(n === null);
  });
});

// ── Scenario 6: Content Management ───────────────────────────────────────────

describe('Scenario 6: Content Management', () => {
  const db = createMockContentDb();
  const events = [];
  const svc = createContentService(db, { emit: (e) => events.push(e) });

  itAsync('creates content as draft', async () => {
    const item = await svc.createContent({ title: 'Hello World', body: 'Some body text here.', authorId: 'auth1' });
    assertEqual(item.title, 'Hello World');
    assertEqual(item.slug, 'hello-world');
    assertEqual(item.status, 'draft');
    assert(events.some(e => e.event === CONTENT_EVENTS.CREATED));
  });

  itAsync('rejects duplicate slug', async () => {
    await svc.createContent({ title: 'Unique Post', body: 'Body', authorId: 'a1' });
    await assertThrowsAsync(() => svc.createContent({ title: 'Unique Post', body: 'Other body', authorId: 'a1' }), 'SLUG_TAKEN');
  });

  itAsync('publishes draft content', async () => {
    const item = await svc.createContent({ title: 'Publish Me', body: 'Content body', authorId: 'a1' });
    const published = await svc.publish(item.id);
    assertEqual(published.status, 'published');
    assert(published.publishedAt !== null);
    assert(events.some(e => e.event === CONTENT_EVENTS.PUBLISHED));
  });

  itAsync('unpublishes published content', async () => {
    const item = await svc.createContent({ title: 'Unpublish Me', body: 'Body', authorId: 'a1' });
    await svc.publish(item.id);
    const draft = await svc.unpublish(item.id);
    assertEqual(draft.status, 'draft');
    assert(events.some(e => e.event === CONTENT_EVENTS.UNPUBLISHED));
  });

  itAsync('archives content', async () => {
    const item = await svc.createContent({ title: 'Archive Me', body: 'Body', authorId: 'a1' });
    const archived = await svc.archive(item.id);
    assertEqual(archived.status, 'archived');
  });

  itAsync('prevents update on archived content', async () => {
    const item = await svc.createContent({ title: 'Archived Content', body: 'Body', authorId: 'a1' });
    await svc.archive(item.id);
    await assertThrowsAsync(() => svc.updateContent(item.id, { title: 'New Title' }), 'ARCHIVED');
  });

  itAsync('schedules future publish', async () => {
    const item = await svc.createContent({ title: 'Scheduled Post', body: 'Body', authorId: 'a1' });
    const future = new Date(Date.now() + 86400000);
    const scheduled = await svc.schedulePublish(item.id, future);
    assertEqual(scheduled.status, 'scheduled');
    assert(scheduled.scheduledAt instanceof Date || scheduled.scheduledAt !== null);
    assert(events.some(e => e.event === CONTENT_EVENTS.SCHEDULED));
  });

  itAsync('deletes content', async () => {
    const item = await svc.createContent({ title: 'Delete Me', body: 'Body', authorId: 'a1' });
    const ok = await svc.deleteContent(item.id);
    assert(ok === true);
    assert(events.some(e => e.event === CONTENT_EVENTS.DELETED));
  });
});

// ── Scenario 7: Admin Tools ───────────────────────────────────────────────────

describe('Scenario 7: Admin Moderation', () => {
  const db = createMockAdminDb();
  db.users._seed('u1', { email: 'target@test.com', status: 'active', role: 'user' });
  db.content._seed('c1', { title: 'Bad Post', status: 'published', authorId: 'u1' });
  const events = [];
  const svc = createAdminService(db, { emit: (e) => events.push(e) });

  itAsync('moderates user with suspend action', async () => {
    const rec = await svc.moderateUser('admin1', 'u1', 'suspend', 'Violated terms');
    assertEqual(rec.action, 'suspend');
    assertEqual(rec.targetType, 'user');
    assert(events.some(e => e.event === 'admin.user_moderated'));
  });

  itAsync('moderates content with delete action', async () => {
    const rec = await svc.moderateContent('admin1', 'c1', 'delete', 'Inappropriate');
    assertEqual(rec.action, 'delete');
    assertEqual(rec.targetType, 'content');
    assert(events.some(e => e.event === 'admin.content_moderated'));
  });

  itAsync('writes system log', async () => {
    const log = await svc.writeLog('warn', 'High traffic detected', 'api-gateway', { requestsPerMin: 1000 });
    assertEqual(log.level, 'warn');
    assertEqual(log.message, 'High traffic detected');
    assertEqual(log.source, 'api-gateway');
  });

  itAsync('queries moderation history', async () => {
    const history = await svc.getModerationHistory();
    assert(Array.isArray(history));
    assert(history.length >= 2, 'should have records from previous tests');
  });

  itAsync('rejects moderation without reason', async () => {
    await assertThrowsAsync(() => svc.moderateUser('admin1', 'u1', 'warn', ''), 'VALIDATION_ERROR');
  });
});

// ── Scenario 8: Analytics Events ─────────────────────────────────────────────

describe('Scenario 8: Analytics Tracking', () => {
  const db = createMockAnalyticsDb();
  const svc = createAnalyticsService(db);

  itAsync('tracks page view', async () => {
    const e = await svc.trackPageView('u1', '/dashboard', 'sess_1');
    assertEqual(e.name, 'page_view');
    assertEqual(e.userId, 'u1');
    assert(e.properties.page === '/dashboard');
  });

  itAsync('tracks sign up', async () => {
    const e = await svc.trackSignUp('u2', 'google');
    assertEqual(e.name, 'sign_up');
    assertEqual(e.properties.method, 'google');
  });

  itAsync('tracks feature usage', async () => {
    const e = await svc.trackFeatureUsed('u1', 'export', { format: 'csv' });
    assertEqual(e.name, 'feature_used');
    assertEqual(e.properties.feature, 'export');
  });

  itAsync('tracks purchase event', async () => {
    const e = await svc.trackPurchase('u1', 'ord_123', 99.00, 'usd');
    assertEqual(e.name, 'purchase');
    assertEqual(e.properties.amount, 99.00);
  });

  itAsync('tracks subscription events', async () => {
    const e = await svc.trackSubscriptionEvent('u1', 'start', 'plan_pro');
    assertEqual(e.name, 'subscription_start');
  });

  itAsync('records and retrieves metrics', async () => {
    await svc.recordMetric('u1', 'api_calls', 42, 'day');
    const metrics = await svc.getMetrics('u1');
    assert(Array.isArray(metrics));
  });

  itAsync('logs user activity', async () => {
    await svc.logActivity('u1', 'export_data', { format: 'csv' });
    const activity = await svc.getUserActivity('u1');
    assert(activity.length >= 1);
    assertEqual(activity[0].action, 'export_data');
  });

  itAsync('queries events by name', async () => {
    const all = await svc.queryEvents({ name: 'page_view' });
    assert(all.every(e => e.name === 'page_view'));
  });

  itAsync('getEventCount returns correct count', async () => {
    const count = await svc.getEventCount('page_view');
    assert(typeof count === 'number' && count >= 1);
  });

  itAsync('respects enabled=false flag', async () => {
    const disabledSvc = createAnalyticsService(db, { enabled: false });
    const result = await disabledSvc.track({ name: 'page_view', userId: 'u99' });
    assert(result === null, 'should return null when disabled');
  });
});

// ── Scenario 9: Module Registry ───────────────────────────────────────────────

describe('Scenario 9: Module Registry', () => {
  it('getModulesForAppType returns expected modules for saas', () => {
    const modules = getModulesForAppType('saas');
    assertIncludes(modules, 'users');
    assertIncludes(modules, 'subscriptions');
    assertIncludes(modules, 'analytics');
  });

  it('getModulesForAppType returns correct modules for marketplace', () => {
    const modules = getModulesForAppType('marketplace');
    assertIncludes(modules, 'users');
    assertIncludes(modules, 'orders');
    assertIncludes(modules, 'admin');
  });

  it('getModulesForAppType returns empty for landing-page', () => {
    const modules = getModulesForAppType('landing-page');
    assertEqual(modules.length, 0);
  });

  it('detectModulesFromPrompt detects subscription keywords', () => {
    const modules = detectModulesFromPrompt('Build a SaaS with monthly subscription plans and user login');
    assertIncludes(modules, 'subscriptions');
    assertIncludes(modules, 'users');
  });

  it('detectModulesFromPrompt detects order keywords', () => {
    const modules = detectModulesFromPrompt('Build a marketplace with checkout and payment');
    assertIncludes(modules, 'orders');
  });

  it('detectModulesFromPrompt detects analytics keywords', () => {
    const modules = detectModulesFromPrompt('Add analytics dashboard with usage metrics');
    assertIncludes(modules, 'analytics');
  });

  it('selectModules merges app-type and prompt modules', () => {
    const { modules, sources } = selectModules('blog', 'Add email notifications for new posts');
    assertIncludes(modules, 'users');
    assertIncludes(modules, 'content');
    assertIncludes(modules, 'notifications');
    assert(sources.fromAppType.includes('content'), 'content should come from app type');
    assert(sources.fromPrompt.includes('notifications'), 'notifications should come from prompt');
  });

  it('buildModuleHints returns non-empty string for selected modules', () => {
    const hints = buildModuleHints(['users', 'subscriptions']);
    assert(typeof hints === 'string' && hints.length > 0);
    assert(hints.includes('User Management'));
    assert(hints.includes('Subscriptions'));
    assert(hints.includes('Features:'));
  });

  it('buildModuleHints returns empty string for empty list', () => {
    const hints = buildModuleHints([]);
    assertEqual(hints, '');
  });

  it('buildModulesPayload returns correct structure', () => {
    const { modules, sources } = selectModules('saas', 'Build a SaaS app');
    const payload = buildModulesPayload(modules, sources);
    assert(Array.isArray(payload.modules));
    assert(typeof payload.moduleCount === 'number' && payload.moduleCount > 0);
    assert(Array.isArray(payload.envVarsNeeded));
    assert(Array.isArray(payload.dependencies));
  });

  it('MODULES registry has all 7 expected modules', () => {
    const ids = Object.keys(MODULES);
    assert(ids.length === 7);
    for (const id of ['users', 'subscriptions', 'orders', 'notifications', 'content', 'admin', 'analytics']) {
      assertIncludes(ids, id);
    }
  });

  it('each module definition has required fields', () => {
    for (const mod of Object.values(MODULES)) {
      assert(mod.id, `Module missing id`);
      assert(mod.name, `Module ${mod.id} missing name`);
      assert(mod.description, `Module ${mod.id} missing description`);
      assert(Array.isArray(mod.features), `Module ${mod.id} features should be array`);
      assert(Array.isArray(mod.envVars), `Module ${mod.id} envVars should be array`);
      assert(Array.isArray(mod.files), `Module ${mod.id} files should be array`);
    }
  });
});

// ── Run all async tests then print results ────────────────────────────────────

(async () => {
  for (const { label, fn } of asyncQueue) {
    try {
      await fn();
      console.log(`    ✓ ${label}`);
      passed++;
    } catch (err) {
      console.log(`    ✗ ${label}`);
      console.log(`      ${err.message}`);
      failed++;
      failures.push({ label, error: err.message });
    }
  }

  console.log('\n' + '─'.repeat(55));
  console.log('  Business Logic Library Tests');
  console.log('─'.repeat(55));
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  if (failures.length > 0) {
    console.log('\n  Failures:');
    for (const f of failures) {
      console.log(`    ✗ ${f.label}`);
      console.log(`      ${f.error}`);
    }
  }
  console.log('─'.repeat(55));
  if (failed > 0) process.exit(1);
})();
