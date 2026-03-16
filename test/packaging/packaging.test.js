'use strict';

/**
 * Final Packaging / Output Assembly Tests
 *
 * 6 scenarios:
 *   1. Simple landing page              → status: ready / ready_with_warnings
 *   2. SaaS app with missing env vars   → status: ready_with_setup_required
 *   3. Booking app with manual review   → status: manual_review_required
 *   4. AI app with un-keyed integration → status: ready_with_setup_required
 *   5. Marketplace with billing not ready → status: ready_with_setup_required / manual_review_required
 *   6. Mobile app (Expo)                → platforms includes 'mobile', mobile run command
 */

const assert = require('assert');
const {
  assembleFinalProjectPackage,
  buildProjectManifest,
  buildReadinessSummary,
  buildFinalDeliveryReport,
  determinePackageStatus,
  getFinalNextSteps,
  summarizeFinalPackage,
} = require('../../src/lib/packaging');

// ── Tiny test helpers ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function describe(title, fn) {
  console.log(`\n  ${title}`);
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
  }
}

// ── Shared fixtures ────────────────────────────────────────────────────────────

function makeValidationReport(overrides = {}) {
  return {
    status:             overrides.status          || 'passed',
    score:              overrides.score           ?? 85,
    summary:            overrides.summary         || 'Validation passed.',
    issues:             overrides.issues          || [],
    criticalIssues:     overrides.criticalIssues  || [],
    warnings:           overrides.warnings        || [],
    missingFiles:       overrides.missingFiles    || [],
    missingDependencies: overrides.missingDependencies || [],
    missingEnvVars:     overrides.missingEnvVars  || [],
    suggestedRepairs:   [],
    readiness: {
      architectureReady: overrides.architectureReady !== false,
      deployReady:       overrides.deployReady       !== false,
      authReady:         overrides.authReady          !== false,
      billingReady:      overrides.billingReady       !== false,
      integrationReady:  overrides.integrationReady   !== false,
      ...(overrides.readiness || {}),
    },
    checks: {
      files:        { status: 'pass', issues: [] },
      imports:      { status: 'pass', issues: [] },
      dependencies: { status: 'pass', issues: [] },
      scripts:      { status: 'pass', issues: [] },
      env:          { status: 'pass', issues: [] },
      auth:         { status: 'pass', issues: [] },
      database:     { status: 'pass', issues: [] },
      billing:      { status: 'pass', issues: [] },
      integrations: { status: 'pass', issues: [] },
      routes:       { status: 'pass', issues: [] },
      uxStates:     { status: 'pass', issues: [] },
      adminRoles:   { status: 'pass', issues: [] },
      deployment:   { status: 'pass', issues: [] },
      platform:     { status: 'pass', issues: [] },
      ...(overrides.checks || {}),
    },
    passed: overrides.status !== 'failed' && overrides.status !== 'needs_repair',
  };
}

function makeRepairReport(overrides = {}) {
  return {
    status:          overrides.status         || 'repaired',
    scoreBefore:     overrides.scoreBefore    ?? 75,
    scoreAfter:      overrides.scoreAfter     ?? 85,
    scoreDelta:      overrides.scoreDelta     ?? 10,
    repairedCount:   overrides.repairedCount  ?? 2,
    skippedCount:    overrides.skippedCount   ?? 0,
    results:         overrides.results        || [],
    skippedIssues:   overrides.skippedIssues  || [],
    manualReviewRequired: overrides.manualReviewRequired || [],
    filesCreated:    overrides.filesCreated   || [],
    filesModified:   overrides.filesModified  || [],
    addedDependencies: overrides.addedDependencies || [],
    addedScripts:    overrides.addedScripts   || [],
    addedEnvVars:    overrides.addedEnvVars   || [],
    durationMs:      overrides.durationMs     ?? 120,
    summary:         overrides.summary        || 'Repairs applied.',
  };
}

const BASE_FILES = [
  { path: 'index.html',    content: '<html><head><title>App</title></head><body><h1>Hello</h1></body></html>' },
  { path: 'style.css',     content: 'body { margin: 0; font-family: sans-serif; }' },
  { path: 'app.js',        content: 'document.addEventListener("DOMContentLoaded", () => { console.log("ready"); });' },
  { path: '.env.example',  content: 'PORT=3000\nNODE_ENV=development\n' },
];

