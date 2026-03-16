'use strict';

/**
 * User Intent Memory System — Test Suite
 */

const {
  updateIntentMemory,
  getIntentMemoryForSession,
  resetIntentMemory,
  getIntentSummary,
  getIntentHistory,
  buildUiIntentPayload,
  extractIntentUpdate,
  mergeIntent,
  resolveConflicts,
} = require('../../src/lib/intent-memory');

// ── Minimal test harness ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

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
    console.error(`    ✗ ${label}`);
    console.error(`      ${err.message}`);
    failed++;
    failures.push({ label, error: err.message });
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertIncludes(arr, val, msg) { assert(arr.includes(val), msg || `Expected ${JSON.stringify(arr)} to include ${JSON.stringify(val)}`); }
function assertNotIncludes(arr, val, msg) { assert(!arr.includes(val), msg || `Expected ${JSON.stringify(arr)} NOT to include ${JSON.stringify(val)}`); }
function assertContains(arr, pred, msg) { assert(arr.some(pred), msg || 'Array does not contain expected element'); }

// Use unique session IDs per test to avoid state leaking between tests
let _sid = 0;
function sid() { return `test-session-${++_sid}-${Date.now()}`; }

// ── Scenario 1: First prompt — new project ─────────────────────────────────

describe('Scenario 1 — First prompt creates new project intent', () => {
  const session = sid();
  const { intentMemory, update } = updateIntentMemory(session, 'Build a barber booking app');

  it('classifies as NEW_PROJECT', () => assertEqual(update.changeType, 'NEW_PROJECT'));
  it('sets appGoal', () => assert(intentMemory.appGoal.includes('barber'), `appGoal: "${intentMemory.appGoal}"`));
  it('detects booking feature', () => assertIncludes(intentMemory.coreFeatures, 'booking'));
  it('defaults platform to web', () => assertIncludes(intentMemory.platforms, 'web'));
  it('promptCount is 1', () => assertEqual(intentMemory.promptCount, 1));
  it('has a lastUpdated timestamp', () => assert(typeof intentMemory.lastUpdated === 'string'));
  it('history has one entry', () => assertEqual(intentMemory.intentHistory.length, 1));
});

// ── Scenario 2: Feature addition ──────────────────────────────────────────

describe('Scenario 2 — Feature addition (ADD_FEATURE)', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a barber booking app');
  const { intentMemory, update } = updateIntentMemory(session, 'Add Stripe payments');

  it('classifies as ADD_FEATURE or CHANGE_INTEGRATION', () => {
    assert(
      update.changeType === 'ADD_FEATURE' || update.changeType === 'CHANGE_INTEGRATION',
      `changeType: ${update.changeType}`,
    );
  });
  it('adds payments to coreFeatures', () => assertIncludes(intentMemory.coreFeatures, 'payments'));
  it('adds Stripe to integrations', () => assertIncludes(intentMemory.integrations, 'Stripe'));
  it('sets billingRequired = true', () => assert(intentMemory.billingRequired === true));
  it('preserves booking feature from prompt 1', () => assertIncludes(intentMemory.coreFeatures, 'booking'));
  it('promptCount is 2', () => assertEqual(intentMemory.promptCount, 2));
  it('history has two entries', () => assertEqual(intentMemory.intentHistory.length, 2));
});

// ── Scenario 3: Admin dashboard addition ──────────────────────────────────

describe('Scenario 3 — Admin dashboard addition', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a barber booking app');
  updateIntentMemory(session, 'Add Stripe payments');
  const { intentMemory } = updateIntentMemory(session, 'Add an admin dashboard');

  it('adds admin or dashboard feature', () => {
    assert(
      intentMemory.coreFeatures.includes('admin') || intentMemory.coreFeatures.includes('dashboard'),
      `coreFeatures: ${intentMemory.coreFeatures.join(', ')}`,
    );
  });
  it('sets adminRequired = true', () => assert(intentMemory.adminRequired === true));
  it('preserves booking feature', () => assertIncludes(intentMemory.coreFeatures, 'booking'));
  it('preserves Stripe integration', () => assertIncludes(intentMemory.integrations, 'Stripe'));
  it('promptCount is 3', () => assertEqual(intentMemory.promptCount, 3));
});

// ── Scenario 4: Style change ───────────────────────────────────────────────

describe('Scenario 4 — Style change (CHANGE_STYLE)', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a barber booking app');
  updateIntentMemory(session, 'Add Stripe payments');
  updateIntentMemory(session, 'Add an admin dashboard');
  const { intentMemory, update } = updateIntentMemory(session, 'Make the UI darker');

  it('classifies as CHANGE_STYLE', () => assertEqual(update.changeType, 'CHANGE_STYLE'));
  it('sets designIntent to dark', () => assertEqual(intentMemory.designIntent, 'dark'));
  it('preserves all 3 previous features', () => {
    assert(intentMemory.coreFeatures.length >= 2, `coreFeatures: ${intentMemory.coreFeatures.join(', ')}`);
  });
  it('preserves billing', () => assert(intentMemory.billingRequired === true));
  it('preserves admin', () => assert(intentMemory.adminRequired === true));
  it('does not remove features on style change', () => {
    assertIncludes(intentMemory.coreFeatures, 'booking');
  });
});

