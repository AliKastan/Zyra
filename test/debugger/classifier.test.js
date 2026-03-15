'use strict';

/**
 * Unit tests for the failure classifier and log parser.
 * Run with: node test/debugger/classifier.test.js
 * (No test runner required — uses a tiny inline assert helper.)
 */

const { parseLogText }                            = require('../../src/debugger/log-parser');
const { classifyFailures, getPrimaryFailure }     = require('../../src/debugger/failure-classifier');

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LOGS = {
  missingEnv: `
Error: ANTHROPIC_API_KEY is not set. Cannot call Claude.
    at Object.callClaude (/app/src/providers/anthropicProvider.js:25:11)
    at process.nextTick
`,

  portBind: `
events.js:292
      throw er; // Unhandled 'error' event
Error: listen EADDRINUSE: address already in use :::3001
    at Server.setupListenHandle [as _listen2] (net.js:1318:16)
`,

  moduleNotFound: `
Error: Cannot find module 'stripe'
Require stack:
- /app/src/billing/stripeClient.js
- /app/src/server/app.js
    code: 'MODULE_NOT_FOUND',
`,

  moduleNotFoundRelative: `
Error: Cannot find module './helpers/formatDate'
    at Function.Module._resolveFilename
    code: 'MODULE_NOT_FOUND',
`,

  prismaError: `
PrismaClientInitializationError:
Prisma Client could not run the query. The following error occurred:
error connecting to the database:
Note: "@prisma/client did not initialize yet. Please run "prisma generate"
`,

  dbConnection: `
Error: ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1148:16)
  errno: 'ECONNREFUSED',
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 5432,
`,

  migration: `
Error: P3006
Migration \`20240101_init\` failed to apply cleanly to the shadow database.
Error code: P3006
There are unapplied migrations: ["20240101_init"]
`,

  startCommand: `
npm ERR! Missing script: "start"
npm ERR!
npm ERR! Did you mean one of these?
npm ERR!     npm star # Mark your favorite packages
`,

  packageInstall: `
npm ERR! code ERESOLVE
npm ERR! ERESOLVE could not resolve
npm ERR!
npm ERR! While resolving: zyra@1.0.0
npm ERR! Found: react@18.0.0
npm ERR! node_modules/react
npm ERR!   Conflicting peer dependency: react@17.0.0
`,

  healthcheck: `
Healthcheck failed after 120s
GET /api/health → ECONNRESET
deployment failed: health check timed out
`,

  unknown: `
Some random output that doesn't match anything.
info: Server is running.
debug: Connecting to cache...
`,
};

// ---------------------------------------------------------------------------
// Log parser tests
// ---------------------------------------------------------------------------

describe('log-parser: parseLogText', () => {
  const lines = parseLogText(LOGS.portBind, 'test');
  assert(lines.length > 0, 'parses non-empty log');
  assert(lines.some((l) => l.severity === 'error'), 'detects error severity');
  assert(lines.every((l) => typeof l.lineNum === 'number'), 'all lines have lineNum');

  const jsonLog = '{"level":"error","message":"Something broke","timestamp":"2024-01-01T12:00:00Z"}';
  const jsonLines = parseLogText(jsonLog, 'json');
  assert(jsonLines.length === 1,                    'parses JSON log line');
  assert(jsonLines[0].severity === 'error',         'JSON log severity');
  assert(jsonLines[0].text === 'Something broke',   'JSON log text');
  assert(jsonLines[0].timestamp instanceof Date,    'JSON log timestamp is Date');
});

// ---------------------------------------------------------------------------
// Classifier tests
// ---------------------------------------------------------------------------

describe('classifier: MISSING_ENV', () => {
  const lines  = parseLogText(LOGS.missingEnv);
  const result = getPrimaryFailure(lines);
  assert(result.category === 'MISSING_ENV',  'classifies as MISSING_ENV');
  assert(result.confidence >= 0.90,          'high confidence');
});

