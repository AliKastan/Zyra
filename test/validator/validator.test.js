'use strict';

/**
 * Generation Validator tests.
 * Run with: node test/validator/validator.test.js
 * No external test runner required.
 */

const {
  validateGeneratedProject,
  getCriticalValidationIssues,
  getSuggestedRepairs,
  getReadinessSummary,
  summarizeValidationReport,
} = require('../../src/lib/validator');

// ── Minimal test harness ──────────────────────────────────────────────────────

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

function makeIntent(overrides = {}) {
  return {
    appType:       'generic',
    category:      'Web application',
    coreEntity:    'Item',
    features:      [],
    userFlows:     [],
    needsAuth:     false,
    needsDatabase: false,
    needsPayments: false,
    isMultiUser:   false,
    integrations:  [],
    ...overrides,
  };
}

function makeBlueprint(overrides = {}) {
  return {
    projectName: 'test-app',
    fileList:    ['index.html', 'style.css', 'app.js'],
    fileSpecs:   [
      { path: 'index.html', description: 'Main page' },
      { path: 'style.css',  description: 'Stylesheet' },
      { path: 'app.js',     description: 'App logic' },
    ],
    cssComponents: [],
    ...overrides,
  };
}

// ── 1. Valid simple landing page ──────────────────────────────────────────────