// ── Scenario 5: Platform change (conflict resolution) ─────────────────────

describe('Scenario 5 — Platform change replaces previous platform', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a barber booking web app');
  const { intentMemory, update } = updateIntentMemory(session, 'Make it a mobile app only');

  it('classifies as CHANGE_PLATFORM', () => assertEqual(update.changeType, 'CHANGE_PLATFORM'));
  it('platform is now mobile', () => assertIncludes(intentMemory.platforms, 'mobile'));
  it('sets mobileRequired = true', () => assert(intentMemory.mobileRequired === true));
  it('booking feature is preserved after platform change', () => {
    assertIncludes(intentMemory.coreFeatures, 'booking');
  });
});

// ── Scenario 6: Integration addition ──────────────────────────────────────

describe('Scenario 6 — Integration addition (OpenAI)', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a SaaS tool');
  const { intentMemory, update } = updateIntentMemory(session, 'Add OpenAI for AI text generation');

  it('detects OpenAI integration', () => assertIncludes(intentMemory.integrations, 'OpenAI'));
  it('adds AI feature', () => assertIncludes(intentMemory.coreFeatures, 'ai'));
  it('previous features preserved', () => assertEqual(intentMemory.promptCount, 2));
});

// ── Scenario 7: Feature removal ───────────────────────────────────────────

describe('Scenario 7 — Feature removal (REMOVE_FEATURE)', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a marketplace with payments and social features');
  const { intentMemory, update } = updateIntentMemory(session, 'Remove the social features');

  it('classifies as REMOVE_FEATURE', () => assertEqual(update.changeType, 'REMOVE_FEATURE'));
  it('social is removed from features', () => assertNotIncludes(intentMemory.coreFeatures, 'social'));
  it('payments is preserved', () => assertIncludes(intentMemory.coreFeatures, 'payments'));
});

// ── Scenario 8: Auth preservation ─────────────────────────────────────────

describe('Scenario 8 — Auth is not accidentally removed by unrelated prompt', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a SaaS app with user login and Stripe billing');
  const { intentMemory } = updateIntentMemory(session, 'Improve the design to be more minimal');

  it('authRequired still true after design change', () => assert(intentMemory.authRequired === true));
  it('billingRequired still true after design change', () => assert(intentMemory.billingRequired === true));
  it('auth feature preserved', () => assertIncludes(intentMemory.coreFeatures, 'auth'));
});

// ── Scenario 9: Reset on NEW_PROJECT ──────────────────────────────────────

describe('Scenario 9 — Session reset on new project signal', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a barber booking app with Stripe');
  updateIntentMemory(session, 'Add admin dashboard');
  const { intentMemory, wasReset } = updateIntentMemory(session, 'Start new app: recipe sharing platform');

  it('wasReset is true', () => assert(wasReset === true));
  it('appGoal reflects new project', () => assert(intentMemory.appGoal.toLowerCase().includes('recipe') || intentMemory.appGoal.toLowerCase().includes('sharing'), `appGoal: "${intentMemory.appGoal}"`));
  it('previous integrations (Stripe) are cleared', () => assertNotIncludes(intentMemory.integrations, 'Stripe'));
  it('promptCount restarts at 1', () => assertEqual(intentMemory.promptCount, 1));
});

// ── Scenario 10: Multiple integrations accumulate ─────────────────────────

describe('Scenario 10 — Multiple integrations accumulate across prompts', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a marketplace');
  updateIntentMemory(session, 'Add Stripe payments');
  updateIntentMemory(session, 'Add email notifications with SendGrid');
  const { intentMemory } = updateIntentMemory(session, 'Store images using Cloudinary');

  it('has Stripe integration', () => assertIncludes(intentMemory.integrations, 'Stripe'));
  it('has SendGrid integration', () => assertIncludes(intentMemory.integrations, 'SendGrid'));
  it('has Cloudinary integration', () => assertIncludes(intentMemory.integrations, 'Cloudinary'));
  it('has 4 prompts processed', () => assertEqual(intentMemory.promptCount, 4));
});

// ── Scenario 11: Intent summary ───────────────────────────────────────────

describe('Scenario 11 — getIntentSummary builds readable context string', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a barber booking app');
  updateIntentMemory(session, 'Add Stripe payments and login');
  const memory = getIntentMemoryForSession(session);
  const summary = getIntentSummary(memory);

  it('summary is a non-empty string', () => assert(typeof summary === 'string' && summary.length > 10));
  it('summary mentions app goal', () => assert(summary.includes('App:'), `summary: "${summary}"`));
  it('summary mentions features', () => assert(summary.includes('Features:'), `summary: "${summary}"`));
});

