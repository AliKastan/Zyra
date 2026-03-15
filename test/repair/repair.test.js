'use strict';

/**
 * Repair Engine Tests
 *
 * 9 scenarios covering the major repair modules and the public API.
 */

const assert = require('assert');
const {
  repairGeneratedProject,
  getAutoRepairableIssues,
  getManualReviewIssues,
  summarizeRepairReport,
  classifyIssues,
} = require('../../src/lib/repair');

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeReport(overrides = {}) {
  return {
    score:          overrides.score          ?? 60,
    status:         overrides.status         ?? 'needs_repair',
    issues:         overrides.issues         ?? [],
    criticalIssues: overrides.criticalIssues ?? [],
    warnings:       overrides.warnings       ?? [],
    missingFiles:       [],
    missingDependencies: [],
    missingEnvVars:     [],
    suggestedRepairs:   [],
    readiness: {
      architectureReady: false,
      deployReady:       false,
      authReady:         false,
      billingReady:      false,
      integrationReady:  false,
    },
    checks: {},
  };
}

// ── Test 1: Env repair ────────────────────────────────────────────────────────

describe('1. Env repair — adds missing vars to .env.example', () => {
  it('creates .env.example when missing', () => {
    const issues = [{ id: 'missing_env_example', severity: 'major', message: 'missing .env.example' }];
    const result = repairGeneratedProject({
      files: [{ path: 'server.js', content: "const s = process.env.JWT_SECRET;\napp.listen(3000);" }],
      validationReport: makeReport({ issues }),
      intent: { needsAuth: true },
    });
    const paths = new Set(result.repairedFiles.map(f => f.path));
    assert.ok(paths.has('.env.example'), 'Should create .env.example');
    const envContent = result.repairedFiles.find(f => f.path === '.env.example')?.content || '';
    assert.ok(envContent.includes('PORT'), 'Should include PORT variable');
  });

  it('adds JWT_SECRET when needsAuth=true', () => {
    const issues = [
      { id: 'missing_env_example', severity: 'major', message: 'missing .env.example' },
      { id: 'undeclared_env_var:JWT_SECRET', severity: 'medium', message: 'JWT_SECRET undeclared' },
    ];
    const result = repairGeneratedProject({
      files: [{ path: 'server.js', content: "const s = process.env.JWT_SECRET;" }],
      validationReport: makeReport({ issues }),
      intent: { needsAuth: true },
    });
    const envFile = result.repairedFiles.find(f => f.path === '.env.example');
    assert.ok(envFile, '.env.example should be created');
    assert.ok(envFile.content.includes('JWT_SECRET'), 'Should include JWT_SECRET');
  });
});

// ── Test 2: Dependency repair ─────────────────────────────────────────────────

describe('2. Dependency repair — adds missing packages to package.json', () => {
  it('adds missing axios to dependencies', () => {
    const issues = [
      { id: 'missing_dependency:axios', severity: 'major', message: 'axios used but not in package.json' },
    ];
    const pkgJson = JSON.stringify({ name: 'test', dependencies: { express: '^4.0.0' } });
    const result = repairGeneratedProject({
      files: [
        { path: 'package.json', content: pkgJson },
        { path: 'app.js', content: "const axios = require('axios');" },
      ],
      validationReport: makeReport({ issues }),
      intent: {},
    });
    const pkg = result.repairedFiles.find(f => f.path === 'package.json');
    assert.ok(pkg, 'package.json should exist');
    const parsed = JSON.parse(pkg.content);
    assert.ok(parsed.dependencies.axios, 'axios should be added to dependencies');
  });

  it('does not remove existing dependencies', () => {
    const issues = [
      { id: 'missing_dependency:jsonwebtoken', severity: 'major', message: 'jsonwebtoken missing' },
    ];
    const pkgJson = JSON.stringify({ name: 'test', dependencies: { express: '^4.0.0', bcryptjs: '^2.4.3' } });
    const result = repairGeneratedProject({
      files: [{ path: 'package.json', content: pkgJson }],
      validationReport: makeReport({ issues }),
      intent: {},
    });
    const pkg = result.repairedFiles.find(f => f.path === 'package.json');
    const parsed = JSON.parse(pkg.content);
    assert.ok(parsed.dependencies.express, 'express should still be present');
    assert.ok(parsed.dependencies.bcryptjs, 'bcryptjs should still be present');
  });
});