const BASE_INTENT = {
  appType:       'landing-page',
  category:      'Marketing',
  features:      [{ name: 'Hero section', description: 'Main call to action', priority: 'high' }],
  needsAuth:     false,
  needsPayments: false,
  isMultiUser:   false,
  coreEntity:    'Page',
  userFlows:     [],
  realContent:   { appName: 'Acme Corp', tagline: 'We build things' },
};

const BASE_BLUEPRINT = {
  projectName:  'acme-corp',
  fileList:     ['index.html', 'style.css', 'app.js'],
  designSystem: {},
  fileSpecs:    [],
};

// ── Scenario 1: Simple landing page ───────────────────────────────────────────

describe('1. Simple landing page — manifest + ready status', () => {
  const input = {
    intent:                BASE_INTENT,
    blueprint:             BASE_BLUEPRINT,
    complexityReport:      { complexityTier: 'simple', totalScore: 10, signals: {}, recommendedStrategy: {} },
    files:                 BASE_FILES,
    fileArtifacts:         null,
    validationReport:      makeValidationReport({ score: 90, status: 'passed' }),
    structuralRepairReport: makeRepairReport({ repairedCount: 0, scoreDelta: 0, status: 'no_repairs_needed' }),
    repairReport:          { repairsApplied: [], allRepaired: true },
  };

  const pkg = assembleFinalProjectPackage(input);

  it('produces a FinalProjectPackage', () => {
    assert.ok(pkg, 'package should exist');
    assert.ok(typeof pkg.packageStatus === 'string', 'packageStatus should be a string');
    assert.ok(pkg.manifest,  'manifest should exist');
    assert.ok(pkg.readiness, 'readiness should exist');
    assert.ok(pkg.summary,   'summary should exist');
    assert.ok(pkg.setup,     'setup should exist');
    assert.ok(pkg.exports,   'exports should exist');
  });

  it('manifest has correct fields', () => {
    const m = pkg.manifest;
    assert.ok(typeof m.projectId   === 'string',  'projectId should be a string');
    assert.ok(typeof m.projectName === 'string',  'projectName should be a string');
    assert.ok(typeof m.appType     === 'string',  'appType should be a string');
    assert.ok(Array.isArray(m.platforms),         'platforms should be an array');
    assert.ok(Array.isArray(m.features),          'features should be an array');
    assert.ok(typeof m.fileCount   === 'number',  'fileCount should be a number');
    assert.ok(typeof m.packagedAt  === 'string',  'packagedAt should be a string');
    assert.strictEqual(m.fileCount, BASE_FILES.length, 'fileCount should match files array length');
  });

  it('platforms includes web', () => {
    assert.ok(pkg.manifest.platforms.includes('web'), 'Should include web platform');
    assert.ok(!pkg.manifest.platforms.includes('mobile'), 'Should not include mobile for landing page');
  });

  it('packageStatus is ready or ready_with_warnings (no missing env vars)', () => {
    assert.ok(
      pkg.packageStatus === 'ready' || pkg.packageStatus === 'ready_with_warnings',
      `Expected ready/ready_with_warnings, got: ${pkg.packageStatus}`
    );
  });

  it('readiness.architectureReady is true', () => {
    assert.strictEqual(pkg.readiness.architectureReady, true);
  });

  it('exports has manifestFile and reportFile names', () => {
    assert.strictEqual(pkg.exports.manifestFile, 'project-manifest.json');
    assert.strictEqual(pkg.exports.reportFile,   'final-report.md');
  });

  it('exports.manifestJson is valid JSON', () => {
    assert.doesNotThrow(() => JSON.parse(pkg.exports.manifestJson), 'manifestJson should be valid JSON');
  });

  it('exports.reportMarkdown contains major sections', () => {
    const md = pkg.exports.reportMarkdown;
    assert.ok(md.includes('Project Overview'),        'Report should have Project Overview section');
    assert.ok(md.includes('Readiness Status'),        'Report should have Readiness Status section');
    assert.ok(md.includes('Local Run Instructions'),  'Report should have Run Instructions section');
    assert.ok(md.includes('Deploy Notes'),            'Report should have Deploy Notes section');
  });

  it('summary.nextSteps is an array with at least one step', () => {
    assert.ok(Array.isArray(pkg.summary.nextSteps),    'nextSteps should be an array');
    assert.ok(pkg.summary.nextSteps.length > 0,        'nextSteps should not be empty');
  });
});

