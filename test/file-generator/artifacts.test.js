'use strict';

const assert = require('assert');
const { classifyFile }              = require('../../src/lib/file-generator/classifyFile');
const { detectDependencies, sortByDependencyOrder } = require('../../src/lib/file-generator/resolveFileDependencies');
const { buildFileArtifacts }        = require('../../src/lib/file-generator/buildFileArtifacts');
const { validateFileArtifacts }     = require('../../src/lib/file-generator/validateFileArtifacts');
const { buildFileMap }              = require('../../src/lib/file-generator/buildFileMap');
const { buildGeneratedProjectFiles } = require('../../src/lib/file-generator/index');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// 1. classifyFile
// ---------------------------------------------------------------------------
console.log('\n1. classifyFile');

test('index.html → page', () => {
  const r = classifyFile('index.html');
  assert.strictEqual(r.type, 'page');
  assert.ok(r.description.length > 0, 'description should be non-empty');
});

test('admin.html → page', () => {
  const r = classifyFile('admin.html');
  assert.strictEqual(r.type, 'page');
  assert.ok(r.description.length > 0);
});

test('style.css → frontend', () => {
  const r = classifyFile('style.css');
  assert.strictEqual(r.type, 'frontend');
  assert.ok(r.description.length > 0);
});

test('app.js → frontend', () => {
  const r = classifyFile('app.js');
  assert.strictEqual(r.type, 'frontend');
  assert.ok(r.description.length > 0);
});

test('admin.js → page', () => {
  const r = classifyFile('admin.js');
  assert.strictEqual(r.type, 'page');
  assert.ok(r.description.length > 0);
});

test('billing.js → integration', () => {
  const r = classifyFile('billing.js');
  assert.strictEqual(r.type, 'integration');
  assert.ok(r.description.length > 0);
});

test('ai-service.js → integration', () => {
  const r = classifyFile('ai-service.js');
  assert.strictEqual(r.type, 'integration');
  assert.ok(r.description.length > 0);
});

test('package.json → config', () => {
  const r = classifyFile('package.json');
  assert.strictEqual(r.type, 'config');
  assert.ok(r.description.length > 0);
});

test('.env.example → environment', () => {
  const r = classifyFile('.env.example');
  assert.strictEqual(r.type, 'environment');
  assert.ok(r.description.length > 0);
});

test('README.md → documentation', () => {
  const r = classifyFile('README.md');
  assert.strictEqual(r.type, 'documentation');
  assert.ok(r.description.length > 0);
});

test('data-utils.js → utility', () => {
  const r = classifyFile('data-utils.js');
  assert.strictEqual(r.type, 'utility');
  assert.ok(r.description.length > 0);
});

test('auth.js → utility', () => {
  const r = classifyFile('auth.js');
  assert.strictEqual(r.type, 'utility');
  assert.ok(r.description.length > 0);
});

// ---------------------------------------------------------------------------
// 2. detectDependencies
// ---------------------------------------------------------------------------
console.log('\n2. detectDependencies');

test('HTML with href and src → detects both CSS and JS', () => {
  const html = `<!DOCTYPE html><html><head>
    <link rel="stylesheet" href="style.css">
  </head><body>
    <script src="app.js"></script>
  </body></html>`;
  const allPaths = ['index.html', 'style.css', 'app.js'];
  const deps = detectDependencies('index.html', html, allPaths);
  assert.ok(deps.includes('style.css'), `expected style.css in deps, got: ${JSON.stringify(deps)}`);
  assert.ok(deps.includes('app.js'), `expected app.js in deps, got: ${JSON.stringify(deps)}`);
});

test('JS file with require("./auth") → detects auth.js', () => {
  const js = `'use strict';\nconst auth = require('./auth');\nconsole.log(auth);`;
  const allPaths = ['app.js', 'auth.js'];
  const deps = detectDependencies('app.js', js, allPaths);
  // Should include 'auth.js' or 'auth' depending on what's in allPaths
  const found = deps.some(d => d === 'auth.js' || d === 'auth');
  assert.ok(found, `expected auth.js or auth in deps, got: ${JSON.stringify(deps)}`);
});

test('CSS file with no @import → empty deps', () => {
  const css = `body { margin: 0; } h1 { color: red; }`;
  const allPaths = ['style.css', 'app.js'];
  const deps = detectDependencies('style.css', css, allPaths);
  assert.deepStrictEqual(deps, []);
});