describe('classifier: PORT_BIND_ERROR', () => {
  const lines  = parseLogText(LOGS.portBind);
  const result = getPrimaryFailure(lines);
  assert(result.category === 'PORT_BIND_ERROR', 'classifies as PORT_BIND_ERROR');
  assert(result.confidence >= 0.95,             'very high confidence');
});

describe('classifier: MODULE_NOT_FOUND (npm package)', () => {
  const lines  = parseLogText(LOGS.moduleNotFound);
  const result = getPrimaryFailure(lines);
  assert(result.category === 'MODULE_NOT_FOUND',       'classifies as MODULE_NOT_FOUND');
  assert(result.captureGroups.includes('stripe'),       'captures module name: stripe');
});

describe('classifier: MODULE_NOT_FOUND (relative)', () => {
  const lines  = parseLogText(LOGS.moduleNotFoundRelative);
  const result = getPrimaryFailure(lines);
  assert(result.category === 'MODULE_NOT_FOUND', 'classifies relative module as MODULE_NOT_FOUND');
});

describe('classifier: PRISMA_SCHEMA_ERROR', () => {
  const lines  = parseLogText(LOGS.prismaError);
  const result = getPrimaryFailure(lines);
  assert(result.category === 'PRISMA_SCHEMA_ERROR', 'classifies as PRISMA_SCHEMA_ERROR');
  assert(result.confidence >= 0.90,                  'high confidence');
});

describe('classifier: DATABASE_CONNECTION_ERROR', () => {
  const lines  = parseLogText(LOGS.dbConnection);
  const result = getPrimaryFailure(lines);
  assert(result.category === 'DATABASE_CONNECTION_ERROR', 'classifies as DATABASE_CONNECTION_ERROR');
});

describe('classifier: MIGRATION_FAILURE', () => {
  const lines  = parseLogText(LOGS.migration);
  const result = getPrimaryFailure(lines);
  assert(result.category === 'MIGRATION_FAILURE', 'classifies as MIGRATION_FAILURE');
  assert(result.confidence >= 0.90,               'high confidence');
});

describe('classifier: START_COMMAND_FAILURE', () => {
  const lines  = parseLogText(LOGS.startCommand);
  const result = getPrimaryFailure(lines);
  assert(result.category === 'START_COMMAND_FAILURE', 'classifies as START_COMMAND_FAILURE');
  assert(result.confidence >= 0.90,                   'high confidence');
});

describe('classifier: PACKAGE_INSTALL_FAILURE', () => {
  const lines  = parseLogText(LOGS.packageInstall);
  const result = getPrimaryFailure(lines);
  assert(result.category === 'PACKAGE_INSTALL_FAILURE', 'classifies as PACKAGE_INSTALL_FAILURE');
  assert(result.confidence >= 0.95,                      'very high confidence');
});

describe('classifier: HEALTHCHECK_FAILURE', () => {
  const lines  = parseLogText(LOGS.healthcheck);
  const result = getPrimaryFailure(lines);
  assert(result.category === 'HEALTHCHECK_FAILURE', 'classifies as HEALTHCHECK_FAILURE');
  assert(result.confidence >= 0.90,                  'high confidence');
});

describe('classifier: UNKNOWN_FAILURE fallback', () => {
  const lines  = parseLogText(LOGS.unknown);
  const result = getPrimaryFailure(lines);
  assert(result.category === 'UNKNOWN_FAILURE', 'falls back to UNKNOWN_FAILURE');
  assert(result.confidence < 0.65,              'low confidence on unknown');
});

describe('classifier: classifyFailures returns sorted array', () => {
  const lines   = parseLogText(LOGS.prismaError + '\n' + LOGS.moduleNotFound);
  const results = classifyFailures(lines);
  assert(Array.isArray(results),            'returns array');
  assert(results.length >= 2,               'at least 2 matches for combined log');
  for (let i = 0; i < results.length - 1; i++) {
    assert(results[i].confidence >= results[i + 1].confidence, `sorted desc at index ${i}`);
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('Some tests failed.');
  process.exit(1);
} else {
  console.log('All tests passed.');
  process.exit(0);
}