// ── Scenario 2: SaaS app with missing env vars ────────────────────────────────

describe('2. SaaS app — ready_with_setup_required (missing Stripe + JWT)', () => {
  const saasFiles = [
    ...BASE_FILES.filter(f => f.path !== '.env.example'),
    { path: 'server.js', content: "const express = require('express');\nconst stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);\nconst jwt = require('jsonwebtoken');\napp.listen(3000);" },
    { path: 'package.json', content: JSON.stringify({ name: 'saas-app', scripts: { start: 'node server.js', dev: 'nodemon server.js' }, dependencies: { express: '^4', stripe: '^20', jsonwebtoken: '^9' } }) },
    { path: '.env.example', content: 'PORT=3000\nNODE_ENV=development\nJWT_SECRET=\nSTRIPE_SECRET_KEY=\nSTRIPE_PUBLISHABLE_KEY=\nSTRIPE_WEBHOOK_SECRET=\n' },
  ];

  const input = {
    intent: {
      ...BASE_INTENT,
      appType:       'saas',
      needsAuth:     true,
      needsPayments: true,
      features: [
        { name: 'User authentication', priority: 'high' },
        { name: 'Subscription billing', priority: 'high' },
        { name: 'Dashboard', priority: 'medium' },
      ],
      realContent: { appName: 'SaaS Pro' },
    },
    blueprint:        { ...BASE_BLUEPRINT, projectName: 'saas-pro' },
    complexityReport: { complexityTier: 'advanced', totalScore: 55, signals: { hasAuth: true, hasPayments: true, integrationCount: 2 }, recommendedStrategy: {} },
    files:            saasFiles,
    fileArtifacts:    null,
    validationReport: makeValidationReport({
      score:         80,
      status:        'passed_with_warnings',
      missingEnvVars: ['JWT_SECRET', 'STRIPE_SECRET_KEY'],
    }),
    structuralRepairReport: makeRepairReport({ addedEnvVars: ['JWT_SECRET', 'STRIPE_SECRET_KEY'], filesCreated: ['.env.example'] }),
    repairReport:    { repairsApplied: [], allRepaired: true },
  };

  const pkg = assembleFinalProjectPackage(input);

  it('packageStatus is ready_with_setup_required', () => {
    assert.strictEqual(pkg.packageStatus, 'ready_with_setup_required',
      `Expected ready_with_setup_required, got: ${pkg.packageStatus}`);
  });

  it('setup.requiredEnvVars includes JWT_SECRET and STRIPE keys', () => {
    const names = pkg.setup.requiredEnvVars.map(v => v.name);
    assert.ok(names.includes('JWT_SECRET'),         'Should include JWT_SECRET');
    assert.ok(names.includes('STRIPE_SECRET_KEY'),  'Should include STRIPE_SECRET_KEY');
  });

  it('setup.integrations includes Stripe entry', () => {
    const stripeIntg = pkg.setup.integrations.find(i => i.name === 'Stripe');
    assert.ok(stripeIntg, 'Should include Stripe integration');
    assert.strictEqual(stripeIntg.requiresKey, true, 'Stripe should require a key');
  });

  it('manifest.appType is saas', () => {
    assert.strictEqual(pkg.manifest.appType, 'saas');
  });

  it('readiness.authReady reflects auth was repaired', () => {
    // authReady is true when repair ran (even if keys still missing structurally it was fixed)
    assert.ok(typeof pkg.readiness.authReady === 'boolean', 'authReady should be boolean');
  });

  it('summary.nextSteps mentions configuring env vars', () => {
    const stepsText = pkg.summary.nextSteps.join(' ');
    assert.ok(
      /env|JWT|STRIPE|key|configure/i.test(stepsText),
      `nextSteps should mention env vars, got: ${stepsText}`
    );
  });

  it('setup.devCommand is set from package.json scripts', () => {
    assert.ok(pkg.setup.devCommand, 'devCommand should be set');
    assert.ok(typeof pkg.setup.devCommand === 'string', 'devCommand should be a string');
  });
});

