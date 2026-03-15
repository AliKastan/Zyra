'use strict';

/**
 * Unit tests for the App Complexity Scorer.
 * Run with: node test/complexity/scorer.test.js
 * (No test runner required — uses a tiny inline assert helper.)
 */

const {
  scoreAppComplexity,
  getComplexityTier,
  getGenerationStrategyForComplexity,
  summarizeComplexity,
  mergeComplexityIntoSpec,
} = require('../../src/lib/complexity');

const { buildComplexityReport } = require('../../src/lib/complexity/buildComplexityReport');

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeFeatures(names) {
  return names.map(name => ({ name, description: '', priority: 'high', implicit: false, inferred: false }));
}

function makeRequirements(roles, entities, integrations) {
  return [
    ...roles.map((name, i) => ({
      id: `role_${i}`,
      category: 'role',
      name,
      classification: 'critical_missing',
      mvpTier: 1,
      alreadyPresent: false,
    })),
    ...entities.map((name, i) => ({
      id: `entity_${i}`,
      category: 'entity',
      name,
      classification: 'critical_missing',
      mvpTier: 1,
      alreadyPresent: false,
    })),
    ...integrations.map((name, i) => ({
      id: `int_${i}`,
      category: 'integration',
      name,
      classification: 'critical_missing',
      mvpTier: 1,
      alreadyPresent: false,
    })),
  ];
}

// ── 1. Simple startup landing page ───────────────────────────────────────────

describe('Scenario 1 — Simple startup landing page', () => {
  const intent = {
    appType:       'landing-page',
    category:      'Marketing',
    coreEntity:    'Page',
    target:        'Visitors',
    features:      makeFeatures(['Hero section', 'Email newsletter', 'About section']),
    userFlows:     [],
    needsAuth:     false,
    needsDatabase: false,
    needsPayments: false,
    isMultiUser:   false,
  };

  const report = buildComplexityReport(intent);

  assert(report.complexityTier === 'simple', `tier is "simple" (got "${report.complexityTier}")`);
  assert(report.totalScore >= 0 && report.totalScore <= 24, `score ${report.totalScore} is in simple range (0-24)`);
  assert(report.signals.featureCount === 3, `featureCount is 3 (got ${report.signals.featureCount})`);
  assert(report.signals.hasAuth === false, 'hasAuth is false (no auth keywords or needsAuth flag)');
  assert(report.signals.hasPayments === false, 'hasPayments is false');
  assert(report.recommendedStrategy.generationMode === 'compact', `generationMode is "compact" (got "${report.recommendedStrategy.generationMode}")`);
  assert(report.llmRefined === false, 'llmRefined is false (no LLM pass)');

  const summary = summarizeComplexity(report);
  assert(typeof summary === 'string' && summary.length > 0, 'summarizeComplexity returns non-empty string');
  assert(summary.includes('simple'), `summary mentions tier (got: "${summary.slice(0, 80)}")`);
});

// ── 2. Internal CRUD dashboard ────────────────────────────────────────────────

describe('Scenario 2 — Internal CRUD dashboard (one team)', () => {
  const intent = {
    appType:       'dashboard',
    category:      'Internal tools',
    coreEntity:    'Task',
    target:        'Team members',
    features:      makeFeatures([
      'Task list',
      'Create task',
      'Edit task',
      'Delete task',
      'User settings',
      'Team view',
      'Activity log',
      'Dashboard overview',
    ]),
    userFlows: [
      { name: 'Create and assign task', steps: ['Create task', 'Assign to user', 'Set deadline'], inferred: false },
      { name: 'Review team progress', steps: ['View dashboard', 'Filter tasks', 'Export report'], inferred: false },
    ],
    needsAuth:     true,
    needsDatabase: true,
    needsPayments: false,
    isMultiUser:   true,
  };

  const report = buildComplexityReport(intent);

  assert(report.complexityTier === 'medium', `tier is "medium" (got "${report.complexityTier}")`);
  assert(report.totalScore >= 25 && report.totalScore <= 49, `score ${report.totalScore} is in medium range (25-49)`);
  assert(report.signals.featureCount === 8, `featureCount is 8 (got ${report.signals.featureCount})`);
  assert(report.signals.hasAuth === true, 'hasAuth is true');
  assert(report.recommendedStrategy.generationMode === 'structured', `generationMode is "structured" (got "${report.recommendedStrategy.generationMode}")`);

  const summary = summarizeComplexity(report);
  assert(typeof summary === 'string' && summary.length > 0, 'summarizeComplexity returns non-empty string');
});