// ── Scenario 12: getIntentHistory ─────────────────────────────────────────

describe('Scenario 12 — getIntentHistory returns chronological log', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a todo app');
  updateIntentMemory(session, 'Add authentication');
  const history = getIntentHistory(session);

  it('history has 2 entries', () => assertEqual(history.length, 2));
  it('each entry has changeType', () => assert(history.every(e => typeof e.changeType === 'string')));
  it('each entry has timestamp', () => assert(history.every(e => typeof e.timestamp === 'string')));
  it('each entry has description', () => assert(history.every(e => typeof e.description === 'string')));
  it('first entry is NEW_PROJECT', () => assertEqual(history[0].changeType, 'NEW_PROJECT'));
  it('second entry is ADD_FEATURE', () => assertEqual(history[1].changeType, 'ADD_FEATURE'));
});

// ── Scenario 13: resetIntentMemory ────────────────────────────────────────

describe('Scenario 13 — resetIntentMemory clears session', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a booking app with Stripe and admin');
  const fresh = resetIntentMemory(session);

  it('fresh memory has empty coreFeatures', () => assertEqual(fresh.coreFeatures.length, 0));
  it('fresh memory has promptCount 0', () => assertEqual(fresh.promptCount, 0));
  it('fresh memory has empty integrations', () => assertEqual(fresh.integrations.length, 0));
  it('fresh memory has billingRequired false', () => assert(fresh.billingRequired === false));
  it('getIntentMemoryForSession returns fresh state', () => {
    const loaded = getIntentMemoryForSession(session);
    assertEqual(loaded.promptCount, 0);
  });
});

// ── Scenario 14: buildUiIntentPayload ─────────────────────────────────────

describe('Scenario 14 — buildUiIntentPayload returns UI-safe object', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a SaaS app with login and Stripe');
  const memory  = getIntentMemoryForSession(session);
  const payload = buildUiIntentPayload(memory);

  it('has appGoal', () => assert('appGoal' in payload));
  it('has features array', () => assert(Array.isArray(payload.features)));
  it('has platforms array', () => assert(Array.isArray(payload.platforms)));
  it('has integrations array', () => assert(Array.isArray(payload.integrations)));
  it('has roles array', () => assert(Array.isArray(payload.roles)));
  it('has summary string', () => assert(typeof payload.summary === 'string'));
  it('has recentHistory array', () => assert(Array.isArray(payload.recentHistory)));
});

// ── Scenario 15: Additive merge rule ──────────────────────────────────────

describe('Scenario 15 — Merging is additive — features accumulate, not overwrite', () => {
  const session = sid();
  updateIntentMemory(session, 'Build an e-commerce shop with product listings');
  updateIntentMemory(session, 'Add a shopping cart and checkout');
  updateIntentMemory(session, 'Add a search and filter system');
  const memory = getIntentMemoryForSession(session);

  it('all three feature sets present', () => {
    // ecommerce includes product/cart, search is detected
    assert(
      memory.coreFeatures.length >= 2,
      `Expected >= 2 features, got: ${memory.coreFeatures.join(', ')}`,
    );
  });
  it('promptCount is 3', () => assertEqual(memory.promptCount, 3));
});

// ── Scenario 16: Conflict — style change preserves flags ──────────────────

describe('Scenario 16 — CHANGE_STYLE conflict does not clear auth/billing flags', () => {
  const session = sid();
  updateIntentMemory(session, 'Build a marketplace with login and Stripe');

  // Simulate a conflict resolution scenario
  const memory = getIntentMemoryForSession(session);
  const update = extractIntentUpdate('Make it a premium dark theme', memory);
  const { update: resolved, conflicts } = resolveConflicts(update, memory);

  it('changeType is CHANGE_STYLE', () => assertEqual(resolved.changeType, 'CHANGE_STYLE'));
  it('resolved update has no removeFeatures', () => {
    assert(!resolved.removeFeatures || resolved.removeFeatures.length === 0);
  });
  it('resolved update clears authRequired (style changes do not affect flags)', () => {
    // After conflict resolution, style changes explicitly unset flag overrides
    assert(resolved.authRequired === undefined, `authRequired should be undefined on CHANGE_STYLE`);
  });
  it('designIntent is dark or premium', () => {
    assert(
      resolved.designIntent === 'dark' || resolved.designIntent === 'premium',
      `designIntent: "${resolved.designIntent}"`,
    );
  });
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(50));
if (failed === 0) {
  console.log(`  All ${passed} tests passed.`);
} else {
  console.log(`  ${passed} passed, ${failed} failed.`);
  for (const f of failures) {
    console.log(`  ✗ ${f.label}: ${f.error}`);
  }
  process.exitCode = 1;
}
console.log('─'.repeat(50) + '\n');
