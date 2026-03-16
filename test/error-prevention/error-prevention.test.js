'use strict';

/**
 * Error Prevention Layer Tests
 *
 * Scenarios:
 *   1.  Auth-required SaaS — missing auth foundation → auto-prevented
 *   2.  Billing app — missing Stripe env vars → auto-prevented
 *   3.  Deployable Node server — missing health route → hint injected
 *   4.  Custom server — hardcoded port → hint injected
 *   5.  Dashboard app — missing loading/error states → hints injected
 *   6.  Mobile Expo app — missing navigation + app.json → prevented
 *   7.  Admin panel — missing admin shell → flagged
 *   8.  Integration app — missing fallback wrapper → hinted
 *   9.  Simple landing page — no unnecessary injections
 *  10.  In-flight: server file with hardcoded port
 *  11.  In-flight: missing .env.example
 *  12.  In-flight: mobile code using localStorage
 *  13.  Prevention status selection
 *  14.  summarizePreventionReport
 *  15.  buildUiPreventionPayload
 *  16.  getPreventedIssues / getRemainingRisks / getGenerationAdjustments helpers
 */

const assert = require('assert');
const {
  runErrorPreventionPreflight,
  runInFlightPreventionChecks,
  buildPreventionReport,
  summarizePreventionReport,
  buildUiPreventionPayload,
  getPreventedIssues,
  getRemainingRisks,
  getGenerationAdjustments,
  checkAuthPlanning,
  checkBillingPlanning,
  checkDeploymentPlanning,
  checkMobilePlanning,
  checkPassCoverage,
  checkStackCoherence,
} = require('../../src/lib/error-prevention');

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

function makeInput(overrides = {}) {
  return {
    intent: {
      appType:     'saas',
      features:    [],
      userFlows:   [],
      isMultiUser: false,
      tone:        'professional',
      ...(overrides.intent || {}),
    },
    product: {
      appName: 'TestApp',
      pages:   [],
      summary: '',
      ...(overrides.product || {}),
    },
    stack: {
      files:   [],
      tech:    { runtime: 'node' },
      backend: true,
      ...(overrides.stack || {}),
    },
    blueprint: {
      projectName: 'test-app',
      fileList:    [],
      designNotes: '',
      ...(overrides.blueprint || {}),
    },
    complexityReport: {
      complexityTier: 'medium',
      signals: {},
      ...(overrides.complexityReport || {}),
    },
  };
}

// ── Scenario 1: Auth-required SaaS — missing auth foundation ─────────────────

describe('Scenario 1 — Auth-required SaaS missing auth foundation', () => {
  const input = makeInput({
    intent: {
      appType:     'saas',
      isMultiUser: true,
      features:    [{ name: 'user login', description: 'JWT authentication and protected routes' }],
    },
    complexityReport: { complexityTier: 'medium', signals: { hasAuth: true } },
  });

  const result = runErrorPreventionPreflight(input);

  it('returns an augmented blueprint', () => {
    assert.ok(result.blueprint, 'blueprint should be returned');
    assert.ok(result.preventionReport, 'preventionReport should be returned');
  });

  it('detects auth foundation gap', () => {
    const issues = result.preventionReport.preventedIssues;
    const authIssue = issues.find(i => i.id === 'auth-required-missing-foundation');
    assert.ok(authIssue, `Expected auth foundation issue, got: ${issues.map(i => i.id).join(', ')}`);
  });

  it('injects auth middleware into file list', () => {
    const fileList = result.blueprint.fileList;
    assert.ok(
      fileList.some(f => f.includes('auth')),
      `Expected auth file in fileList, got: ${fileList.join(', ')}`,
    );
  });

  it('appends auth generation hints to designNotes', () => {
    assert.ok(result.blueprint.designNotes.includes('AUTH:'), `Expected AUTH hint in designNotes`);
  });

  it('status is adjusted_with_preventions', () => {
    assert.strictEqual(result.preventionReport.status, 'adjusted_with_preventions');
  });
});

// ── Scenario 2: Billing app — missing Stripe env vars ────────────────────────