// ── Test 3: Scripts repair ────────────────────────────────────────────────────

describe('3. Scripts repair — adds start/dev scripts', () => {
  it('adds start script when server.js exists', () => {
    const issues = [{ id: 'missing_start_script', severity: 'major', message: 'no start script' }];
    const pkgJson = JSON.stringify({ name: 'test', dependencies: {} });
    const result = repairGeneratedProject({
      files: [
        { path: 'package.json', content: pkgJson },
        { path: 'server.js', content: 'app.listen(3000);' },
      ],
      validationReport: makeReport({ issues }),
      intent: {},
    });
    const pkg = result.repairedFiles.find(f => f.path === 'package.json');
    const parsed = JSON.parse(pkg.content);
    assert.ok(parsed.scripts?.start, 'start script should be added');
    assert.ok(parsed.scripts.start.includes('server.js'), 'start script should reference server.js');
  });
});

// ── Test 4: Deployment repair ─────────────────────────────────────────────────

describe('4. Deployment repair — health route + README', () => {
  it('injects /health route into server file', () => {
    const issues = [{ id: 'missing_health_route', severity: 'medium', message: 'no health route' }];
    const result = repairGeneratedProject({
      files: [{ path: 'server.js', content: "const app = require('express')();\napp.listen(3000);" }],
      validationReport: makeReport({ issues }),
      intent: {},
    });
    const server = result.repairedFiles.find(f => f.path === 'server.js');
    assert.ok(server, 'server.js should exist');
    assert.ok(server.content.includes('/health'), 'Health route should be injected');
  });

  it('creates README.md when missing', () => {
    const issues = [{ id: 'missing_readme', severity: 'minor', message: 'no README' }];
    const result = repairGeneratedProject({
      files: [{ path: 'server.js', content: 'app.listen(3000);' }],
      validationReport: makeReport({ issues }),
      blueprint: { projectName: 'test-app' },
      intent: { appType: 'SaaS app' },
    });
    const readme = result.repairedFiles.find(f => f.path === 'README.md');
    assert.ok(readme, 'README.md should be created');
    assert.ok(readme.content.includes('test-app'), 'README should mention project name');
  });
});

// ── Test 5: Auth repair ───────────────────────────────────────────────────────

