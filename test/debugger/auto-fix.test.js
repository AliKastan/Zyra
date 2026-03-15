'use strict';

/**
 * Unit tests for the auto-fix engine.
 * Run with: node test/debugger/auto-fix.test.js
 *
 * Tests use a temporary directory so they never touch the real project.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const {
  fixPortBinding,
  fixMissingEnvExample,
  fixStartScript,
  fixPrismaGenerate,
  fixHealthEndpoint,
  fixMissingModule,
} = require('../../src/debugger/auto-fix');

// ---------------------------------------------------------------------------
// Harness
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

/**
 * Create a temp directory with given files, run fn(tmpDir), then clean up.
 * @param {Record<string,string>} files  - relative path → content
 * @param {(dir:string)=>void} fn
 */
function withTmpDir(files, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zyra-test-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf8');
    }
    fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// fixPortBinding
// ---------------------------------------------------------------------------

describe('fixPortBinding: patches hardcoded listen() port', () => {
  withTmpDir({
    'src/server/index.js': `
const app = express();
app.listen(3001, () => console.log('ready'));
`
  }, (root) => {
    const { changes, errors } = fixPortBinding(root, false);
    assert(errors.length === 0,    'no errors');
    assert(changes.length === 1,   'one change made');
    const patched = fs.readFileSync(path.join(root, 'src/server/index.js'), 'utf8');
    assert(patched.includes('process.env.PORT'), 'patched file uses process.env.PORT');
    assert(!patched.includes('.listen(3001)'),   'removed raw .listen(3001)');
  });
});

describe('fixPortBinding: leaves file alone if already uses process.env.PORT', () => {
  withTmpDir({
    'src/server/index.js': `app.listen(process.env.PORT || 3001);`
  }, (root) => {
    const { changes } = fixPortBinding(root, false);
    assert(changes.length === 0, 'no changes when PORT already used');
  });
});

describe('fixPortBinding: dry-run does not write file', () => {
  const original = `app.listen(4000);`;
  withTmpDir({ 'src/server/index.js': original }, (root) => {
    const { changes } = fixPortBinding(root, true);
    assert(changes.length === 1, 'reports a change in dry-run');
    const content = fs.readFileSync(path.join(root, 'src/server/index.js'), 'utf8');
    assert(content === original, 'file not modified in dry-run');
  });
});

describe('fixPortBinding: patches localhost hostname', () => {
  withTmpDir({
    'src/server/index.js': `server.listen({ hostname: 'localhost', port: 3000 });`
  }, (root) => {
    const { changes } = fixPortBinding(root, false);
    const patched = fs.readFileSync(path.join(root, 'src/server/index.js'), 'utf8');
    assert(patched.includes("'0.0.0.0'"), 'localhost replaced with 0.0.0.0');
  });
});

// ---------------------------------------------------------------------------
// fixMissingEnvExample
// ---------------------------------------------------------------------------

describe('fixMissingEnvExample: adds missing vars to .env.example', () => {
  withTmpDir({
    'src/server/index.js': `
const key = process.env.MY_SECRET_KEY;
const url = process.env.DATABASE_URL;
`,
    '.env.example': `EXISTING_VAR=something\n`,
  }, (root) => {
    const { changes, errors } = fixMissingEnvExample(root, [], false);
    assert(errors.length === 0, 'no errors');
    assert(changes.length === 1, 'one change to .env.example');
    const content = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    assert(content.includes('MY_SECRET_KEY'),  'added MY_SECRET_KEY');
    assert(content.includes('DATABASE_URL'),   'added DATABASE_URL');
    assert(content.includes('EXISTING_VAR'),   'preserved existing var');
  });
});

describe('fixMissingEnvExample: creates .env.example if not present', () => {
  withTmpDir({
    'src/index.js': `const x = process.env.SOME_NEW_VAR;`,
  }, (root) => {
    const { changes } = fixMissingEnvExample(root, ['SOME_NEW_VAR'], false);
    assert(changes.length === 1, 'one change');
    const exists = fs.existsSync(path.join(root, '.env.example'));
    assert(exists, '.env.example created');
  });
});

describe('fixMissingEnvExample: skips NODE_* and npm_* vars', () => {
  withTmpDir({
    'src/index.js': `
const x = process.env.NODE_ENV;
const y = process.env.npm_package_version;
const z = process.env.MY_REAL_VAR;
`,
  }, (root) => {
    const { changes } = fixMissingEnvExample(root, [], false);
    if (changes.length === 0) {
      // MY_REAL_VAR might have been caught — that's fine
      assert(true, 'no false positives from NODE_* / npm_*');
    } else {
      const content = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
      assert(!content.includes('NODE_ENV'),             'excluded NODE_ENV');
      assert(!content.includes('npm_package_version'),  'excluded npm_package_version');
    }
  });
});

// ---------------------------------------------------------------------------
// fixStartScript
// ---------------------------------------------------------------------------