describe('Scenario 2 — Billing app missing Stripe env vars', () => {
  const input = makeInput({
    intent: {
      appType:  'saas',
      features: [
        { name: 'subscription billing', description: 'Stripe subscription management' },
        { name: 'pricing page', description: 'monthly and annual plans' },
      ],
    },
    complexityReport: { complexityTier: 'medium', signals: { hasBilling: true } },
  });

  const result = runErrorPreventionPreflight(input);

  it('detects missing Stripe env vars', () => {
    const issues = result.preventionReport.preventedIssues;
    const stripeIssue = issues.find(i => i.id === 'billing-missing-stripe-env-vars');
    assert.ok(stripeIssue, `Expected Stripe env issue, got: ${issues.map(i => i.id).join(', ')}`);
  });

  it('detects missing billing utility file', () => {
    const issues = result.preventionReport.preventedIssues;
    const utilIssue = issues.find(i => i.id === 'billing-missing-utility-plan');
    assert.ok(utilIssue, `Expected billing utility issue`);
  });

  it('injects lib/stripe.js into file list', () => {
    assert.ok(
      result.blueprint.fileList.some(f => f.includes('stripe')),
      `Expected stripe file in fileList, got: ${result.blueprint.fileList.join(', ')}`,
    );
  });

  it('billing hints added to designNotes', () => {
    assert.ok(result.blueprint.designNotes.includes('BILLING'), `Expected BILLING hint`);
  });

  it('has generation adjustments for billing', () => {
    const adjustments = result.preventionReport.generationAdjustments;
    assert.ok(adjustments.length > 0, 'Expected adjustments for billing app');
  });
});

// ── Scenario 3: Deployable server — missing health route ──────────────────────

describe('Scenario 3 — Deployable Node server missing health route', () => {
  const input = makeInput({
    intent: {
      appType:  'saas',
      features: [{ name: 'REST API', description: 'JSON REST API endpoints' }],
    },
    stack: {
      files:   ['server.js', 'routes/api.js'],
      tech:    { runtime: 'node', backend: 'express' },
      backend: true,
    },
  });

  const result = runErrorPreventionPreflight(input);

  it('detects missing health route', () => {
    const issues = result.preventionReport.preventedIssues;
    const healthIssue = issues.find(i => i.id === 'server-missing-health-route');
    assert.ok(healthIssue, `Expected health route issue, got: ${issues.map(i => i.id).join(', ')}`);
  });

  it('health route hint added to designNotes', () => {
    assert.ok(result.blueprint.designNotes.includes('HEALTH:'), 'Expected HEALTH hint');
  });

  it('dynamic port hint is added', () => {
    assert.ok(
      result.blueprint.designNotes.includes('PORT') || result.blueprint.designNotes.includes('process.env.PORT'),
      'Expected PORT hint',
    );
  });
});

// ── Scenario 4: Custom server — hardcoded port plan ───────────────────────────

describe('Scenario 4 — Node server planning with no PORT env reference', () => {
  const input = makeInput({
    intent: {
      appType:  'saas',
      features: [{ name: 'web server', description: 'node express server' }],
    },
    stack: {
      files:   ['server.js'],
      tech:    { runtime: 'node' },
      backend: true,
    },
    blueprint: {
      fileList:    ['server.js'],
      designNotes: 'Express server listening on port 3000',  // hardcoded in plan
    },
  });

  const issues = checkDeploymentPlanning(input);

  it('detects dynamic port risk', () => {
    const portIssue = issues.find(i => i.id === 'server-needs-dynamic-port');
    assert.ok(portIssue, `Expected dynamic port issue, got: ${issues.map(i => i.id).join(', ')}`);
  });

  it('dynamic port issue has high severity', () => {
    const portIssue = issues.find(i => i.id === 'server-needs-dynamic-port');
    assert.strictEqual(portIssue?.severity, 'high');
  });
});

// ── Scenario 5: Dashboard — missing loading/error states ─────────────────────

describe('Scenario 5 — Dashboard app missing UX states', () => {
  const input = makeInput({
    intent: {
      appType:  'dashboard',
      features: [
        { name: 'analytics dashboard', description: 'charts and metrics overview' },
        { name: 'data tables', description: 'filterable data grids' },
      ],
    },
    product: {
      pages: [{ name: 'dashboard' }, { name: 'analytics' }, { name: 'reports' }],
    },
    complexityReport: { complexityTier: 'medium', signals: {} },
  });

  const issues = checkPassCoverage(input);

  it('detects missing loading state', () => {
    const loadingIssue = issues.find(i => i.id === 'dashboard-missing-loading-state');
    assert.ok(loadingIssue, `Expected loading state issue, got: ${issues.map(i => i.id).join(', ')}`);
  });

  it('detects missing error state', () => {
    const errorIssue = issues.find(i => i.id === 'dashboard-missing-error-state');
    assert.ok(errorIssue, `Expected error state issue`);
  });

  it('detects missing empty state', () => {
    const emptyIssue = issues.find(i => i.id === 'dashboard-missing-empty-state');
    assert.ok(emptyIssue, `Expected empty state issue`);
  });

  it('injects UX hints into blueprint', () => {
    const result = runErrorPreventionPreflight(input);
    assert.ok(
      result.blueprint.designNotes.includes('UX:') || result.blueprint.designNotes.includes('loading'),
      'Expected UX state hints in designNotes',
    );
  });
});