describe('Valid simple landing page — should pass with high score', () => {
  const files = [
    { path: 'index.html', content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Landing</title><link href="style.css" rel="stylesheet"></head><body><h1>Welcome</h1><script src="app.js"></script></body></html>` },
    { path: 'style.css',  content: `.container { max-width: 1200px; margin: 0 auto; padding: 16px; } h1 { color: #333; } @media (max-width: 640px) { .container { padding: 8px; } } .btn { display: inline-block; padding: 8px 16px; }` },
    { path: 'app.js',     content: `'use strict';\ndocument.addEventListener('DOMContentLoaded', () => { console.log('ready'); });` },
  ];
  const input = { files, blueprint: makeBlueprint(), intent: makeIntent(), complexityReport: null };
  const report = validateGeneratedProject(input);

  assert(report.score >= 70, `score ≥ 70 (got ${report.score})`);
  assert(report.status !== 'failed', `status is not failed (got "${report.status}")`);
  assert(report.criticalIssues.length === 0, 'no critical issues');
  assert(report.readiness.architectureReady, 'architectureReady is true');
  assert(report.readiness.authReady, 'authReady is true (auth not required)');
  assert(report.readiness.billingReady, 'billingReady is true (billing not required)');
  assert(typeof report.summary === 'string' && report.summary.length > 0, 'summary is non-empty string');
  assert(Array.isArray(report.issues), 'issues is an array');
  assert(Array.isArray(report.suggestedRepairs), 'suggestedRepairs is an array');
});

// ── 2. Booking app missing auth file ─────────────────────────────────────────

describe('Booking app missing auth file — critical auth issue', () => {
  const files = [
    { path: 'index.html',    content: `<!DOCTYPE html><html><head><title>Book</title><link href="style.css" rel="stylesheet"></head><body><a href="dashboard.html">Dashboard</a><script src="app.js"></script></body></html>` },
    { path: 'dashboard.html',content: `<!DOCTYPE html><html><head><title>Dashboard</title><link href="style.css" rel="stylesheet"></head><body><h1>Dashboard</h1><script src="app.js"></script></body></html>` },
    { path: 'style.css',     content: `.container { max-width: 1200px; } @media (max-width: 640px) {}` },
    { path: 'app.js',        content: `'use strict';\ndocument.addEventListener('DOMContentLoaded', () => { fetch('/api/bookings').then(r => r.json()).catch(e => console.error(e)); });` },
    // NOTE: No auth.js, no login.html, no signup.html
  ];
  const blueprint = makeBlueprint({
    fileList: ['index.html', 'dashboard.html', 'style.css', 'app.js'],
    fileSpecs: [
      { path: 'index.html',     description: 'Landing page' },
      { path: 'dashboard.html', description: 'Dashboard' },
      { path: 'style.css',      description: 'Stylesheet' },
      { path: 'app.js',         description: 'App logic' },
    ],
  });
  const intent = makeIntent({ appType: 'booking', needsAuth: true, needsDatabase: true });
  const report = validateGeneratedProject({ files, blueprint, intent, complexityReport: null });

  assert(report.criticalIssues.length > 0, 'has at least one critical issue');
  const authIssue = report.issues.find(i => i.id === 'missing_auth_file');
  assert(authIssue !== undefined, 'missing_auth_file issue detected');
  assert(authIssue?.severity === 'critical', 'missing_auth_file is critical severity');
  assert(report.readiness.authReady === false, 'authReady is false');
  assert(report.status === 'needs_repair' || report.status === 'failed', `status indicates repair needed (got "${report.status}")`);
  assert(report.suggestedRepairs.length > 0, 'suggestedRepairs are present');
});

// ── 3. SaaS app — billing.js exists but no webhook ────────────────────────────

describe('SaaS app missing Stripe webhook — major billing issue', () => {
  const files = [
    { path: 'index.html',  content: `<!DOCTYPE html><html><head><title>SaaS</title><link href="style.css" rel="stylesheet"></head><body><script src="app.js"></script></body></html>` },
    { path: 'style.css',   content: `.btn { color: red; } @media (max-width: 640px) {}` },
    { path: 'app.js',      content: `'use strict';\ndocument.addEventListener('DOMContentLoaded', () => {});` },
    { path: 'billing.js',  content: `'use strict';\nconst stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);\nasync function createCheckoutSession(priceId) {\n  return stripe.checkout.sessions.create({ mode: 'subscription', line_items: [{ price: priceId, quantity: 1 }] });\n}\nmodule.exports = { createCheckoutSession };` },
    // No webhook handler
    { path: '.env.example', content: 'STRIPE_SECRET_KEY=sk_test_...\nSTRIPE_PUBLISHABLE_KEY=pk_test_...\n' },
  ];
  const blueprint = makeBlueprint({
    fileList: ['index.html', 'style.css', 'app.js', 'billing.js'],
  });
  const intent = makeIntent({ appType: 'saas', needsPayments: true, needsAuth: false });
  const report = validateGeneratedProject({ files, blueprint, intent, complexityReport: null });

  const webhookIssue = report.issues.find(i => i.id === 'missing_billing_webhook');
  assert(webhookIssue !== undefined, 'missing_billing_webhook issue detected');
  assert(webhookIssue?.severity === 'major', 'missing_billing_webhook is major severity');
  assert(report.readiness.billingReady === false, 'billingReady is false');

  // Checkout session is present — should NOT flag missing_checkout_flow
  const checkoutIssue = report.issues.find(i => i.id === 'missing_checkout_flow');
  assert(checkoutIssue === undefined, 'checkout_flow is NOT flagged (it exists)');
});

// ── 4. AI app — OPENAI_API_KEY used but not in .env.example ──────────────────

describe('AI app missing provider env vars — medium env issue', () => {
  const files = [
    { path: 'index.html',   content: `<!DOCTYPE html><html><head><title>AI Tool</title><link href="style.css" rel="stylesheet"></head><body><script src="app.js"></script></body></html>` },
    { path: 'style.css',    content: `.container { padding: 16px; } @media (max-width:640px) {}` },
    { path: 'app.js',       content: `'use strict';\ndocument.addEventListener('DOMContentLoaded', () => {});` },
    { path: 'ai-service.js',content: `'use strict';\nconst OpenAI = require('openai');\nconst client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });\nasync function generate(prompt) {\n  return client.chat.completions.create({ model: 'gpt-4', messages: [{ role: 'user', content: prompt }] });\n}\nmodule.exports = { generate };` },
    { path: '.env.example', content: 'PORT=3000\n# Add API keys here\n' }, // OPENAI_API_KEY missing
  ];
  const blueprint = makeBlueprint({ fileList: ['index.html', 'style.css', 'app.js', 'ai-service.js'] });
  const intent = makeIntent({ appType: 'ai_tool', needsDatabase: false });
  const report = validateGeneratedProject({ files, blueprint, intent, complexityReport: null });

  const envIssue = report.issues.find(i => i.id === 'undeclared_env_var:OPENAI_API_KEY');
  assert(envIssue !== undefined, 'undeclared_env_var:OPENAI_API_KEY detected');
  assert(envIssue?.severity === 'medium', 'OPENAI_API_KEY env issue is medium severity');
  assert(report.missingEnvVars.includes('OPENAI_API_KEY'), 'missingEnvVars includes OPENAI_API_KEY');
});

// ── 5. Dashboard app with broken import ───────────────────────────────────────

describe('Dashboard app with broken imports — major import issue', () => {
  const files = [
    { path: 'index.html',  content: `<!DOCTYPE html><html><head><title>Dashboard</title><link href="style.css" rel="stylesheet"></head><body><script src="app.js"></script></body></html>` },
    { path: 'style.css',   content: `.card { padding: 16px; } @media (max-width:640px) {}` },
    { path: 'app.js',      content: `'use strict';\nconst charts = require('./charts.js');\n// charts.js does NOT exist\ndocument.addEventListener('DOMContentLoaded', () => { charts.render(); });` },
    // NOTE: charts.js is NOT in the files array
  ];
  const blueprint = makeBlueprint({ fileList: ['index.html', 'style.css', 'app.js'] });
  const intent = makeIntent({ appType: 'dashboard' });
  const report = validateGeneratedProject({ files, blueprint, intent, complexityReport: null });

  const importIssue = report.issues.find(i => i.id && i.id.includes('charts.js'));
  assert(importIssue !== undefined, `broken import to charts.js is detected`);
  assert(importIssue?.severity === 'major', 'broken import is major severity');
  assert(report.checks.imports.status === 'fail', 'imports check status is fail');
  assert(report.readiness.architectureReady === false, 'architectureReady is false due to broken import');
});

// ── 6. Mobile app missing NavigationContainer ─────────────────────────────────

describe('Mobile app missing navigation wiring — major platform issue', () => {
  const files = [
    { path: 'App.js',               content: `'use strict';\nimport React from 'react';\nimport { View, Text } from 'react-native';\nexport default function App() { return <View><Text>Hello</Text></View>; }` },
    { path: 'screens/HomeScreen.js',content: `import React from 'react';\nimport { View, Text } from 'react-native';\nexport default function HomeScreen() { return <View><Text>Home</Text></View>; }` },
    { path: 'app.json',             content: JSON.stringify({ expo: { name: 'MyApp', slug: 'my-app', version: '1.0.0' } }) },
    // NavigationContainer is NOT used — no navigation wiring
  ];
  const blueprint = makeBlueprint({ fileList: ['App.js', 'screens/HomeScreen.js', 'app.json'] });
  const intent = makeIntent({ appType: 'mobile' });
  const complexityReport = { totalScore: 30, complexityTier: 'medium', signals: { hasMobile: true } };
  const report = validateGeneratedProject({ files, blueprint, intent, complexityReport });

  const navIssue = report.issues.find(i => i.id === 'missing_navigation_container');
  assert(navIssue !== undefined, 'missing_navigation_container issue detected');
  assert(navIssue?.severity === 'major', 'missing navigation is major severity');
  assert(report.checks.platform.status === 'fail', 'platform check status is fail');
});

// ── 7. Web app missing health route ───────────────────────────────────────────

describe('Web app missing health route — medium deployment issue', () => {
  const files = [
    { path: 'server.js',   content: `'use strict';\nconst express = require('express');\nconst app = express();\napp.get('/', (req, res) => res.send('OK'));\napp.listen(process.env.PORT || 3000);\n// No /health route` },
    { path: 'index.html',  content: `<!DOCTYPE html><html><head><title>App</title><link href="style.css" rel="stylesheet"></head><body><script src="app.js"></script></body></html>` },
    { path: 'style.css',   content: `.container { padding: 16px; } @media (max-width:640px) {}` },
    { path: 'app.js',      content: `'use strict';\ndocument.addEventListener('DOMContentLoaded', () => {});` },
    { path: '.env.example',content: 'PORT=3000\n' },
    { path: 'package.json',content: JSON.stringify({ name: 'my-app', scripts: { start: 'node server.js', dev: 'nodemon server.js' }, dependencies: { express: '^4.18.0' } }) },
  ];
  const blueprint = makeBlueprint({ fileList: ['server.js', 'index.html', 'style.css', 'app.js'] });
  const intent = makeIntent({ appType: 'generic' });
  const report = validateGeneratedProject({ files, blueprint, intent, complexityReport: null });

  const healthIssue = report.issues.find(i => i.id === 'missing_health_route');
  assert(healthIssue !== undefined, 'missing_health_route issue detected');
  assert(healthIssue?.severity === 'medium', 'missing health route is medium severity');
  assert(report.checks.deployment.status === 'warning', 'deployment check has warnings');
});

// ── 8. Marketplace app missing admin routes ───────────────────────────────────

describe('Marketplace app missing admin routes — major admin issue', () => {
  const files = [
    { path: 'index.html',  content: `<!DOCTYPE html><html><head><title>Market</title><link href="style.css" rel="stylesheet"></head><body><a href="listings.html">Listings</a><script src="app.js"></script></body></html>` },
    { path: 'listings.html',content:`<!DOCTYPE html><html><head><title>Listings</title><link href="style.css" rel="stylesheet"></head><body><h1>Listings</h1><script src="app.js"></script></body></html>` },
    { path: 'style.css',   content: `.card { padding: 16px; } @media (max-width:640px) {}` },
    { path: 'app.js',      content: `'use strict';\ndocument.addEventListener('DOMContentLoaded', () => { fetch('/api/listings').then(r => r.json()).catch(e => console.error(e)); });` },
    // No admin.html, no role checks — but isMultiUser=true
  ];
  const blueprint = makeBlueprint({
    fileList: ['index.html', 'listings.html', 'style.css', 'app.js'],
    fileSpecs: [
      { path: 'index.html',    description: 'Home' },
      { path: 'listings.html', description: 'Listings' },
      { path: 'style.css',     description: 'Styles' },
      { path: 'app.js',        description: 'App logic' },
    ],
  });
  const intent = makeIntent({ appType: 'marketplace', isMultiUser: true });
  const report = validateGeneratedProject({ files, blueprint, intent, complexityReport: null });

  const adminIssue = report.issues.find(i => i.id === 'missing_admin_page');
  assert(adminIssue !== undefined, 'missing_admin_page issue detected');
  assert(adminIssue?.severity === 'major', 'missing admin page is major severity');

  const rbacIssue = report.issues.find(i => i.id === 'missing_rbac');
  assert(rbacIssue !== undefined, 'missing_rbac issue detected');
  assert(rbacIssue?.severity === 'major', 'missing RBAC is major severity');

  assert(report.checks.adminRoles.status === 'fail', 'adminRoles check status is fail');
});

// ── 9. Report structure and helper functions ──────────────────────────────────

describe('Report structure — all required fields present', () => {
  const files = [{ path: 'index.html', content: `<!DOCTYPE html><html><head><title>T</title></head><body></body></html>` }];
  const report = validateGeneratedProject({ files, blueprint: makeBlueprint({ fileList: ['index.html'] }), intent: makeIntent(), complexityReport: null });

  assert(typeof report.score === 'number', 'score is a number');
  assert(report.score >= 0 && report.score <= 100, `score is in 0-100 range (got ${report.score})`);
  assert(typeof report.status === 'string', 'status is a string');
  assert(typeof report.summary === 'string', 'summary is a string');
  assert(typeof report.checks === 'object', 'checks is an object');
  assert(Array.isArray(report.issues), 'issues is an array');
  assert(Array.isArray(report.criticalIssues), 'criticalIssues is an array');
  assert(Array.isArray(report.warnings), 'warnings is an array');
  assert(Array.isArray(report.missingFiles), 'missingFiles is an array');
  assert(Array.isArray(report.missingDependencies), 'missingDependencies is an array');
  assert(Array.isArray(report.missingEnvVars), 'missingEnvVars is an array');
  assert(Array.isArray(report.suggestedRepairs), 'suggestedRepairs is an array');
  assert(typeof report.readiness === 'object', 'readiness is an object');
  assert(typeof report.readiness.architectureReady === 'boolean', 'readiness.architectureReady is boolean');
  assert(typeof report.readiness.deployReady === 'boolean', 'readiness.deployReady is boolean');
  assert(typeof report.readiness.authReady === 'boolean', 'readiness.authReady is boolean');
  assert(typeof report.readiness.billingReady === 'boolean', 'readiness.billingReady is boolean');
  assert(typeof report.readiness.integrationReady === 'boolean', 'readiness.integrationReady is boolean');
  assert(typeof report.passed === 'boolean', 'passed is boolean');
  assert(Object.keys(report.checks).length === 14, `checks has 14 categories (got ${Object.keys(report.checks).length})`);

  // Helper functions
  const critical = getCriticalValidationIssues(report);
  assert(Array.isArray(critical), 'getCriticalValidationIssues returns array');

  const repairs = getSuggestedRepairs(report);
  assert(Array.isArray(repairs), 'getSuggestedRepairs returns array');

  const summary = getReadinessSummary(report);
  assert(typeof summary.score === 'number', 'getReadinessSummary.score is number');
  assert(typeof summary.status === 'string', 'getReadinessSummary.status is string');

  const logLine = summarizeValidationReport(report);
  assert(typeof logLine === 'string' && logLine.includes('score='), 'summarizeValidationReport returns log string');
});

// ── 10. Score calibration ─────────────────────────────────────────────────────

describe('Score calibration — critical issues reduce score significantly', () => {
  // App with intentionally missing files
  const blueprint = makeBlueprint({
    fileList: ['index.html', 'style.css', 'app.js', 'auth.js', 'billing.js'],
    fileSpecs: [
      { path: 'index.html', description: 'Main' },
      { path: 'style.css', description: 'Styles' },
      { path: 'app.js', description: 'Logic' },
      { path: 'auth.js', description: 'Auth' },
      { path: 'billing.js', description: 'Billing' },
    ],
  });
  const files = [
    { path: 'index.html', content: `<!DOCTYPE html><html><head><title>T</title><link href="style.css" rel="stylesheet"></head><body><script src="app.js"></script></body></html>` },
    // style.css, app.js, auth.js, billing.js are all MISSING
  ];
  const report = validateGeneratedProject({ files, blueprint, intent: makeIntent({ needsAuth: true, needsPayments: true }), complexityReport: null });

  assert(report.score < 60, `score is significantly reduced for many missing files (got ${report.score})`);
  assert(report.criticalIssues.length >= 3, `multiple critical issues detected (got ${report.criticalIssues.length})`);
  assert(report.status === 'needs_repair' || report.status === 'failed', `status reflects critical issues (got "${report.status}")`);
  assert(report.missingFiles.length >= 2, `missingFiles populated (got ${report.missingFiles.length})`);
});

// ── 11. Dependency validation ─────────────────────────────────────────────────

describe('Dependency validation — missing package flagged', () => {
  const pkgJson = JSON.stringify({
    name: 'my-app',
    scripts: { start: 'node server.js', dev: 'nodemon server.js' },
    dependencies: { express: '^4.18.0' },  // axios is missing
  });
  const files = [
    { path: 'index.html',   content: `<!DOCTYPE html><html><head><title>T</title><link href="style.css" rel="stylesheet"></head><body><script src="app.js"></script></body></html>` },
    { path: 'style.css',    content: `.btn { color: blue; } @media (max-width:640px) {}` },
    { path: 'server.js',    content: `'use strict';\nconst express = require('express');\nconst axios = require('axios');\nconst app = express();\napp.get('/health', (req, res) => res.json({ status: 'ok' }));\napp.listen(process.env.PORT || 3000);` },
    { path: 'app.js',       content: `'use strict';\ndocument.addEventListener('DOMContentLoaded', () => {});` },
    { path: 'package.json', content: pkgJson },
  ];
  const blueprint = makeBlueprint({ fileList: ['index.html', 'style.css', 'server.js', 'app.js', 'package.json'] });
  const report = validateGeneratedProject({ files, blueprint, intent: makeIntent(), complexityReport: null });

  const depIssue = report.issues.find(i => i.id === 'missing_dependency:axios');
  assert(depIssue !== undefined, 'missing_dependency:axios detected');
  assert(depIssue?.severity === 'major', 'missing dependency is major severity');
  assert(report.missingDependencies.includes('axios'), 'missingDependencies includes axios');

  // express IS in package.json — should not be flagged
  const expressIssue = report.issues.find(i => i.id === 'missing_dependency:express');
  assert(expressIssue === undefined, 'express is NOT flagged (it is declared)');
});

// ── Summary ───────────────────────────────────────────────────────────────────

Promise.resolve().then(() => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