test('Only include deps in allPaths set', () => {
  const html = `<html><head><link href="missing.css"></head><body><script src="app.js"></script></body></html>`;
  const allPaths = ['index.html', 'app.js']; // missing.css NOT in allPaths
  const deps = detectDependencies('index.html', html, allPaths);
  assert.ok(!deps.includes('missing.css'), 'missing.css should not be included');
  assert.ok(deps.includes('app.js'), 'app.js should be included');
});

// ---------------------------------------------------------------------------
// 3. sortByDependencyOrder
// ---------------------------------------------------------------------------
console.log('\n3. sortByDependencyOrder');

test('config/env/docs before CSS, CSS before JS, JS before HTML', () => {
  const files = [
    { path: 'index.html',   content: '<html></html>' },
    { path: 'app.js',       content: 'console.log("hello world!");' },
    { path: 'style.css',    content: 'body { margin: 0; }' },
    { path: '.env.example', content: 'API_KEY=your_key_here' },
    { path: 'README.md',    content: '# My Project\nThis is a README.' },
    { path: 'package.json', content: '{"name":"test"}' },
  ];
  const sorted = sortByDependencyOrder(files);
  const paths = sorted.map(f => f.path);

  const envIdx     = paths.indexOf('.env.example');
  const pkgIdx     = paths.indexOf('package.json');
  const readmeIdx  = paths.indexOf('README.md');
  const cssIdx     = paths.indexOf('style.css');
  const jsIdx      = paths.indexOf('app.js');
  const htmlIdx    = paths.indexOf('index.html');

  assert.ok(envIdx < cssIdx,    `env (${envIdx}) should come before CSS (${cssIdx})`);
  assert.ok(pkgIdx < cssIdx,    `package.json (${pkgIdx}) should come before CSS (${cssIdx})`);
  assert.ok(readmeIdx < cssIdx, `README (${readmeIdx}) should come before CSS (${cssIdx})`);
  assert.ok(cssIdx < jsIdx,     `CSS (${cssIdx}) should come before JS (${jsIdx})`);
  assert.ok(jsIdx < htmlIdx,    `JS (${jsIdx}) should come before HTML (${htmlIdx})`);
});

// ---------------------------------------------------------------------------
// 4. buildFileArtifacts
// ---------------------------------------------------------------------------
console.log('\n4. buildFileArtifacts');

test('Each artifact has required fields', () => {
  const rawFiles = [
    { path: 'index.html', content: '<html><body>Hello World!</body></html>' },
    { path: 'style.css',  content: 'body { font-family: sans-serif; margin: 0; }' },
  ];
  const artifacts = buildFileArtifacts(rawFiles);
  for (const a of artifacts) {
    assert.ok(a.path, 'has path');
    assert.ok(a.type, 'has type');
    assert.ok(a.description, 'has description');
    assert.ok(typeof a.content === 'string', 'has content');
    assert.ok(a.operation === 'create' || a.operation === 'update', 'has valid operation');
    assert.ok(Array.isArray(a.dependencies), 'has dependencies array');
    assert.ok(typeof a.sizeBytes === 'number', 'has sizeBytes');
    assert.ok(typeof a.valid === 'boolean', 'has valid flag');
  }
});

test('operation is create when not in existingPaths', () => {
  const rawFiles = [{ path: 'index.html', content: '<html><body>Hello World!</body></html>' }];
  const artifacts = buildFileArtifacts(rawFiles, { existingPaths: new Set() });
  assert.strictEqual(artifacts[0].operation, 'create');
});

test('operation is update when path IS in existingPaths', () => {
  const rawFiles = [{ path: 'index.html', content: '<html><body>Hello World!</body></html>' }];
  const artifacts = buildFileArtifacts(rawFiles, { existingPaths: new Set(['index.html']) });
  assert.strictEqual(artifacts[0].operation, 'update');
});

test('sizeBytes > 0 for non-empty content', () => {
  const rawFiles = [{ path: 'style.css', content: 'body { margin: 0; font-size: 16px; }' }];
  const artifacts = buildFileArtifacts(rawFiles);
  assert.ok(artifacts[0].sizeBytes > 0);
});

test('valid=false for content shorter than 20 chars', () => {
  const rawFiles = [{ path: 'style.css', content: 'short' }];
  const artifacts = buildFileArtifacts(rawFiles);
  assert.strictEqual(artifacts[0].valid, false);
});

// ---------------------------------------------------------------------------
// 5. validateFileArtifacts
// ---------------------------------------------------------------------------
console.log('\n5. validateFileArtifacts');