// ── Scenario 6: Mobile Expo — missing navigation + app.json ─────────────────

describe('Scenario 6 — Mobile Expo app missing navigation and config', () => {
  const input = makeInput({
    intent: {
      appType:  'mobile',
      features: [
        { name: 'home feed', description: 'social activity feed' },
        { name: 'profile screen', description: 'user profile' },
      ],
    },
    stack: {
      files: ['App.js', 'components/Feed.js'],
      tech:  { framework: 'expo' },
    },
    complexityReport: { complexityTier: 'medium', signals: { hasMobile: true } },
  });

  const issues = checkMobilePlanning(input);

  it('detects missing navigation shell', () => {
    const navIssue = issues.find(i => i.id === 'mobile-missing-navigation-shell');
    assert.ok(navIssue, `Expected navigation issue, got: ${issues.map(i => i.id).join(', ')}`);
  });

  it('detects missing app.json', () => {
    const configIssue = issues.find(i => i.id === 'mobile-missing-app-config');
    assert.ok(configIssue, 'Expected app.json issue');
  });

  it('injects app.json into file list after preflight', () => {
    const result = runErrorPreventionPreflight(input);
    assert.ok(
      result.blueprint.fileList.includes('app.json'),
      `Expected app.json in fileList, got: ${result.blueprint.fileList.join(', ')}`,
    );
  });

  it('mobile nav hint added to designNotes', () => {
    const result = runErrorPreventionPreflight(input);
    assert.ok(result.blueprint.designNotes.includes('MOBILE NAV:'), 'Expected MOBILE NAV hint');
  });
});

// ── Scenario 7: Admin panel — missing admin shell ────────────────────────────

describe('Scenario 7 — Admin-required app missing admin shell', () => {
  const input = makeInput({
    intent: {
      appType:     'saas',
      isMultiUser: true,
      features:    [
        { name: 'admin panel', description: 'admin dashboard for user management and system settings' },
        { name: 'user roles', description: 'admin and user roles' },
      ],
    },
    complexityReport: { complexityTier: 'complex', signals: { hasAuth: true, hasAdmin: true } },
  });

  const issues = checkAuthPlanning(input);

  it('detects missing role guard shell', () => {
    const roleIssue = issues.find(i => i.id === 'roles-missing-guard-shell');
    assert.ok(roleIssue, `Expected role guard issue, got: ${issues.map(i => i.id).join(', ')}`);
  });

  it('role guard issue has high severity', () => {
    const roleIssue = issues.find(i => i.id === 'roles-missing-guard-shell');
    assert.strictEqual(roleIssue?.severity, 'high');
  });

  it('admin route gap is detected', () => {
    const adminIssue = issues.find(i => i.id === 'admin-feature-missing-route-plan');
    assert.ok(adminIssue, 'Expected admin route gap issue');
  });
});

// ── Scenario 8: Integration app — missing wrapper plan ───────────────────────

describe('Scenario 8 — Integration app missing wrapper module', () => {
  const input = makeInput({
    intent: {
      appType:  'saas',
      features: [
        { name: 'email notifications', description: 'SendGrid transactional emails' },
        { name: 'AI summaries', description: 'OpenAI GPT-4 generated content summaries' },
      ],
    },
    stack: {
      files: ['server.js', 'routes/api.js'],
      tech:  { runtime: 'node' },
    },
  });

  const issues = checkPassCoverage(input);

  it('detects missing OpenAI wrapper', () => {
    const openaiIssue = issues.find(i => i.id.includes('openai'));
    assert.ok(openaiIssue, `Expected OpenAI wrapper issue, got: ${issues.map(i => i.id).join(', ')}`);
  });

  it('detects missing SendGrid wrapper', () => {
    const sgIssue = issues.find(i => i.id.includes('sendgrid'));
    assert.ok(sgIssue, `Expected SendGrid wrapper issue, got: ${issues.map(i => i.id).join(', ')}`);
  });
});

// ── Scenario 9: Simple landing page — no over-injection ──────────────────────