describe('5. Auth repair — creates auth.js + login/signup pages', () => {
  it('creates auth.js when missing and needsAuth=true', () => {
    const issues = [
      { id: 'missing_auth_file', severity: 'critical', message: 'no auth file', file: 'auth.js' },
    ];
    const result = repairGeneratedProject({
      files: [{ path: 'server.js', content: 'app.listen(3000);' }],
      validationReport: makeReport({ issues, criticalIssues: issues }),
      intent: { needsAuth: true },
    });
    const paths = new Set(result.repairedFiles.map(f => f.path));
    assert.ok(paths.has('auth.js') || paths.has('src/auth.js') || paths.has('middleware/auth.js'), 'auth.js should be created');
    const authFile = result.repairedFiles.find(f => f.path.includes('auth.js'));
    assert.ok(authFile.content.includes('jwt'), 'auth.js should contain JWT usage');
    assert.ok(authFile.content.includes('bcrypt'), 'auth.js should contain bcrypt usage');
  });

  it('creates login.html and signup.html', () => {
    const issues = [
      { id: 'missing_auth_file', severity: 'critical', message: 'no auth file' },
      { id: 'missing_login_page', severity: 'major', message: 'no login page' },
      { id: 'missing_signup_page', severity: 'major', message: 'no signup page' },
    ];
    const result = repairGeneratedProject({
      files: [{ path: 'index.html', content: '<html><body><h1>App</h1></body></html>' }],
      validationReport: makeReport({ issues }),
      intent: { needsAuth: true },
    });
    const paths = new Set(result.repairedFiles.map(f => f.path));
    assert.ok(paths.has('login.html'), 'login.html should be created');
    assert.ok(paths.has('signup.html'), 'signup.html should be created');
    const loginHtml = result.repairedFiles.find(f => f.path === 'login.html')?.content || '';
    assert.ok(loginHtml.includes('form'), 'login.html should contain a form');
    assert.ok(loginHtml.includes('/api/auth/login'), 'login.html should call auth API');
  });

  it('does NOT create auth files when needsAuth=false', () => {
    const issues = [
      { id: 'missing_auth_file', severity: 'critical', message: 'no auth file' },
    ];
    const result = repairGeneratedProject({
      files: [],
      validationReport: makeReport({ issues }),
      intent: { needsAuth: false },
    });
    const paths = new Set(result.repairedFiles.map(f => f.path));
    assert.ok(!paths.has('auth.js'), 'auth.js should NOT be created when needsAuth=false');
  });
});

// ── Test 6: Billing repair ────────────────────────────────────────────────────

describe('6. Billing repair — creates billing.js with Stripe scaffold', () => {
  it('creates billing.js when needsPayments=true', () => {
    const issues = [
      { id: 'missing_billing_file', severity: 'critical', message: 'no billing file' },
    ];
    const result = repairGeneratedProject({
      files: [{ path: 'server.js', content: 'app.listen(3000);' }],
      validationReport: makeReport({ issues }),
      intent: { needsPayments: true },
    });
    const billingFile = result.repairedFiles.find(f =>
      f.path === 'billing.js' || f.path === 'src/billing.js' || f.path === 'stripe.js'
    );
    assert.ok(billingFile, 'billing.js should be created');
    assert.ok(billingFile.content.includes('stripe'), 'billing.js should reference stripe');
    assert.ok(billingFile.content.includes('createCheckoutSession') || billingFile.content.includes('checkout'), 'billing.js should have checkout functionality');
  });

  it('includes webhook handler', () => {
    const issues = [
      { id: 'missing_billing_file',    severity: 'critical', message: 'no billing file' },
      { id: 'missing_billing_webhook', severity: 'major',    message: 'no webhook handler' },
    ];
    const result = repairGeneratedProject({
      files: [],
      validationReport: makeReport({ issues }),
      intent: { needsPayments: true },
    });
    const billingFile = result.repairedFiles.find(f => f.path.includes('billing') || f.path.includes('stripe'));
    assert.ok(billingFile, 'billing file should exist');
    assert.ok(billingFile.content.includes('webhook') || billingFile.content.includes('constructEvent'), 'Should contain webhook handler');
  });
});

// ── Test 7: Repair report structure ──────────────────────────────────────────