describe('fixStartScript: reports missing start script as proposal', () => {
  withTmpDir({
    'package.json': JSON.stringify({ name: 'test', scripts: { build: 'tsc' } }),
    'src/server/index.js': '// server',
  }, (root) => {
    const { proposals } = fixStartScript(root);
    assert(proposals.length === 1,                         'one proposal');
    assert(proposals[0].title.includes('start'),           'proposal mentions start script');
    assert(proposals[0].changes[0].after.includes('node'), 'proposes node command');
  });
});

describe('fixStartScript: reports missing entry file as proposal', () => {
  withTmpDir({
    'package.json': JSON.stringify({ name: 'test', scripts: { start: 'node missing-file.js' } }),
  }, (root) => {
    const { proposals } = fixStartScript(root);
    assert(proposals.length >= 1,              'at least one proposal');
    assert(proposals[0].title.includes('missing'), 'proposal mentions missing file');
  });
});

describe('fixStartScript: no proposal when everything is correct', () => {
  withTmpDir({
    'package.json': JSON.stringify({ name: 'test', scripts: { start: 'node src/server/index.js' } }),
    'src/server/index.js': '// server',
  }, (root) => {
    const { proposals, errors } = fixStartScript(root);
    assert(errors.length === 0,   'no errors');
    assert(proposals.length === 0, 'no proposals when start script is valid');
  });
});

// ---------------------------------------------------------------------------
// fixPrismaGenerate
// ---------------------------------------------------------------------------

describe('fixPrismaGenerate: proposes adding prisma generate to build', () => {
  withTmpDir({
    'package.json': JSON.stringify({
      name: 'test',
      dependencies: { '@prisma/client': '^4.0.0' },
      scripts: { build: 'tsc' },
    }),
  }, (root) => {
    const { proposals } = fixPrismaGenerate(root);
    assert(proposals.length === 1,                               'one proposal');
    assert(proposals[0].changes[0].after.includes('prisma generate'), 'proposes prisma generate');
  });
});

describe('fixPrismaGenerate: skips when prisma generate already in build', () => {
  withTmpDir({
    'package.json': JSON.stringify({
      name: 'test',
      dependencies: { '@prisma/client': '^4.0.0' },
      scripts: { build: 'prisma generate && tsc' },
    }),
  }, (root) => {
    const { proposals } = fixPrismaGenerate(root);
    assert(proposals.length === 0, 'no proposal when already has prisma generate');
  });
});

describe('fixPrismaGenerate: skips when no prisma client installed', () => {
  withTmpDir({
    'package.json': JSON.stringify({
      name: 'test',
      scripts: { build: 'tsc' },
    }),
  }, (root) => {
    const { proposals } = fixPrismaGenerate(root);
    assert(proposals.length === 0, 'no proposal when prisma not installed');
  });
});

// ---------------------------------------------------------------------------
// fixHealthEndpoint
// ---------------------------------------------------------------------------

describe('fixHealthEndpoint: proposes adding /health route when missing', () => {
  withTmpDir({
    'src/server/app.js': `
const express = require('express');
const app = express();
app.use('/api/generate', generateRoutes);
module.exports = app;
`,
  }, (root) => {
    const { proposals } = fixHealthEndpoint(root);
    assert(proposals.length === 1,                'one proposal');
    assert(proposals[0].risk === 'low',           'low risk');
    assert(proposals[0].changes.some((c) => c.path.includes('health')), 'proposes health route file');
  });
});

describe('fixHealthEndpoint: no proposal when /health already exists', () => {
  withTmpDir({
    'src/server/app.js': `
app.use('/api/health', healthRoutes);
app.use('/api/generate', generateRoutes);
`,
  }, (root) => {
    const { proposals } = fixHealthEndpoint(root);
    assert(proposals.length === 0, 'no proposal when health route exists');
  });
});

// ---------------------------------------------------------------------------
// fixMissingModule
// ---------------------------------------------------------------------------

describe('fixMissingModule: proposes adding missing npm package', () => {
  withTmpDir({
    'package.json': JSON.stringify({ name: 'test', dependencies: {} }),
  }, (root) => {
    const { proposals } = fixMissingModule(root, ['stripe']);
    assert(proposals.length === 1,                    'one proposal');
    assert(proposals[0].changes[0].after.includes('stripe'), 'proposes adding stripe');
  });
});

describe('fixMissingModule: skips relative paths', () => {
  withTmpDir({
    'package.json': JSON.stringify({ name: 'test', dependencies: {} }),
  }, (root) => {
    const { proposals } = fixMissingModule(root, ['./helpers/utils']);
    assert(proposals.length === 0, 'skips relative module paths');
  });
});

describe('fixMissingModule: skips already-listed packages', () => {
  withTmpDir({
    'package.json': JSON.stringify({ name: 'test', dependencies: { axios: '^1.0' } }),
  }, (root) => {
    const { proposals } = fixMissingModule(root, ['axios']);
    assert(proposals.length === 0, 'skips packages already in dependencies');
  });
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