// ── 3. Barber booking app (after inference) ───────────────────────────────────

describe('Scenario 3 — Barber booking app (after inference)', () => {
  const intent = {
    appType:       'booking',
    category:      'Appointment booking',
    coreEntity:    'Appointment',
    target:        'Customers and barbers',
    features:      makeFeatures([
      'Booking calendar',
      'Time slot management',
      'Booking confirmation',
      'Cancellation',
      'Provider profiles',
      'Service selection',
      'Admin panel',
    ]),
    userFlows: [
      { name: 'Customer books appointment', steps: ['Browse providers', 'Select time slot', 'Confirm booking'], inferred: false },
      { name: 'Barber manages availability', steps: ['Set hours', 'Block times'], inferred: true },
      { name: 'Admin reviews bookings', steps: ['View all bookings', 'Manage providers'], inferred: true },
    ],
    needsAuth:     true,
    needsDatabase: true,
    needsPayments: false,
    isMultiUser:   true,
    _inferenceReport: {
      domain: 'booking',
      requirements: makeRequirements(
        ['Customer', 'Barber', 'Admin'],
        ['Appointment', 'Provider', 'Service', 'TimeSlot'],
        ['Calendar API', 'Email notifications', 'SMS']
      ),
      missing: [],
      critical: [],
      mvpAdditions: [],
    },
  };

  const report = buildComplexityReport(intent);

  assert(
    report.totalScore >= 40 && report.totalScore <= 55,
    `score ${report.totalScore} is in expected range (40-55)`
  );
  assert(
    report.complexityTier === 'medium' || report.complexityTier === 'advanced',
    `tier is "medium" or "advanced" (got "${report.complexityTier}")`
  );
  assert(report.signals.featureCount === 7, `featureCount is 7 (got ${report.signals.featureCount})`);
  assert(report.signals.roleCount === 3, `roleCount is 3 (got ${report.signals.roleCount})`);
  assert(report.signals.entityCount === 4, `entityCount is 4 (got ${report.signals.entityCount})`);
  assert(report.signals.integrationCount === 3, `integrationCount is 3 (got ${report.signals.integrationCount})`);
  assert(report.signals.hasAuth === true, 'hasAuth is true');

  const summary = summarizeComplexity(report);
  assert(typeof summary === 'string' && summary.length > 0, 'summarizeComplexity returns non-empty string');
});

// ── 4. AI Invoice SaaS ────────────────────────────────────────────────────────

describe('Scenario 4 — AI Invoice SaaS', () => {
  const intent = {
    appType:       'saas',
    category:      'Business software',
    coreEntity:    'Invoice',
    target:        'Small businesses',
    features:      makeFeatures([
      'Invoice creation',
      'AI extraction',
      'Billing dashboard',
      'Subscription management',
      'Team members',
      'Export PDF',
      'Analytics',
      'Admin panel',
      'Email notifications',
    ]),
    userFlows: [
      { name: 'Create invoice', steps: ['Fill details', 'AI auto-fill', 'Send'], inferred: false },
      { name: 'Manage subscription', steps: ['View plan', 'Upgrade', 'Billing history'], inferred: true },
    ],
    needsAuth:     true,
    needsDatabase: true,
    needsPayments: true,
    isMultiUser:   true,
    _inferenceReport: {
      domain: 'saas',
      requirements: makeRequirements(
        ['User', 'Admin', 'Team member'],
        ['Invoice', 'Client', 'Subscription', 'Payment', 'Team'],
        ['Stripe', 'OpenAI', 'SendGrid', 'PDF generator']
      ),
      missing: [],
      critical: [],
      mvpAdditions: [],
    },
  };

  const report = buildComplexityReport(intent);

  assert(report.complexityTier === 'advanced', `tier is "advanced" (got "${report.complexityTier}")`);
  assert(report.totalScore >= 50 && report.totalScore <= 74, `score ${report.totalScore} is in advanced range (50-74)`);
  assert(report.signals.featureCount === 9, `featureCount is 9 (got ${report.signals.featureCount})`);
  assert(report.signals.hasAuth === true, 'hasAuth is true');
  assert(report.signals.hasPayments === true, 'hasPayments is true');
  assert(report.signals.hasAI === true, 'hasAI is true (OpenAI integration)');
  assert(report.signals.hasAnalytics === true, 'hasAnalytics is true');
  assert(report.recommendedStrategy.generationMode === 'multi_pass', `generationMode is "multi_pass" (got "${report.recommendedStrategy.generationMode}")`);

  const summary = summarizeComplexity(report);
  assert(typeof summary === 'string' && summary.length > 0, 'summarizeComplexity returns non-empty string');
  assert(summary.includes('advanced'), `summary mentions tier (got: "${summary.slice(0, 80)}")`);
});