describe('7. RepairReport structure — all required fields present', () => {
  it('report has all required fields', () => {
    const issues = [
      { id: 'missing_health_route', severity: 'medium', message: 'no health route' },
      { id: 'missing_readme',       severity: 'minor',  message: 'no README' },
    ];
    const result = repairGeneratedProject({
      files: [{ path: 'server.js', content: 'app.listen(3000);' }],
      validationReport: makeReport({ issues }),
      intent: {},
    });
    const r = result.repairReport;
    assert.ok(r, 'repairReport should exist');
    assert.ok(typeof r.status        === 'string',  'status should be a string');
    assert.ok(typeof r.scoreBefore   === 'number',  'scoreBefore should be a number');
    assert.ok(typeof r.scoreAfter    === 'number',  'scoreAfter should be a number');
    assert.ok(typeof r.scoreDelta    === 'number',  'scoreDelta should be a number');
    assert.ok(typeof r.repairedCount === 'number',  'repairedCount should be a number');
    assert.ok(typeof r.skippedCount  === 'number',  'skippedCount should be a number');
    assert.ok(Array.isArray(r.results),             'results should be an array');
    assert.ok(Array.isArray(r.skippedIssues),       'skippedIssues should be an array');
    assert.ok(Array.isArray(r.filesCreated),        'filesCreated should be an array');
    assert.ok(Array.isArray(r.filesModified),       'filesModified should be an array');
    assert.ok(typeof r.durationMs    === 'number',  'durationMs should be a number');
    assert.ok(typeof r.summary       === 'string',  'summary should be a string');
  });

  it('scoreAfter >= scoreBefore when repairs are applied', () => {
    const issues = [
      { id: 'missing_health_route', severity: 'medium', message: 'no health route' },
    ];
    const result = repairGeneratedProject({
      files: [{ path: 'server.js', content: 'app.listen(3000);' }],
      validationReport: makeReport({ score: 70, issues }),
      intent: {},
    });
    assert.ok(result.repairReport.scoreAfter >= result.repairReport.scoreBefore,
      'Score should not decrease after repairs');
  });
});

// ── Test 8: Classification API ────────────────────────────────────────────────

describe('8. Classification API — classifyIssues / getAutoRepairableIssues / getManualReviewIssues', () => {
  const sampleIssues = [
    { id: 'missing_health_route',   severity: 'medium',   message: 'no health route' },
    { id: 'missing_auth_logic',     severity: 'major',    message: 'no auth logic' },   // manual
    { id: 'missing_env_example',    severity: 'major',    message: 'no .env.example' },
    { id: 'invalid_package_json',   severity: 'critical', message: 'invalid package.json' }, // do_not_touch
  ];

  it('classifyIssues returns a Map with a decision for each issue', () => {
    const decisions = classifyIssues(sampleIssues, {});
    assert.ok(decisions instanceof Map, 'Should return a Map');
    assert.ok(decisions.size >= sampleIssues.length, 'Should have a decision for every issue');
  });

  it('getAutoRepairableIssues filters to auto-repairable only', () => {
    const autoRepairable = getAutoRepairableIssues(sampleIssues, {});
    assert.ok(autoRepairable.length < sampleIssues.length, 'Should filter out non-auto-repairable issues');
    const ids = autoRepairable.map(i => i.id);
    assert.ok(ids.includes('missing_health_route'), 'missing_health_route should be auto-repairable');
    assert.ok(!ids.includes('invalid_package_json'), 'invalid_package_json should not be auto-repairable');
  });

  it('getManualReviewIssues includes non-auto-repairable issues', () => {
    const manual = getManualReviewIssues(sampleIssues, {});
    const ids = manual.map(i => i.id);
    assert.ok(ids.includes('invalid_package_json'), 'invalid_package_json should require manual review');
  });
});

// ── Test 9: summarizeRepairReport ─────────────────────────────────────────────

describe('9. summarizeRepairReport — produces a valid one-line string', () => {
  it('returns a non-empty string with key metrics', () => {
    const fakeReport = {
      status:         'mostly_repaired',
      scoreBefore:    65,
      scoreAfter:     78,
      scoreDelta:     13,
      repairedCount:  4,
      skippedCount:   1,
      filesCreated:   ['auth.js'],
      filesModified:  ['server.js', 'package.json'],
      durationMs:     42,
    };
    const summary = summarizeRepairReport(fakeReport);
    assert.ok(typeof summary === 'string', 'Should return a string');
    assert.ok(summary.length > 0, 'Should be non-empty');
    assert.ok(summary.includes('65'), 'Should include scoreBefore');
    assert.ok(summary.includes('78'), 'Should include scoreAfter');
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n');
console.log(`  Repair tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('\n  Some tests failed.');
  process.exit(1);
} else {
  console.log('\n  All repair tests passed.\n');
}