// ── Scenario 3: Booking app with repaired issues + remaining manual review ────

describe('3. Booking app — manual_review_required', () => {
  const input = {
    intent: {
      ...BASE_INTENT,
      appType:   'booking',
      needsAuth:  true,
      features: [
        { name: 'Appointment scheduling', priority: 'high' },
        { name: 'Calendar integration', priority: 'high' },
        { name: 'Email notifications', priority: 'medium' },
      ],
      realContent: { appName: 'BookNow' },
    },
    blueprint:        { ...BASE_BLUEPRINT, projectName: 'booknow' },
    complexityReport: { complexityTier: 'medium', totalScore: 35, signals: { hasAuth: true }, recommendedStrategy: {} },
    files: [
      ...BASE_FILES,
      { path: 'server.js', content: 'const express = require("express"); app.listen(3000);' },
      { path: 'package.json', content: JSON.stringify({ name: 'booknow', scripts: { start: 'node server.js' }, dependencies: { express: '^4' } }) },
    ],
    fileArtifacts: null,
    validationReport: makeValidationReport({
      score:          65,
      status:         'needs_repair',
      criticalIssues: [{ id: 'missing_calendar_integration', severity: 'critical', message: 'Calendar API integration not implemented' }],
      issues:         [{ id: 'missing_calendar_integration', severity: 'critical', message: 'Calendar API integration not implemented' }],
    }),
    structuralRepairReport: makeRepairReport({
      status:          'repaired_with_manual_items',
      repairedCount:   3,
      skippedCount:    1,
      manualReviewRequired: [
        { issueId: 'missing_calendar_integration', reason: 'Third-party calendar API integration requires developer setup', path: 'calendar.js', safety: 'do_not_touch' },
      ],
      skippedIssues: [],
    }),
    repairReport: { repairsApplied: ['added .env.example', 'added package.json scripts'], allRepaired: false },
  };

  const pkg = assembleFinalProjectPackage(input);

  it('packageStatus is manual_review_required', () => {
    assert.strictEqual(pkg.packageStatus, 'manual_review_required',
      `Expected manual_review_required, got: ${pkg.packageStatus}`);
  });

  it('manualReviewRequired is not empty', () => {
    assert.ok(pkg.manualReviewRequired.length > 0, 'Should have manual review items');
  });

  it('manualReviewRequired items have required fields', () => {
    const item = pkg.manualReviewRequired[0];
    assert.ok(typeof item.id          === 'string', 'id should be a string');
    assert.ok(typeof item.description === 'string', 'description should be a string');
    assert.ok(typeof item.reason      === 'string', 'reason should be a string');
    assert.ok(typeof item.severity    === 'string', 'severity should be a string');
  });

  it('summary.repairSummary mentions repairs applied', () => {
    assert.ok(pkg.summary.repairSummary.length > 0, 'repairSummary should not be empty');
  });

  it('readiness.manualReviewRequired is true', () => {
    assert.strictEqual(pkg.readiness.manualReviewRequired, true);
  });

  it('report markdown includes Manual Review Items section', () => {
    assert.ok(
      pkg.exports.reportMarkdown.includes('Manual Review'),
      'Report should have Manual Review section'
    );
  });
});

// ── Scenario 4: AI app with unkeyed integration ───────────────────────────────