// ── 5. Multi-role marketplace ──────────────────────────────────────────────────

describe('Scenario 5 — Multi-role marketplace', () => {
  const intent = {
    appType:       'marketplace',
    category:      'E-commerce marketplace',
    coreEntity:    'Listing',
    target:        'Buyers and sellers',
    features:      [
      { name: 'Product listing',        description: 'Sellers create and manage product listings with image upload' },
      { name: 'Buyer dashboard',        description: 'Track orders, wishlist, and purchase history' },
      { name: 'Seller dashboard',       description: 'Manage inventory, orders, and payout analytics' },
      { name: 'Payments and escrow',    description: 'Stripe Connect payments with escrow and webhook handling' },
      { name: 'Content moderation',     description: 'Flag and review content, ban users, spam detection' },
      { name: 'Reviews and ratings',    description: 'Buyer and seller review system' },
      { name: 'Messaging system',       description: 'Real-time instant messaging between buyers and sellers' },
      { name: 'Analytics dashboard',    description: 'Sales metrics, KPIs, charts, and reporting' },
      { name: 'Admin panel',            description: 'Admin management dashboard for platform operations' },
      { name: 'Mobile app',             description: 'iOS and Android mobile app for buyers and sellers' },
      { name: 'Search and filters',     description: 'Full-text search with advanced filter options' },
      { name: 'Notification system',    description: 'Push notifications and email digest for buyers and sellers' },
    ],
    userFlows: [
      { name: 'Buyer purchases item', steps: ['Search', 'View listing', 'Checkout', 'Pay'], inferred: false },
      { name: 'Seller creates listing', steps: ['Upload photos', 'Set price', 'Publish'], inferred: false },
      { name: 'Admin moderates content', steps: ['Review flagged', 'Approve/reject'], inferred: true },
      { name: 'Dispute resolution', steps: ['File dispute', 'Evidence', 'Admin ruling'], inferred: true },
    ],
    needsAuth:     true,
    needsDatabase: true,
    needsPayments: true,
    isMultiUser:   true,
    _inferenceReport: {
      domain: 'marketplace',
      requirements: makeRequirements(
        ['Buyer', 'Seller', 'Admin', 'Moderator'],
        ['Listing', 'Order', 'Payment', 'Review', 'Message'],
        ['Stripe Connect', 'Algolia', 'Twilio', 'Cloudinary', 'SendGrid']
      ),
      missing: [],
      critical: [],
      mvpAdditions: [],
    },
  };

  const report = buildComplexityReport(intent);

  assert(report.complexityTier === 'production_heavy', `tier is "production_heavy" (got "${report.complexityTier}")`);
  assert(report.totalScore >= 75, `score ${report.totalScore} is in production_heavy range (75+)`);
  assert(report.signals.featureCount === 12, `featureCount is 12 (got ${report.signals.featureCount})`);
  assert(report.signals.roleCount === 4, `roleCount is 4 (got ${report.signals.roleCount})`);
  assert(report.signals.integrationCount === 5, `integrationCount is 5 (got ${report.signals.integrationCount})`);
  assert(report.signals.hasAuth === true, 'hasAuth is true');
  assert(report.signals.hasPayments === true, 'hasPayments is true');
  assert(report.signals.hasAdmin === true, 'hasAdmin is true');
  assert(report.recommendedStrategy.generationMode === 'segmented_multi_pass', `generationMode is "segmented_multi_pass" (got "${report.recommendedStrategy.generationMode}")`);
  assert(report.recommendedStrategy.planningDepth === 'very_deep', `planningDepth is "very_deep" (got "${report.recommendedStrategy.planningDepth}")`);

  const summary = summarizeComplexity(report);
  assert(typeof summary === 'string' && summary.length > 0, 'summarizeComplexity returns non-empty string');
});

// ── 6. Helper function: getComplexityTier ─────────────────────────────────────