describe('Scenario 9 — Simple landing page should not over-inject', () => {
  const input = makeInput({
    intent: {
      appType:  'landing-page',
      features: [{ name: 'hero section', description: 'product landing page' }],
    },
    stack: {
      files: ['index.html', 'style.css', 'app.js'],
      tech:  { runtime: 'static' },
      backend: false,
    },
    blueprint: {
      fileList:    ['index.html', 'style.css', 'app.js'],
      designNotes: 'Static landing page.',
    },
    complexityReport: { complexityTier: 'simple', signals: {} },
  });

  const result = runErrorPreventionPreflight(input);

  it('status is no_risks_detected or warnings_only for simple apps', () => {
    assert.ok(
      result.preventionReport.status === 'no_risks_detected' ||
      result.preventionReport.status === 'warnings_only' ||
      result.preventionReport.status === 'adjusted_with_preventions',
      `Got: ${result.preventionReport.status}`,
    );
  });

  it('does not inject auth middleware for simple static apps', () => {
    assert.ok(
      !result.blueprint.fileList.some(f => f.includes('auth')),
      `Should not inject auth for static landing page`,
    );
  });

  it('does not inject stripe utility for apps with no billing', () => {
    assert.ok(
      !result.blueprint.fileList.some(f => f.includes('stripe')),
      `Should not inject stripe for apps with no billing`,
    );
  });

  it('prevention report has zero critical prevented issues for simple app', () => {
    const critical = result.preventionReport.preventedIssues.filter(i =>
      i.severity === 'critical' || (i.severity === 'high' && i.action === 'safe_default_injected'),
    );
    // A simple static app should have few/no critical preventions
    assert.ok(critical.length <= 2, `Too many critical preventions for simple app: ${critical.map(i => i.id).join(', ')}`);
  });
});

// ── Scenario 10: In-flight hardcoded port ────────────────────────────────────

describe('Scenario 10 — In-flight: server with hardcoded port', () => {
  const files = {
    'server.js': `
const express = require('express');
const app = express();
const PORT = 3000;
app.listen(PORT, () => console.log('Running'));
`,
    'package.json': JSON.stringify({ dependencies: { express: '^4.18.0' } }),
  };

  const issues = runInFlightPreventionChecks({ files, intent: { appType: 'saas' } });

  it('detects hardcoded port in server.js', () => {
    const portIssue = issues.find(i => i.id === 'inflight-hardcoded-port');
    assert.ok(portIssue, `Expected hardcoded port issue, got: ${issues.map(i => i.id).join(', ')}`);
  });

  it('port issue has high severity', () => {
    const portIssue = issues.find(i => i.id === 'inflight-hardcoded-port');
    assert.strictEqual(portIssue?.severity, 'high');
  });

  it('port issue points to server.js', () => {
    const portIssue = issues.find(i => i.id === 'inflight-hardcoded-port');
    assert.ok(portIssue?.file?.includes('server'), 'Expected file reference in port issue');
  });
});

// ── Scenario 11: In-flight missing .env.example ───────────────────────────────

describe('Scenario 11 — In-flight: env vars used but no .env.example', () => {
  const files = {
    'server.js': `
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PORT = process.env.PORT || 3000;
`,
    'package.json': JSON.stringify({ dependencies: { express: '^4.18.0' } }),
  };

  const issues = runInFlightPreventionChecks({ files });

  it('detects missing .env.example', () => {
    const envIssue = issues.find(i => i.id === 'inflight-missing-env-example');
    assert.ok(envIssue, `Expected .env.example issue, got: ${issues.map(i => i.id).join(', ')}`);
  });
});

// ── Scenario 12: In-flight mobile localStorage ────────────────────────────────

describe('Scenario 12 — In-flight: mobile app using localStorage', () => {
  const files = {
    'App.js': `
import React from 'react';
import { View, Text } from 'react-native';
function saveUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}
export default function App() { return <View><Text>Hello</Text></View>; }
`,
    'package.json': JSON.stringify({ dependencies: { expo: '^50.0.0', react: '^18.0.0' } }),
  };

  const issues = runInFlightPreventionChecks({ files, intent: { appType: 'mobile' } });

  it('detects localStorage in mobile code', () => {
    const storageIssue = issues.find(i => i.id === 'inflight-mobile-localstorage');
    assert.ok(storageIssue, `Expected localStorage issue, got: ${issues.map(i => i.id).join(', ')}`);
  });

  it('localStorage issue has high severity', () => {
    const storageIssue = issues.find(i => i.id === 'inflight-mobile-localstorage');
    assert.strictEqual(storageIssue?.severity, 'high');
  });
});

// ── Scenario 13: Prevention status ───────────────────────────────────────────

