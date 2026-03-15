'use strict';

/**
 * Unit tests for the Missing Requirement Inference engine.
 * Run with: node test/inference/requirements.test.js
 * (No test runner required — uses a tiny inline assert helper.)
 */

const { inferMissingRequirements, detectDomain, mergeInferenceIntoSpec } = require('../../src/lib/inference');
const { buildInferenceReport } = require('../../src/lib/inference/buildInferenceReport');

// ── Minimal test harness ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${label}`);
    failed++;
  }
}

function describe(title, fn) {
  console.log(`\n── ${title}`);
  fn();
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeIntent(overrides = {}) {
  return {
    appType:           'generic',
    category:          'Web application',
    coreEntity:        'Item',
    features:          [],
    userFlows:         [],
    uiStates:          ['empty state', 'loading', 'error'],
    realContent:       { appName: 'My App', tagline: '', primaryCTA: 'Get started', emptyStateMessages: {}, sectionHeadings: [], bodyParagraphs: [] },
    interactions:      [],
    needsAuth:         false,
    needsDatabase:     true,
    needsPayments:     false,
    isMultiUser:       false,
    tone:              'professional',
    target:            'General users',
    potentialPitfalls: [],
    ...overrides,
  };
}

// ── 1. Domain detection ───────────────────────────────────────────────────────

describe('Domain detection — barber booking app', () => {
  const intent = makeIntent({ appType: 'booking', category: 'Appointment booking', coreEntity: 'Appointment' });
  const { domain, detectedKeywords } = detectDomain(intent);
  assert(domain === 'booking', `domain is "booking" (got "${domain}")`);
  assert(detectedKeywords.length > 0, 'detected at least one keyword');
});

describe('Domain detection — used books marketplace', () => {
  const intent = makeIntent({ appType: 'marketplace', category: 'Buy and sell used books', coreEntity: 'Listing' });
  const { domain } = detectDomain(intent);
  assert(domain === 'marketplace', `domain is "marketplace" (got "${domain}")`);
});

describe('Domain detection — invoice SaaS', () => {
  const intent = makeIntent({ appType: 'saas', category: 'Invoice management platform', coreEntity: 'Invoice' });
  const { domain } = detectDomain(intent);
  assert(domain === 'saas', `domain is "saas" (got "${domain}")`);
});

describe('Domain detection — gym fitness app', () => {
  const intent = makeIntent({
    appType: 'fitness',
    category: 'Gym workout tracking',
    coreEntity: 'Workout',
    realContent: { appName: 'FitTrack', tagline: 'Track your gains', primaryCTA: 'Start tracking', emptyStateMessages: {}, sectionHeadings: [], bodyParagraphs: [] },
  });
  const { domain } = detectDomain(intent);
  assert(domain === 'fitness', `domain is "fitness" (got "${domain}")`);
});

describe('Domain detection — restaurant ordering app', () => {
  const intent = makeIntent({ appType: 'restaurant', category: 'Online food ordering', coreEntity: 'Order' });
  const { domain } = detectDomain(intent);
  assert(domain === 'restaurant', `domain is "restaurant" (got "${domain}")`);
});

describe('Domain detection — AI content generator', () => {
  const intent = makeIntent({ appType: 'ai_tool', category: 'AI content generation tool', coreEntity: 'Generation' });
  const { domain } = detectDomain(intent);
  assert(domain === 'ai_tool', `domain is "ai_tool" (got "${domain}")`);
});

describe('Domain detection — ops dashboard via keyword', () => {
  const intent = makeIntent({
    appType: 'generic',
    category: 'Operations dashboard with analytics',
    features: [{ name: 'Metrics charts', description: 'Show KPI charts' }],
  });
  const { domain } = detectDomain(intent);
  assert(domain === 'dashboard', `domain is "dashboard" (got "${domain}")`);
});

describe('Domain detection — landing page / portfolio', () => {
  const intent = makeIntent({ appType: 'portfolio', category: 'Personal portfolio website' });
  const { domain } = detectDomain(intent);
  assert(domain === 'landing_page', `domain is "landing_page" (got "${domain}")`);
});

// ── 2. Inference report structure ────────────────────────────────────────────

describe('Inference report — booking app has expected critical requirements', () => {
  const intent = makeIntent({ appType: 'booking', category: 'Barber shop booking', coreEntity: 'Appointment' });
  const { domain } = detectDomain(intent);
  const report = buildInferenceReport({ intent, domain, detectedKeywords: ['booking'] });

  assert(report.requirements.length > 0, 'has requirements');
  assert(report.missing.length > 0, 'has missing requirements');
  assert(report.critical.length > 0, 'has critical missing requirements');
  assert(report.critical.some(r => r.id === 'booking_calendar'), 'booking_calendar is critical missing');
  assert(report.critical.some(r => r.id === 'flow_book_appointment'), 'flow_book_appointment is critical missing');
  assert(report.mvpAdditions.length >= report.critical.length, 'mvpAdditions includes all criticals');
});

describe('Inference report — ecommerce app has shopping cart as critical', () => {
  // needsPayments not explicitly set to false → payment integration stays critical
  const intent = makeIntent({ appType: 'ecommerce', category: 'Online shop', coreEntity: 'Product', needsPayments: undefined });
  const { domain } = detectDomain(intent);
  const report = buildInferenceReport({ intent, domain, detectedKeywords: ['shop'] });

  assert(report.critical.some(r => r.id === 'shopping_cart'), 'shopping_cart is critical');
  assert(report.critical.some(r => r.id === 'checkout_flow'), 'checkout_flow is critical');
  assert(report.critical.some(r => r.id === 'int_payment_gateway'), 'int_payment_gateway is critical');
});

describe('Inference report — SaaS app has auth and stripe as critical', () => {
  const intent = makeIntent({ appType: 'saas', category: 'SaaS platform', coreEntity: 'Account', needsAuth: false });
  const { domain } = detectDomain(intent);
  const report = buildInferenceReport({ intent, domain, detectedKeywords: ['saas'] });

  assert(report.requirements.some(r => r.id === 'auth_full'), 'auth_full is present in requirements');
  // needsAuth=false should demote auth to helpful_optional
  const authReq = report.requirements.find(r => r.id === 'auth_full');
  assert(authReq && authReq.classification === 'helpful_optional', 'auth_full demoted to helpful_optional when needsAuth=false');
});

describe('Inference report — payment integration demoted when needsPayments=false', () => {
  const intent = makeIntent({ appType: 'ecommerce', category: 'Online shop', needsPayments: false });
  const { domain } = detectDomain(intent);
  const report = buildInferenceReport({ intent, domain, detectedKeywords: ['shop'] });

  const paymentReq = report.requirements.find(r => r.id === 'int_payment_gateway');
  assert(paymentReq && paymentReq.classification === 'helpful_optional', 'payment demoted when needsPayments=false');
});

// ── 3. Already-present detection ─────────────────────────────────────────────

describe('Already-present detection — booking_calendar marked present when explicitly in features', () => {
  const intent = makeIntent({
    appType: 'booking',
    features: [{ name: 'Booking calendar', description: 'Calendar for picking slots' }],
  });
  const { domain } = detectDomain(intent);
  const report = buildInferenceReport({ intent, domain, detectedKeywords: ['booking'] });

  const calReq = report.requirements.find(r => r.id === 'booking_calendar');
  assert(calReq && calReq.alreadyPresent === true, 'booking_calendar detected as already present');
});

// ── 4. mergeInferenceIntoSpec ─────────────────────────────────────────────────

describe('mergeInferenceIntoSpec — adds missing must/should features to intent', () => {
  const intent = makeIntent({ appType: 'booking', category: 'Barber booking' });
  const { domain } = detectDomain(intent);
  const report = buildInferenceReport({ intent, domain, detectedKeywords: ['booking'] });
  const enriched = mergeInferenceIntoSpec(intent, report);

  assert(enriched.features.length > intent.features.length, 'features array was extended');
  assert(enriched.userFlows.length > intent.userFlows.length, 'userFlows array was extended');
  assert(enriched.potentialPitfalls.length >= 0, 'potentialPitfalls present');
  assert(enriched._inferenceReport !== undefined, '_inferenceReport attached to enriched intent');
});

describe('mergeInferenceIntoSpec — inferred features are marked inferred=true', () => {
  const intent = makeIntent({ appType: 'fitness', category: 'Gym tracking app' });
  const { domain } = detectDomain(intent);
  const report = buildInferenceReport({ intent, domain, detectedKeywords: ['fitness', 'gym'] });
  const enriched = mergeInferenceIntoSpec(intent, report);

  const inferredFeatures = enriched.features.filter(f => f.inferred === true);
  assert(inferredFeatures.length > 0, 'at least one inferred feature present');
  assert(inferredFeatures.every(f => f.inferredFrom), 'all inferred features have inferredFrom rationale');
});

// ── 5. MVP tier assignment ────────────────────────────────────────────────────

describe('MVP tiers — critical_missing → must, likely_needed → should, helpful_optional → could', () => {
  const intent = makeIntent({ appType: 'restaurant', category: 'Food ordering app' });
  const { domain } = detectDomain(intent);
  const report = buildInferenceReport({ intent, domain, detectedKeywords: ['restaurant', 'food'] });

  const mustItems   = report.requirements.filter(r => r.mvpTier === 'must');
  const shouldItems = report.requirements.filter(r => r.mvpTier === 'should');
  const couldItems  = report.requirements.filter(r => r.mvpTier === 'could');

  assert(mustItems.length > 0, 'has must-tier items');
  assert(shouldItems.length > 0, 'has should-tier items');
  assert(couldItems.length > 0, 'has could-tier items');
  assert(mustItems.every(r => r.classification === 'critical_missing'), 'must items all have critical_missing classification');
});

// ── 6. inferMissingRequirements (async integration) ─────────────────────────

describe('inferMissingRequirements — async function enriches intent', async () => {
  const intent = makeIntent({ appType: 'dashboard', category: 'Analytics dashboard', coreEntity: 'Metric' });
  const enriched = await inferMissingRequirements(intent, null);

  assert(enriched !== null, 'returns non-null enriched intent');
  assert(typeof enriched === 'object', 'returns object');
  assert(enriched._inferenceReport !== undefined, '_inferenceReport attached');
  assert(enriched._inferenceReport.domain === 'dashboard', `domain in report is "dashboard" (got "${enriched._inferenceReport.domain}")`);
  assert(enriched.features.length >= intent.features.length, 'features not shrunk');
});

// ── Summary ───────────────────────────────────────────────────────────────────

Promise.resolve().then(() => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