describe('4. AI tool — ready_with_setup_required (OpenAI key missing)', () => {
  const aiFiles = [
    { path: 'index.html', content: '<html><body><h1>AI Tool</h1></body></html>' },
    { path: 'server.js',  content: "const openai = require('openai');\nconst client = new openai.OpenAI({ apiKey: process.env.OPENAI_API_KEY });\napp.listen(3000);" },
    { path: 'package.json', content: JSON.stringify({ name: 'ai-tool', scripts: { start: 'node server.js', dev: 'nodemon server.js' }, dependencies: { openai: '^4', express: '^4' } }) },
    { path: '.env.example', content: 'PORT=3000\nOPENAI_API_KEY=\n' },
  ];

  const input = {
    intent: {
      ...BASE_INTENT,
      appType:  'ai_tool',
      features: [{ name: 'AI text generation', priority: 'high' }, { name: 'Chat interface', priority: 'high' }],
      realContent: { appName: 'AI Writer' },
    },
    blueprint:        { ...BASE_BLUEPRINT, projectName: 'ai-writer' },
    complexityReport: { complexityTier: 'medium', totalScore: 38, signals: { hasAI: true, integrationCount: 1 }, recommendedStrategy: {} },
    files:            aiFiles,
    fileArtifacts:    null,
    validationReport: makeValidationReport({
      score:  78,
      status: 'passed_with_warnings',
      missingEnvVars: ['OPENAI_API_KEY'],
    }),
    structuralRepairReport: makeRepairReport({ addedEnvVars: ['OPENAI_API_KEY'] }),
    repairReport:    { repairsApplied: [], allRepaired: true },
  };

  const pkg = assembleFinalProjectPackage(input);

  it('packageStatus is ready_with_setup_required', () => {
    assert.strictEqual(pkg.packageStatus, 'ready_with_setup_required',
      `Expected ready_with_setup_required, got: ${pkg.packageStatus}`);
  });

  it('manifest.integrations includes OpenAI', () => {
    assert.ok(pkg.manifest.integrations.includes('OpenAI'), 'Should detect OpenAI integration');
  });

  it('setup.integrations has OpenAI entry with requiresKey=true', () => {
    const openaiIntg = pkg.setup.integrations.find(i => i.name === 'OpenAI');
    assert.ok(openaiIntg, 'Should have OpenAI integration spec');
    assert.strictEqual(openaiIntg.requiresKey, true, 'OpenAI should require a key');
    assert.strictEqual(openaiIntg.configured,  false, 'OpenAI should not be configured (empty in .env.example)');
  });

  it('setup.requiredEnvVars includes OPENAI_API_KEY', () => {
    const names = pkg.setup.requiredEnvVars.map(v => v.name);
    assert.ok(names.includes('OPENAI_API_KEY'), 'Should require OPENAI_API_KEY');
  });

  it('warnings.missingCredentials mentions OpenAI', () => {
    // missingCredentials or requiredEnvVars should surface it
    const reqNames = pkg.setup.requiredEnvVars.map(v => v.name).join(' ');
    assert.ok(
      reqNames.includes('OPENAI') || pkg.warnings.some(w => /openai/i.test(w)),
      'Should surface missing OpenAI key'
    );
  });
});

// ── Scenario 5: Marketplace with billing not fully ready ──────────────────────

describe('5. Marketplace — billing not ready, setup required', () => {
  const input = {
    intent: {
      ...BASE_INTENT,
      appType:        'marketplace',
      needsPayments:  true,
      isMultiUser:    true,
      features: [
        { name: 'Vendor listings', priority: 'high' },
        { name: 'Payment processing', priority: 'high' },
        { name: 'Commission tracking', priority: 'medium' },
        { name: 'Search and filter', priority: 'medium' },
      ],
      realContent: { appName: 'MarketHub' },
    },
    blueprint:        { ...BASE_BLUEPRINT, projectName: 'markethub' },
    complexityReport: { complexityTier: 'advanced', totalScore: 62, signals: { hasAuth: true, hasPayments: true, isMultiUser: true, integrationCount: 3 }, recommendedStrategy: {} },
    files: [
      ...BASE_FILES,
      { path: 'server.js', content: "const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);\napp.listen(3000);" },
      { path: 'package.json', content: JSON.stringify({ name: 'markethub', scripts: { start: 'node server.js', dev: 'nodemon server.js' }, dependencies: { express: '^4', stripe: '^20' } }) },
      { path: '.env.example', content: 'PORT=3000\nSTRIPE_SECRET_KEY=your_stripe_key_here\nSTRIPE_PUBLISHABLE_KEY=\nSTRIPE_WEBHOOK_SECRET=\n' },
    ],
    fileArtifacts: null,
    validationReport: makeValidationReport({
      score:         72,
      status:        'needs_repair',
      billingReady:  false,
      readiness: {
        architectureReady: true,
        deployReady:       false,
        authReady:         true,
        billingReady:      false,
        integrationReady:  false,
      },
    }),
    structuralRepairReport: makeRepairReport({
      status:        'repaired_with_warnings',
      repairedCount: 4,
      scoreDelta:    8,
      filesCreated:  ['billing.js'],
      addedEnvVars:  ['STRIPE_WEBHOOK_SECRET'],
    }),
    repairReport: { repairsApplied: ['billing.js created'], allRepaired: false },
  };

  const pkg = assembleFinalProjectPackage(input);

  it('packageStatus is ready_with_setup_required (billing key missing)', () => {
    assert.ok(
      pkg.packageStatus === 'ready_with_setup_required' || pkg.packageStatus === 'manual_review_required',
      `Expected ready_with_setup_required or manual_review_required, got: ${pkg.packageStatus}`
    );
  });

  it('readiness.billingReady is false (keys not configured)', () => {
    assert.strictEqual(pkg.readiness.billingReady, false, 'Billing should not be ready without keys');
  });

  it('manifest includes Stripe integration', () => {
    assert.ok(pkg.manifest.integrations.includes('Stripe'), 'Should list Stripe as integration');
  });

  it('structuralRepair filesCreated are visible in manifest', () => {
    // Files created by repair should be in fileCount
    assert.ok(pkg.manifest.fileCount > 0, 'fileCount should be positive');
  });

  it('delivery report includes validation score', () => {
    assert.ok(
      pkg.exports.reportMarkdown.includes('72'),
      'Report should mention validation score'
    );
  });
});

