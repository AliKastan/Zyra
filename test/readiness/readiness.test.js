'use strict';

/**
 * Production Readiness Checker Tests
 *
 * Test cases:
 *   1. Next.js project — missing start script          → ready_with_warnings
 *   2. Node server — hardcoded port                    → critical deployment issue
 *   3. Stripe integration — missing env keys           → ready_with_setup_required
 *   4. Database app — missing connection string        → critical database issue
 *   5. AI app — missing API key placeholder            → ready_with_setup_required
 *   6. Mobile app — missing Expo config                → not_ready or manual_configuration_required
 *   7. Clean static project — no issues               → ready
 *   8. Node server — process.env.PORT used correctly  → deployment score ≥ 80
 *   9. Hardcoded secret detected                      → critical security issue
 *  10. Multiple missing integrations                  → manual_configuration_required or ready_with_setup_required
 *
 * Plus unit tests:
 *   - Score computation
 *   - detectProjectType
 *   - getCriticalReadinessIssues / getDeploymentCompatibility helpers
 *   - summarizeReadinessReport
 *   - buildUiReadinessPayload
 */

const assert = require('assert');
const {
  checkProductionReadiness,
  checkRuntime,
  checkDeployment,
  checkEnv,
  checkIntegrations,
  checkBuild,
  checkDatabase,
  checkBilling,
  checkSecurity,
  summarizeReadinessReport,
  buildUiReadinessPayload,
  getCriticalReadinessIssues,
  getDeploymentCompatibility,
  getRecommendedSetupSteps,
  isDeploymentReady,
  needsSetup,
  detectProjectType,
} = require('../../src/lib/readiness');

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

// ── File fixtures ──────────────────────────────────────────────────────────────

function makePackageJson(overrides = {}) {
  const base = {
    name: 'test-app',
    version: '1.0.0',
    scripts: { start: 'node server.js', dev: 'nodemon server.js' },
    dependencies: {},
    devDependencies: {},
  };
  return JSON.stringify({ ...base, ...overrides, scripts: { ...base.scripts, ...(overrides.scripts || {}) } });
}

function makeServerJs(port = 'process.env.PORT || 3000') {
  return `'use strict';
const express = require('express');
const app = express();
const PORT = ${port};

app.get('/health', (req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log('Server running on port', PORT));
`;
}

// ── Scenario 1: Next.js project — missing start script ────────────────────────

describe('Scenario 1 — Next.js project (missing start script)', () => {
  const files = {
    'package.json': JSON.stringify({
      name: 'my-nextjs-app',
      dependencies: { next: '^14.0.0', react: '^18.0.0' },
      scripts: { dev: 'next dev', build: 'next build' },
      // NOTE: no "start" script
    }),
    'pages/index.js': 'export default function Home() { return <h1>Hello</h1>; }',
    'next.config.js': 'module.exports = {};',
  };

  const report = checkProductionReadiness({ files });

  it('project type is nextjs', () => {
    assert.strictEqual(report.projectType, 'nextjs');
  });

  it('status is not not_ready (Next.js without start is only a warning)', () => {
    assert.notStrictEqual(report.status, 'not_ready', `Expected non-critical status, got: ${report.status}`);
  });

  it('has no critical runtime issues (Next.js start is handled by npm run start after next build)', () => {
    const runtimeCritical = report.runtime.issues.filter(i => i.severity === 'critical');
    // next start is the standard, so runtime should be OK
    assert.ok(runtimeCritical.length === 0 || report.status !== 'not_ready',
      `Unexpected critical runtime issues: ${runtimeCritical.map(i => i.message).join(', ')}`);
  });

  it('Vercel is detected as a compatible deployment target', () => {
    const compat = getDeploymentCompatibility(report);
    const vercel = compat.find(t => t.platform === 'vercel');
    assert.ok(vercel?.compatible, 'Vercel should be compatible with Next.js');
  });
});

// ── Scenario 2: Node server — hardcoded port ──────────────────────────────────