describe('Helper — getComplexityTier(score)', () => {
  assert(getComplexityTier(10) === 'simple',           'getComplexityTier(10) === "simple"');
  assert(getComplexityTier(24) === 'simple',           'getComplexityTier(24) === "simple"');
  assert(getComplexityTier(25) === 'medium',           'getComplexityTier(25) === "medium"');
  assert(getComplexityTier(35) === 'medium',           'getComplexityTier(35) === "medium"');
  assert(getComplexityTier(49) === 'medium',           'getComplexityTier(49) === "medium"');
  assert(getComplexityTier(50) === 'advanced',         'getComplexityTier(50) === "advanced"');
  assert(getComplexityTier(60) === 'advanced',         'getComplexityTier(60) === "advanced"');
  assert(getComplexityTier(74) === 'advanced',         'getComplexityTier(74) === "advanced"');
  assert(getComplexityTier(75) === 'production_heavy', 'getComplexityTier(75) === "production_heavy"');
  assert(getComplexityTier(80) === 'production_heavy', 'getComplexityTier(80) === "production_heavy"');
  assert(getComplexityTier(90) === 'production_heavy', 'getComplexityTier(90) === "production_heavy"');
});

// ── 7. mergeComplexityIntoSpec ────────────────────────────────────────────────

describe('Helper — mergeComplexityIntoSpec', () => {
  const intent = {
    appType:   'generic',
    features:  [],
    userFlows: [],
    needsAuth: false,
  };
  const report = buildComplexityReport(intent);
  const merged = mergeComplexityIntoSpec(intent, report);

  assert(merged._complexityReport !== undefined, '_complexityReport attached to merged spec');
  assert(merged._complexityReport === report, '_complexityReport is the same report object');
  assert(merged.appType === 'generic', 'original intent fields preserved');
  assert(merged.features !== undefined, 'features preserved');
});

// ── 8. getGenerationStrategyForComplexity ─────────────────────────────────────

describe('Helper — getGenerationStrategyForComplexity', () => {
  const intent = {
    appType:   'landing-page',
    features:  makeFeatures(['Hero', 'CTA', 'Footer']),
    userFlows: [],
    needsAuth: false,
    needsDatabase: false,
  };
  const report   = buildComplexityReport(intent);
  const strategy = getGenerationStrategyForComplexity(report);

  assert(strategy !== undefined, 'strategy is defined');
  assert(typeof strategy.generationMode === 'string', 'generationMode is a string');
  assert(typeof strategy.suggestedMaxFiles === 'number', 'suggestedMaxFiles is a number');
  assert(typeof strategy.suggestedTokenBudget === 'number', 'suggestedTokenBudget is a number');
  assert(strategy.suggestedTokenBudget > 0, `suggestedTokenBudget > 0 (got ${strategy.suggestedTokenBudget})`);
});

// ── 9. Async: scoreAppComplexity (landing page, LLM disabled) ─────────────────

Promise.resolve().then(async () => {
  describe('Async — scoreAppComplexity (landing page, LLM disabled)', async () => {
    const intent = {
      appType:       'landing-page',
      category:      'Marketing',
      coreEntity:    'Page',
      target:        'Visitors',
      features:      makeFeatures(['Hero section', 'Features overview', 'Contact form']),
      userFlows:     [],
      needsAuth:     false,
      needsDatabase: false,
      needsPayments: false,
      isMultiUser:   false,
    };

    // Ensure LLM refinement is disabled for this test
    const prevEnv = process.env.COMPLEXITY_LLM_ENABLED;
    process.env.COMPLEXITY_LLM_ENABLED = 'false';

    const report = await scoreAppComplexity(intent);

    process.env.COMPLEXITY_LLM_ENABLED = prevEnv || '';

    assert(report !== null && report !== undefined, 'scoreAppComplexity resolves with a report');
    assert(report.complexityTier === 'simple', `async tier is "simple" (got "${report.complexityTier}")`);
    assert(report.totalScore >= 0 && report.totalScore <= 24, `async score ${report.totalScore} is in simple range`);
    assert(report.llmRefined === false, 'llmRefined is false when LLM disabled');
    assert(typeof report.totalScore === 'number', 'totalScore is a number');
    assert(typeof report.confidence === 'number', 'confidence is a number');
    assert(report.confidence >= 0 && report.confidence <= 1, `confidence ${report.confidence} is in 0-1 range`);
  });

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nAll tests passed.');
  }
});