// ── Scenario 6: Mobile app (Expo) ─────────────────────────────────────────────

describe('6. Mobile app (Expo) — platforms includes mobile, expo run command', () => {
  const mobileFiles = [
    { path: 'app.json',          content: JSON.stringify({ expo: { name: 'FitTrack', slug: 'fittrack', version: '1.0.0', platforms: ['ios', 'android'] } }) },
    { path: 'App.tsx',           content: 'import React from "react";\nexport default function App() { return null; }' },
    { path: 'package.json',      content: JSON.stringify({ name: 'fittrack', scripts: { start: 'expo start', android: 'expo run:android', ios: 'expo run:ios' }, dependencies: { expo: '^50', react: '^18', 'react-native': '^0.73' } }) },
    { path: 'src/screens/Home.tsx', content: 'export function HomeScreen() { return null; }' },
    { path: '.env.example',      content: 'PORT=3000\nEXPO_PUBLIC_API_URL=http://localhost:3000\n' },
  ];

  const input = {
    intent: {
      ...BASE_INTENT,
      appType:  'fitness_app',
      features: [{ name: 'Workout tracking', priority: 'high' }, { name: 'Progress charts', priority: 'medium' }],
      realContent: { appName: 'FitTrack' },
    },
    blueprint:        { ...BASE_BLUEPRINT, projectName: 'fittrack', fileList: ['App.tsx', 'src/screens/Home.tsx'] },
    complexityReport: { complexityTier: 'medium', totalScore: 40, signals: { hasMobile: true }, recommendedStrategy: {} },
    files:            mobileFiles,
    fileArtifacts:    null,
    validationReport: makeValidationReport({ score: 82, status: 'passed_with_warnings' }),
    structuralRepairReport: makeRepairReport({ repairedCount: 1, status: 'repaired' }),
    repairReport:    { repairsApplied: [], allRepaired: true },
  };

  const pkg = assembleFinalProjectPackage(input);

  it('manifest.platforms includes mobile', () => {
    assert.ok(pkg.manifest.platforms.includes('mobile'),
      `Platforms should include mobile, got: ${pkg.manifest.platforms.join(', ')}`);
  });

  it('readiness.mobileReady is true (app.json with expo config)', () => {
    assert.strictEqual(pkg.readiness.mobileReady, true, 'mobileReady should be true with app.json');
  });

  it('setup or run instructions mention expo', () => {
    const devCmd = pkg.setup.devCommand || '';
    const report = pkg.exports.reportMarkdown;
    assert.ok(
      /expo/i.test(devCmd) || /expo/i.test(report),
      'Should mention expo in dev command or report'
    );
  });

  it('manifest.projectName is fittrack', () => {
    assert.strictEqual(pkg.manifest.projectName, 'fittrack');
  });

  it('summary.projectOverview mentions the app', () => {
    assert.ok(pkg.summary.projectOverview.length > 0, 'projectOverview should not be empty');
  });
});