test('Duplicate path → duplicate error', () => {
  const artifacts = [
    { path: 'index.html', content: '<html><body>Hello World!</body></html>', type: 'page', description: 'x', operation: 'create', dependencies: [], sizeBytes: 10, valid: true },
    { path: 'index.html', content: '<html><body>Duplicate page</body></html>', type: 'page', description: 'x', operation: 'create', dependencies: [], sizeBytes: 10, valid: true },
  ];
  const issues = validateFileArtifacts(artifacts);
  const dupIssue = issues.find(i => i.type === 'duplicate');
  assert.ok(dupIssue, 'should have a duplicate issue');
  assert.strictEqual(dupIssue.severity, 'error');
});

test('Empty content → empty_file error', () => {
  const artifacts = [
    { path: 'style.css', content: '', type: 'frontend', description: 'x', operation: 'create', dependencies: [], sizeBytes: 0, valid: false },
  ];
  const issues = validateFileArtifacts(artifacts);
  const emptyIssue = issues.find(i => i.type === 'empty_file');
  assert.ok(emptyIssue, 'should have an empty_file issue');
  assert.strictEqual(emptyIssue.severity, 'error');
});

test('Path with .. → invalid_path error', () => {
  const artifacts = [
    { path: '../etc/passwd', content: 'some content longer than twenty chars here', type: 'utility', description: 'x', operation: 'create', dependencies: [], sizeBytes: 10, valid: true },
  ];
  const issues = validateFileArtifacts(artifacts);
  const pathIssue = issues.find(i => i.type === 'invalid_path');
  assert.ok(pathIssue, 'should have an invalid_path issue');
  assert.strictEqual(pathIssue.severity, 'error');
});

test('HTML referencing missing CSS → broken_reference warning', () => {
  const artifacts = [
    {
      path: 'index.html',
      content: '<!DOCTYPE html><html><head><link rel="stylesheet" href="style.css"></head><body>Hello World Page Content</body></html>',
      type: 'page',
      description: 'x',
      operation: 'create',
      dependencies: [],
      sizeBytes: 100,
      valid: true,
    },
    // style.css is NOT included
  ];
  const issues = validateFileArtifacts(artifacts);
  const refIssue = issues.find(i => i.type === 'broken_reference');
  assert.ok(refIssue, 'should have a broken_reference issue');
  assert.strictEqual(refIssue.severity, 'warning');
});

test('Content with TODO → stub_content warning', () => {
  const artifacts = [
    { path: 'app.js', content: 'function init() { /* TODO: implement this function properly */ return null; }', type: 'frontend', description: 'x', operation: 'create', dependencies: [], sizeBytes: 50, valid: true },
  ];
  const issues = validateFileArtifacts(artifacts);
  const stubIssue = issues.find(i => i.type === 'stub_content');
  assert.ok(stubIssue, 'should have a stub_content issue');
  assert.strictEqual(stubIssue.severity, 'warning');
});

test('Content with FIXME → stub_content warning', () => {
  const artifacts = [
    { path: 'app.js', content: 'function compute() { /* FIXME: fix the calculation logic here */ return 42; }', type: 'frontend', description: 'x', operation: 'create', dependencies: [], sizeBytes: 50, valid: true },
  ];
  const issues = validateFileArtifacts(artifacts);
  const stubIssue = issues.find(i => i.type === 'stub_content');
  assert.ok(stubIssue, 'should have a stub_content issue');
});

test('Clean files → 0 issues', () => {
  const artifacts = [
    { path: 'index.html', content: '<!DOCTYPE html><html><head><title>App</title></head><body><h1>Hello</h1></body></html>', type: 'page', description: 'x', operation: 'create', dependencies: [], sizeBytes: 80, valid: true },
    { path: 'style.css', content: 'body { margin: 0; font-family: sans-serif; line-height: 1.5; }', type: 'frontend', description: 'x', operation: 'create', dependencies: [], sizeBytes: 60, valid: true },
  ];
  const issues = validateFileArtifacts(artifacts);
  assert.strictEqual(issues.length, 0, `expected 0 issues, got: ${JSON.stringify(issues)}`);
});

// ---------------------------------------------------------------------------
// 6. buildFileMap
// ---------------------------------------------------------------------------
console.log('\n6. buildFileMap');

test('Returns {files, projectName, tier}', () => {
  const blueprint = { projectName: 'my-app', fileList: ['index.html', 'style.css'] };
  const result = buildFileMap(blueprint, null);
  assert.ok(Array.isArray(result.files), 'has files array');
  assert.strictEqual(result.projectName, 'my-app');
  assert.ok(result.tier, 'has tier');
});

test('Always includes README.md', () => {
  const blueprint = { projectName: 'test', fileList: ['index.html'] };
  const result = buildFileMap(blueprint, null);
  assert.ok(result.files.some(f => f.path === 'README.md'), 'should have README.md');
});