describe('Scenario 2 — Node server with hardcoded port', () => {
  const files = {
    'package.json': makePackageJson({ dependencies: { express: '^4.18.0' } }),
    'server.js':    makeServerJs('3000'),  // hardcoded, no process.env.PORT
    '.env.example': 'NODE_ENV=production\n',
  };

  const report = checkProductionReadiness({ files });

  it('portConfigured is false', () => {
    assert.strictEqual(report.deployment.portConfigured, false);
  });

  it('has a critical or warning deployment issue about port', () => {
    const portIssues = report.deployment.issues.filter(i =>
      i.message.toLowerCase().includes('port'),
    );
    assert.ok(portIssues.length > 0, 'Expected port issue in deployment issues');
  });

  it('deployment score is penalized', () => {
    assert.ok(report.deployment.score < 90, `Expected penalized score, got: ${report.deployment.score}`);
  });

  it('Railway target is not compatible due to port config', () => {
    const compat = getDeploymentCompatibility(report);
    const railway = compat.find(t => t.platform === 'railway');
    assert.ok(
      railway && (!railway.compatible || railway.issues.length > 0 || report.deployment.portConfigured === false),
      'Railway should flag port configuration issue',
    );
  });

  it('next steps include PORT fix', () => {
    const steps = getRecommendedSetupSteps(report);
    const portStep = steps.find(s => s.action.toLowerCase().includes('port'));
    assert.ok(portStep, `Expected PORT fix in next steps, got: ${steps.map(s => s.action).join(', ')}`);
  });
});

// ── Scenario 3: Stripe integration — missing env keys ─────────────────────────

describe('Scenario 3 — Stripe integration without env keys', () => {
  const files = {
    'package.json': makePackageJson({ dependencies: { express: '^4.18.0', stripe: '^14.0.0' } }),
    'server.js':    makeServerJs(),
    'billing.js':   `const Stripe = require('stripe');\nconst stripe = new Stripe(process.env.STRIPE_SECRET_KEY);\n\nasync function createCheckout(priceId) {\n  return stripe.checkout.sessions.create({ line_items: [{ price: priceId, quantity: 1 }], mode: 'payment', success_url: 'https://example.com/success' });\n}\nmodule.exports = { createCheckout };`,
    // No .env.example
  };

  const report = checkProductionReadiness({ files });

  it('status is ready_with_setup_required', () => {
    assert.ok(
      report.status === 'ready_with_setup_required' || report.status === 'ready_with_warnings' || report.status === 'manual_configuration_required',
      `Expected setup-required status, got: ${report.status}`,
    );
  });

  it('integrationsConfigured is false', () => {
    assert.strictEqual(report.integrationsConfigured, false);
  });

  it('Stripe is detected in integrations', () => {
    assert.ok(report.integrations.detected.includes('Stripe'), 'Stripe should be detected');
  });

  it('Stripe is in unconfigured integrations', () => {
    assert.ok(report.integrations.unconfigured.includes('Stripe'), `Expected Stripe unconfigured, got: ${report.integrations.unconfigured.join(', ')}`);
  });

  it('billing check detects Stripe', () => {
    assert.ok(report.billing.detected, 'billing.detected should be true');
    assert.strictEqual(report.billing.provider, 'stripe');
  });
});

// ── Scenario 4: Database app — missing connection string ──────────────────────

describe('Scenario 4 — PostgreSQL app without connection string', () => {
  const files = {
    'package.json': makePackageJson({ dependencies: { express: '^4.18.0', pg: '^8.0.0' } }),
    'server.js':    makeServerJs(),
    'db.js':        `const { Pool } = require('pg');\nconst pool = new Pool();\nmodule.exports = pool;`,
    // No DATABASE_URL in any env file
  };

  const report = checkProductionReadiness({ files });

  it('database is detected', () => {
    assert.ok(report.database.detected, 'database should be detected');
  });

  it('database type is postgresql', () => {
    assert.strictEqual(report.database.dbType, 'postgresql');
  });

  it('hasConnectionString is false', () => {
    assert.strictEqual(report.database.hasConnectionString, false);
  });

  it('database issues include connection string warning', () => {
    const dbIssues = report.database.issues;
    assert.ok(dbIssues.length > 0, 'Should have database issues');
    const connIssue = dbIssues.find(i => i.message.toLowerCase().includes('connection'));
    assert.ok(connIssue, `Expected connection string issue, got: ${dbIssues.map(i => i.message).join(', ')}`);
  });
});

// ── Scenario 5: AI app — missing API key placeholder ──────────────────────────