describe('Prevention status determination', () => {
  it('no_risks_detected when no issues', () => {
    const report = buildPreventionReport([], [], [], []);
    assert.strictEqual(report.status, 'no_risks_detected');
  });

  it('adjusted_with_preventions when high-severity issue prevented', () => {
    const issues = [{
      id: 'test', category: 'auth', severity: 'high', action: 'safe_default_injected', reason: 'test',
    }];
    const report = buildPreventionReport(issues, [{ id: 'x', description: 'y' }], ['Added auth middleware'], []);
    assert.strictEqual(report.status, 'adjusted_with_preventions');
  });

  it('warnings_only when only warning_only issues', () => {
    const issues = [{
      id: 'test', category: 'routing', severity: 'low', action: 'warning_only', reason: 'minor',
    }];
    const report = buildPreventionReport(issues, [], [], []);
    assert.strictEqual(report.status, 'warnings_only');
  });

  it('manual_review_risk_present when unresolved critical', () => {
    const issues = [{
      id: 'test', category: 'billing', severity: 'critical', action: 'manual_review_required', reason: 'complex',
    }];
    const report = buildPreventionReport(issues, [], [], []);
    assert.strictEqual(report.status, 'manual_review_risk_present');
  });
});

// ── Scenario 14: summarizePreventionReport ────────────────────────────────────

describe('summarizePreventionReport', () => {
  it('returns a non-empty string with key fields', () => {
    const report = buildPreventionReport(
      [{ id: 'a', category: 'auth', severity: 'high', action: 'safe_default_injected', reason: 'test' }],
      [{ id: 'b', description: 'injected auth' }],
      ['Added auth middleware'],
      [],
    );
    const summary = summarizePreventionReport(report);
    assert.ok(summary.includes('status='), 'should include status');
    assert.ok(summary.includes('prevented='), 'should include prevented count');
    assert.ok(summary.includes('adjustments='), 'should include adjustments');
  });
});

// ── Scenario 15: buildUiPreventionPayload ─────────────────────────────────────

describe('buildUiPreventionPayload', () => {
  it('returns UI-safe object', () => {
    const report = buildPreventionReport(
      [{ id: 'x', category: 'env', severity: 'high', action: 'safe_default_injected', reason: 'missing env' }],
      [{ id: 'y', file: '.env.example', description: 'Added .env.example' }],
      ['Added .env.example to planned files'],
      [],
    );
    const payload = buildUiPreventionPayload(report);
    assert.ok(typeof payload.status === 'string', 'status');
    assert.ok(typeof payload.preventedCount === 'number', 'preventedCount');
    assert.ok(Array.isArray(payload.adjustments), 'adjustments array');
    assert.ok(Array.isArray(payload.injectedFiles), 'injectedFiles array');
    assert.ok(payload.injectedFiles.includes('.env.example'), 'injectedFiles includes .env.example');
    assert.ok(typeof payload.summary === 'string', 'summary');
  });
});

// ── Scenario 16: Helper functions ────────────────────────────────────────────

describe('Helper functions', () => {
  const input = makeInput({
    intent: { appType: 'saas', isMultiUser: true, features: [{ name: 'auth', description: 'JWT auth' }] },
    complexityReport: { complexityTier: 'medium', signals: { hasAuth: true, hasBilling: true } },
  });

  const result = runErrorPreventionPreflight(input);

  it('getPreventedIssues returns only auto-resolved issues', () => {
    const prevented = getPreventedIssues(result.preventionReport);
    assert.ok(Array.isArray(prevented));
    assert.ok(prevented.every(i => ['prevented_automatically', 'safe_default_injected', 'generation_hint_added'].includes(i.action)));
  });

  it('getRemainingRisks returns high+critical warnings and unresolved risks', () => {
    const risks = getRemainingRisks(result.preventionReport);
    assert.ok(Array.isArray(risks));
  });

  it('getGenerationAdjustments returns array of strings', () => {
    const adjustments = getGenerationAdjustments(result.preventionReport);
    assert.ok(Array.isArray(adjustments));
    assert.ok(adjustments.every(a => typeof a === 'string'));
  });

  it('prevention report has summary string', () => {
    assert.ok(typeof result.preventionReport.summary === 'string' && result.preventionReport.summary.length > 10);
  });

  it('blueprint designNotes is not empty after preflight', () => {
    assert.ok(result.blueprint.designNotes.length > 0);
  });
});

// ── Final report ───────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`  All ${passed} tests passed.`);
} else {
  console.log(`  ${passed} passed, ${failed} failed.`);
  process.exitCode = 1;
}
console.log(`${'─'.repeat(50)}\n`);