test('Includes .env.example when hasAuth=true', () => {
  const blueprint = { projectName: 'test', fileList: ['index.html'] };
  const complexityReport = { complexityTier: 'medium', signals: { hasAuth: true } };
  const result = buildFileMap(blueprint, complexityReport);
  assert.ok(result.files.some(f => f.path === '.env.example'), 'should have .env.example');
});

test('Includes admin.html + admin.js when hasAdmin=true', () => {
  const blueprint = { projectName: 'test', fileList: ['index.html'] };
  const complexityReport = { complexityTier: 'complex', signals: { hasAdmin: true } };
  const result = buildFileMap(blueprint, complexityReport);
  assert.ok(result.files.some(f => f.path === 'admin.html'), 'should have admin.html');
  assert.ok(result.files.some(f => f.path === 'admin.js'), 'should have admin.js');
});

test('Includes billing.js when hasPayments=true', () => {
  const blueprint = { projectName: 'test', fileList: ['index.html'] };
  const complexityReport = { complexityTier: 'complex', signals: { hasPayments: true } };
  const result = buildFileMap(blueprint, complexityReport);
  assert.ok(result.files.some(f => f.path === 'billing.js'), 'should have billing.js');
});

test('All entries have type, description, required, path', () => {
  const blueprint = { projectName: 'test', fileList: ['index.html', 'app.js'] };
  const result = buildFileMap(blueprint, null);
  for (const entry of result.files) {
    assert.ok(entry.path, 'has path');
    assert.ok(entry.type, 'has type');
    assert.ok(entry.description, 'has description');
    assert.ok(typeof entry.required === 'boolean', 'has required flag');
  }
});

// ---------------------------------------------------------------------------
// 7. buildGeneratedProjectFiles (integration)
// ---------------------------------------------------------------------------
console.log('\n7. buildGeneratedProjectFiles (integration)');

test('Returns {artifacts, issues, totalFiles, totalBytes, filesByType, valid}', () => {
  const rawFiles = [
    { path: 'index.html', content: '<!DOCTYPE html><html><head><title>App</title></head><body><h1>Hello</h1></body></html>' },
    { path: 'style.css',  content: 'body { margin: 0; font-family: sans-serif; line-height: 1.5; color: #333; }' },
    { path: 'app.js',     content: 'document.addEventListener("DOMContentLoaded", function() { console.log("ready"); });' },
  ];
  const result = buildGeneratedProjectFiles(rawFiles);
  assert.ok(Array.isArray(result.artifacts), 'has artifacts');
  assert.ok(Array.isArray(result.issues), 'has issues');
  assert.ok(typeof result.totalFiles === 'number', 'has totalFiles');
  assert.ok(typeof result.totalBytes === 'number', 'has totalBytes');
  assert.ok(typeof result.filesByType === 'object', 'has filesByType');
  assert.ok(typeof result.valid === 'boolean', 'has valid');
});

test('filesByType is a count per type', () => {
  const rawFiles = [
    { path: 'index.html', content: '<!DOCTYPE html><html><head><title>App</title></head><body><h1>Hello</h1></body></html>' },
    { path: 'style.css',  content: 'body { margin: 0; font-family: sans-serif; line-height: 1.5; color: #333; }' },
  ];
  const result = buildGeneratedProjectFiles(rawFiles);
  assert.ok(result.filesByType['page'] >= 1, 'page count >= 1');
  assert.ok(result.filesByType['frontend'] >= 1, 'frontend count >= 1');
});

test('totalBytes = sum of all artifact sizeBytes', () => {
  const rawFiles = [
    { path: 'index.html', content: '<!DOCTYPE html><html><head><title>App</title></head><body><h1>Hello</h1></body></html>' },
    { path: 'style.css',  content: 'body { margin: 0; font-family: sans-serif; }' },
  ];
  const result = buildGeneratedProjectFiles(rawFiles);
  const expectedBytes = result.artifacts.reduce((sum, a) => sum + a.sizeBytes, 0);
  assert.strictEqual(result.totalBytes, expectedBytes);
});

test('valid=false when errors present (duplicate file)', () => {
  const rawFiles = [
    { path: 'index.html', content: '<!DOCTYPE html><html><head></head><body>Page 1 content here</body></html>' },
    { path: 'index.html', content: '<!DOCTYPE html><html><head></head><body>Page 2 duplicate!!</body></html>' },
  ];
  const result = buildGeneratedProjectFiles(rawFiles);
  assert.strictEqual(result.valid, false, 'should be invalid due to duplicate');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
Promise.resolve().then(() => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
});