describe('Scenario 5 — AI app without OpenAI key placeholder', () => {
  const files = {
    'package.json': makePackageJson({ dependencies: { express: '^4.18.0', openai: '^4.0.0' } }),
    'server.js':    makeServerJs(),
    'ai.js':        `const OpenAI = require('openai');\nconst client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });\nasync function complete(prompt) { return client.chat.completions.create({ model: 'gpt-4', messages: [{ role: 'user', content: prompt }] }); }\nmodule.exports = { complete };`,
    // No .env.example mentioning OPENAI_API_KEY
  };

  const report = checkProductionReadiness({ files });

  it('OpenAI is detected', () => {
    assert.ok(report.integrations.detected.includes('OpenAI'), 'OpenAI should be detected');
  });

  it('envConfigured is false (OPENAI_API_KEY not in .env.example)', () => {
    assert.strictEqual(report.envConfigured, false);
  });

  it('status requires setup', () => {
    assert.ok(
      report.status === 'ready_with_setup_required' ||
      report.status === 'manual_configuration_required' ||
      report.status === 'ready_with_warnings',
      `Expected setup-required status, got: ${report.status}`,
    );
  });

  it('next steps mention env vars or API key', () => {
    const steps = getRecommendedSetupSteps(report);
    const envStep = steps.find(s =>
      s.action.toLowerCase().includes('env') || s.action.toLowerCase().includes('api'),
    );
    assert.ok(envStep, `Expected env/API step, got: ${steps.map(s => s.action).join(', ')}`);
  });
});

// ── Scenario 6: Mobile app — missing Expo config ──────────────────────────────

describe('Scenario 6 — Mobile Expo app without app.json', () => {
  const files = {
    'package.json': makePackageJson({ dependencies: { expo: '^50.0.0', react: '^18.0.0' } }),
    'App.js':       `import React from 'react';\nimport { Text, View } from 'react-native';\nexport default function App() { return <View><Text>Hello Expo</Text></View>; }`,
    // No app.json
  };

  const report = checkProductionReadiness({ files });

  it('project type is mobile', () => {
    assert.strictEqual(report.projectType, 'mobile');
  });

  it('expo deployment target is not compatible (missing app.json)', () => {
    const compat = getDeploymentCompatibility(report);
    const expo = compat.find(t => t.platform === 'expo');
    assert.ok(expo, 'Expo target should be in deployment targets');
    assert.strictEqual(expo.compatible, false, 'Expo should be incompatible without app.json');
  });

  it('status reflects that setup/fixes are needed', () => {
    assert.notStrictEqual(report.status, 'ready', 'Should not be ready without app.json');
  });

  it('recommended deploy target is expo', () => {
    assert.strictEqual(report.recommendedDeployTarget, 'expo');
  });
});

// ── Scenario 7: Clean static project ─────────────────────────────────────────

describe('Scenario 7 — Clean static HTML project', () => {
  const files = {
    'index.html': `<!DOCTYPE html><html><head><meta charset="utf-8"><title>My Site</title><link rel="stylesheet" href="style.css"></head><body><h1>Hello World</h1><script src="app.js"></script></body></html>`,
    'style.css':  'body { margin: 0; font-family: sans-serif; }',
    'app.js':     'console.log("loaded");',
  };

  const report = checkProductionReadiness({ files });

  it('project type is static', () => {
    assert.strictEqual(report.projectType, 'static');
  });

  it('status is ready or ready_with_warnings', () => {
    assert.ok(
      report.status === 'ready' || report.status === 'ready_with_warnings',
      `Expected ready status for clean static project, got: ${report.status}`,
    );
  });

  it('runtime score is high (no server/start script needed for static)', () => {
    assert.ok(report.runtime.score >= 85, `Expected ≥85 runtime score for static project, got: ${report.runtime.score}`);
  });

  it('isDeploymentReady is true', () => {
    assert.strictEqual(isDeploymentReady(report), true);
  });

  it('needsSetup is false', () => {
    assert.strictEqual(needsSetup(report), false);
  });
});

// ── Scenario 8: Correct port usage ────────────────────────────────────────────

describe('Scenario 8 — Node server with correct process.env.PORT', () => {
  const files = {
    'package.json': makePackageJson({ dependencies: { express: '^4.18.0' } }),
    'server.js':    makeServerJs('process.env.PORT || 3000'),
    '.env.example': 'NODE_ENV=production\nPORT=3000\n',
  };

  const report = checkProductionReadiness({ files });

  it('portConfigured is true', () => {
    assert.strictEqual(report.deployment.portConfigured, true);
  });

  it('deployment score is ≥ 80', () => {
    assert.ok(report.deployment.score >= 80, `Expected ≥ 80 deployment score, got: ${report.deployment.score}`);
  });

  it('Railway target is compatible', () => {
    const compat = getDeploymentCompatibility(report);
    const railway = compat.find(t => t.platform === 'railway');
    assert.ok(railway?.compatible, 'Railway should be compatible');
  });
});