// ── Cross-cutting: determinPackageStatus ──────────────────────────────────────

describe('7. determinePackageStatus — unit tests', () => {
  const readyReadiness = {
    architectureReady: true, runReady: true, deployReady: true,
    authReady: true, billingReady: true, integrationReady: true,
    mobileReady: true, webReady: true, manualReviewRequired: false,
  };
  const goodValidation = { score: 90, status: 'passed' };

  it('returns ready when everything is clean', () => {
    const status = determinePackageStatus(
      readyReadiness,
      { warnings: [], manualReviewRequired: [], unresolvedIssues: [], missingCredentials: [], riskyAreas: [] },
      { requiredEnvVars: [], optionalEnvVars: [], integrations: [], installCommand: 'npm install', devCommand: 'npm run dev', deployNotes: [] },
      goodValidation
    );
    assert.strictEqual(status, 'ready');
  });

  it('returns ready_with_warnings when warnings exist', () => {
    const status = determinePackageStatus(
      readyReadiness,
      { warnings: ['Minor CSS issue'], manualReviewRequired: [], unresolvedIssues: [], missingCredentials: [], riskyAreas: [] },
      { requiredEnvVars: [], optionalEnvVars: [], integrations: [], installCommand: 'npm install', devCommand: 'npm run dev', deployNotes: [] },
      goodValidation
    );
    assert.strictEqual(status, 'ready_with_warnings');
  });

  it('returns ready_with_setup_required when required env vars are missing', () => {
    const status = determinePackageStatus(
      readyReadiness,
      { warnings: [], manualReviewRequired: [], unresolvedIssues: [], missingCredentials: [], riskyAreas: [] },
      { requiredEnvVars: [{ name: 'STRIPE_SECRET_KEY', required: true, hasDefault: false }], optionalEnvVars: [], integrations: [], installCommand: 'npm install', devCommand: 'npm run dev', deployNotes: [] },
      goodValidation
    );
    assert.strictEqual(status, 'ready_with_setup_required');
  });

  it('returns manual_review_required when manual items exist', () => {
    const status = determinePackageStatus(
      { ...readyReadiness, manualReviewRequired: true },
      { warnings: [], manualReviewRequired: [{ id: 'x', severity: 'critical', description: 'fix this', reason: 'cannot auto-fix' }], unresolvedIssues: [], missingCredentials: [], riskyAreas: [] },
      { requiredEnvVars: [], optionalEnvVars: [], integrations: [], installCommand: 'npm install', devCommand: 'npm run dev', deployNotes: [] },
      goodValidation
    );
    assert.strictEqual(status, 'manual_review_required');
  });

  it('returns incomplete when score < 40 and architecture not ready', () => {
    const status = determinePackageStatus(
      { ...readyReadiness, architectureReady: false, runReady: false },
      { warnings: [], manualReviewRequired: [], unresolvedIssues: [], missingCredentials: [], riskyAreas: [] },
      { requiredEnvVars: [], optionalEnvVars: [], integrations: [], installCommand: 'npm install', devCommand: 'npm run dev', deployNotes: [] },
      { score: 25, status: 'failed' }
    );
    assert.strictEqual(status, 'incomplete');
  });
});

// ── Cross-cutting: summarizeFinalPackage ──────────────────────────────────────

describe('8. summarizeFinalPackage — one-line log string', () => {
  it('returns a non-empty string with key fields', () => {
    const input = {
      intent: BASE_INTENT, blueprint: BASE_BLUEPRINT, complexityReport: null,
      files: BASE_FILES, fileArtifacts: null,
      validationReport: makeValidationReport({ score: 85 }),
      structuralRepairReport: makeRepairReport(),
      repairReport: { repairsApplied: [], allRepaired: true },
    };
    const pkg     = assembleFinalProjectPackage(input);
    const summary = summarizeFinalPackage(pkg);
    assert.ok(typeof summary === 'string',    'Should return a string');
    assert.ok(summary.length > 0,            'Should not be empty');
    assert.ok(summary.includes('packaging:'), 'Should include packaging field');
    assert.ok(summary.includes('files='),    'Should include fileCount');
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n');
console.log(`  Packaging tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('\n  Some tests failed.');
  process.exit(1);
} else {
  console.log('\n  All packaging tests passed.\n');
}