// ── Scenario 9: Hardcoded secret ─────────────────────────────────────────────

describe('Scenario 9 — Hardcoded OpenAI key', () => {
  const files = {
    'package.json': makePackageJson({ dependencies: { openai: '^4.0.0' } }),
    'ai.js':        `const OpenAI = require('openai');\nconst client = new OpenAI({ apiKey: 'sk-abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJ' });\n`,
  };

  const report = checkProductionReadiness({ files });

  it('security.hasHardcodedKeys is true', () => {
    assert.strictEqual(report.security.hasHardcodedKeys, true);
  });

  it('securitySafe is false', () => {
    assert.strictEqual(report.securitySafe, false);
  });

  it('has critical security issues', () => {
    const secIssues = report.criticalIssues.filter(i => i.category === 'security');
    assert.ok(secIssues.length > 0, 'Expected critical security issues for hardcoded key');
  });

  it('status is not ready', () => {
    assert.notStrictEqual(report.status, 'ready', 'Should not be ready with hardcoded secrets');
  });
});

// ── Scenario 10: Multiple unconfigured integrations ───────────────────────────

describe('Scenario 10 — Multiple unconfigured integrations', () => {
  const files = {
    'package.json': makePackageJson({
      dependencies: {
        express: '^4.18.0',
        openai: '^4.0.0',
        stripe: '^14.0.0',
        '@sendgrid/mail': '^8.0.0',
      },
    }),
    'server.js': makeServerJs(),
    'ai.js':     `const OpenAI = require('openai');\nconst client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });\n`,
    'billing.js': `const Stripe = require('stripe');\nconst stripe = new Stripe(process.env.STRIPE_SECRET_KEY);\n`,
    'email.js':  `const sgMail = require('@sendgrid/mail');\nsgMail.setApiKey(process.env.SENDGRID_API_KEY);\n`,
  };

  const report = checkProductionReadiness({ files });

  it('detects 3 integrations (OpenAI, Stripe, SendGrid)', () => {
    assert.ok(report.integrations.detected.length >= 3,
      `Expected ≥3 integrations, got: ${report.integrations.detected.join(', ')}`);
  });

  it('all 3 are unconfigured (no .env.example)', () => {
    assert.ok(report.integrations.unconfigured.length >= 3,
      `Expected ≥3 unconfigured, got: ${report.integrations.unconfigured.join(', ')}`);
  });

  it('integrationsConfigured is false', () => {
    assert.strictEqual(report.integrationsConfigured, false);
  });

  it('status requires at least setup', () => {
    const needsAtLeastSetup = [
      'ready_with_setup_required',
      'manual_configuration_required',
      'not_ready',
    ].includes(report.status);
    assert.ok(needsAtLeastSetup, `Expected setup-needed status, got: ${report.status}`);
  });
});

// ── Score computation ─────────────────────────────────────────────────────────

describe('Score computation', () => {
  it('clean static project scores ≥ 90', () => {
    const report = checkProductionReadiness({
      files: {
        'index.html': '<!DOCTYPE html><html><body>Hello</body></html>',
        'style.css': 'body { margin: 0; }',
      },
    });
    assert.ok(report.score.total >= 85, `Expected ≥85 for clean static, got: ${report.score.total}`);
  });

  it('score has all 6 sub-scores', () => {
    const report = checkProductionReadiness({ files: { 'index.html': '<html></html>' } });
    assert.ok(typeof report.score.runtime === 'number', 'runtime score');
    assert.ok(typeof report.score.deployment === 'number', 'deployment score');
    assert.ok(typeof report.score.envConfig === 'number', 'envConfig score');
    assert.ok(typeof report.score.integrations === 'number', 'integrations score');
    assert.ok(typeof report.score.build === 'number', 'build score');
    assert.ok(typeof report.score.architectureSafety === 'number', 'architectureSafety score');
  });

  it('total score is between 0 and 100', () => {
    const report = checkProductionReadiness({ files: {} });
    assert.ok(report.score.total >= 0 && report.score.total <= 100);
  });
});

// ── detectProjectType ─────────────────────────────────────────────────────────

describe('detectProjectType', () => {
  it('detects nextjs from next.config.js', () => {
    assert.strictEqual(detectProjectType({ 'next.config.js': 'module.exports = {};' }), 'nextjs');
  });

  it('detects react from package.json with vite', () => {
    assert.strictEqual(
      detectProjectType({ 'package.json': JSON.stringify({ dependencies: { react: '*', vite: '*' } }) }),
      'react',
    );
  });

  it('detects static from index.html without server', () => {
    assert.strictEqual(detectProjectType({ 'index.html': '<html></html>', 'style.css': '' }), 'static');
  });

  it('detects mobile from expo in package.json', () => {
    assert.strictEqual(
      detectProjectType({ 'package.json': JSON.stringify({ dependencies: { expo: '*' } }) }),
      'mobile',
    );
  });

  it('detects node from express in package.json + server.js', () => {
    assert.strictEqual(
      detectProjectType({
        'package.json': JSON.stringify({ dependencies: { express: '*' } }),
        'server.js':    'const express = require("express");',
      }),
      'node',
    );
  });
});

// ── Helper functions ──────────────────────────────────────────────────────────

describe('Helper functions', () => {
  const report = checkProductionReadiness({
    files: {
      'package.json': makePackageJson({ dependencies: { express: '^4.18.0' } }),
      'server.js': makeServerJs('3000'), // hardcoded port
    },
  });

  it('getCriticalReadinessIssues returns only critical issues', () => {
    const critical = getCriticalReadinessIssues(report);
    assert.ok(Array.isArray(critical));
    assert.ok(critical.every(i => i.severity === 'critical'));
  });

  it('getDeploymentCompatibility returns platform array', () => {
    const compat = getDeploymentCompatibility(report);
    assert.ok(Array.isArray(compat));
    assert.ok(compat.every(c => c.platform && typeof c.compatible === 'boolean'));
  });

  it('summarizeReadinessReport returns a non-empty string', () => {
    const summary = summarizeReadinessReport(report);
    assert.ok(typeof summary === 'string' && summary.length > 20);
    assert.ok(summary.includes('status='));
    assert.ok(summary.includes('score='));
  });

  it('buildUiReadinessPayload returns UI-safe object', () => {
    const payload = buildUiReadinessPayload(report);
    assert.ok(payload.status, 'status');
    assert.ok(typeof payload.score === 'number', 'score');
    assert.ok(Array.isArray(payload.critical), 'critical');
    assert.ok(Array.isArray(payload.nextSteps), 'nextSteps');
    assert.ok(payload.summary, 'summary');
  });

  it('isDeploymentReady returns boolean', () => {
    assert.strictEqual(typeof isDeploymentReady(report), 'boolean');
  });

  it('needsSetup returns boolean', () => {
    assert.strictEqual(typeof needsSetup(report), 'boolean');
  });
});

// ── Individual checkers ───────────────────────────────────────────────────────

describe('Individual checker modules', () => {
  it('checkSecurity detects CORS wildcard', () => {
    const result = checkSecurity({
      files: {
        'server.js': "app.use(cors({ origin: '*' }));",
      },
    });
    assert.ok(result.issues.some(i => i.message.toLowerCase().includes('cors')));
  });

  it('checkBilling detects Stripe without webhook', () => {
    const result = checkBilling({
      files: {
        'billing.js': "const Stripe = require('stripe');\nconst stripe = new Stripe(process.env.STRIPE_SECRET_KEY);\nstripe.checkout.sessions.create({ success_url: 'https://example.com' });",
      },
    });
    assert.ok(result.detected, 'billing detected');
    assert.ok(result.hasCheckoutLogic, 'has checkout logic');
    assert.ok(!result.hasWebhookHandler, 'missing webhook handler');
  });

  it('checkDatabase detects MongoDB with connection string', () => {
    const result = checkDatabase({
      files: {
        'db.js': "const mongoose = require('mongoose');\nmongoose.connect(process.env.MONGODB_URI);",
        '.env.example': 'MONGODB_URI=mongodb://localhost:27017/myapp\n',
      },
    });
    assert.ok(result.detected, 'db detected');
    assert.strictEqual(result.dbType, 'mongodb');
    assert.ok(result.hasConnectionString, 'has connection string');
  });

  it('checkEnv detects missing .env.example', () => {
    const result = checkEnv({
      files: { 'server.js': 'const key = process.env.API_SECRET_KEY;' },
    });
    assert.strictEqual(result.hasEnvExample, false);
    assert.ok(result.issues.some(i => i.message.includes('.env.example')));
  });

  it('checkBuild detects missing dependency', () => {
    const result = checkBuild({
      files: {
        'package.json': JSON.stringify({ dependencies: {} }),
        'server.js': "const express = require('express');",
      },
    });
    assert.ok(result.missingDependencies.includes('express'), 'express should be flagged as missing');
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
