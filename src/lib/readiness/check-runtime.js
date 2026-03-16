'use strict';

/**
 * Runtime Readiness Check
 *
 * Verifies the project can start:
 * - start / dev / build scripts exist in package.json
 * - a valid entrypoint file exists
 * - no obviously missing runtime files
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').ReadinessInput} input
 * @returns {import('./types').RuntimeCheckResult}
 */
function checkRuntime(input) {
  const { files = {}, stack = {} } = input;
  const filePaths  = Object.keys(files);
  const fileNames  = filePaths.map(p => p.split('/').pop());

  /** @type {import('./types').ReadinessIssue[]} */
  const issues = [];

  // ── package.json scripts ────────────────────────────────────────────────
  const pkgJson = _parsePkgJson(files);
  const scripts = pkgJson?.scripts || {};

  const hasStartScript = Boolean(scripts.start || scripts.serve);
  const hasDevScript   = Boolean(scripts.dev || scripts.develop || scripts.watch);
  const hasBuildScript = Boolean(scripts.build || scripts.compile || scripts['build:prod']);

  // Next.js / React / Vite projects don't need an explicit start script check
  const isFrameworkManaged = _isFrameworkManaged(filePaths, files);

  if (!hasStartScript && _isServerProject(filePaths, stack) && !isFrameworkManaged && !_isStaticProject(filePaths, files)) {
    issues.push({
      severity: 'critical',
      category: 'runtime',
      message:  'No start script in package.json',
      fix:      'Add "start": "node server.js" (or equivalent) to package.json scripts',
      file:     'package.json',
    });
  }

  if (!hasDevScript) {
    issues.push({
      severity: 'warning',
      category: 'runtime',
      message:  'No dev script in package.json',
      fix:      'Add "dev": "nodemon server.js" (or equivalent) to package.json scripts',
      file:     'package.json',
    });
  }

  // ── Entrypoint detection ─────────────────────────────────────────────────
  const entrypointFile = _detectEntrypoint(filePaths, pkgJson, stack);
  const hasEntrypoint  = Boolean(entrypointFile);

  if (!hasEntrypoint && _isServerProject(filePaths, stack) && !_isStaticProject(filePaths, files) && !isFrameworkManaged) {
    issues.push({
      severity: 'critical',
      category: 'runtime',
      message:  'No server entrypoint found (expected server.js, index.js, app.js, or main field in package.json)',
      fix:      'Create server.js or index.js as the application entrypoint',
    });
  }

  // ── Missing runtime files ────────────────────────────────────────────────
  const missingFiles = _detectMissingRuntimeFiles(filePaths, pkgJson, stack);
  for (const mf of missingFiles) {
    issues.push({
      severity: 'warning',
      category: 'runtime',
      message:  `Expected runtime file missing: ${mf}`,
      fix:      `Create ${mf}`,
    });
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 30;
    else if (issue.severity === 'warning') score -= 10;
  }
  score = Math.max(0, score);

  return {
    hasStartScript,
    hasDevScript,
    hasBuildScript,
    hasEntrypoint,
    entrypointFile: entrypointFile || undefined,
    missingFiles,
    issues,
    score,
  };
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _parsePkgJson(files) {
  const raw = files['package.json'] || files['./package.json'];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function _isFrameworkManaged(filePaths, files) {
  // Frameworks that manage their own process lifecycle
  const pkgRaw = files['package.json'] || files['./package.json'];
  const pkg = pkgRaw ? ((() => { try { return JSON.parse(pkgRaw); } catch (_) { return {}; } })()) : {};
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  if (deps['next']) return true;
  if (deps['expo']) return true;
  if (deps['react-scripts']) return true;
  if (filePaths.some(p => p.endsWith('next.config.js') || p.endsWith('next.config.mjs'))) return true;
  return false;
}

function _isStaticProject(filePaths, files) {
  const hasHtml = filePaths.some(p => p.endsWith('.html'));
  if (!hasHtml) return false;
  // Static if no server framework in package.json
  const pkgRaw = files['package.json'] || files['./package.json'];
  const pkg = pkgRaw ? ((() => { try { return JSON.parse(pkgRaw); } catch (_) { return {}; } })()) : {};
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const serverFrameworks = ['express', 'fastify', 'koa', 'hapi', 'next', 'expo'];
  const hasServerFramework = serverFrameworks.some(f => deps[f]);
  const hasServerFile = filePaths.some(p =>
    p.endsWith('server.js') || p.endsWith('server.ts') ||
    p.endsWith('src/server.js') || p.endsWith('src/index.js'),
  );
  return !hasServerFramework && !hasServerFile;
}

function _isServerProject(filePaths, stack) {
  if (stack?.runtime === 'node' || stack?.backend) return true;
  const serverIndicators = ['server.js', 'index.js', 'app.js', 'main.js', 'server.ts', 'index.ts'];
  return serverIndicators.some(f => filePaths.some(p => p.endsWith(f)));
}

function _detectEntrypoint(filePaths, pkgJson, stack) {
  // Check package.json main field
  if (pkgJson?.main) {
    const mainPath = pkgJson.main.replace(/^\.\//, '');
    if (filePaths.some(p => p.endsWith(mainPath) || p === mainPath)) return mainPath;
  }

  // Common entrypoint names
  const candidates = ['server.js', 'index.js', 'app.js', 'main.js', 'src/server.js', 'src/index.js', 'src/app.js'];
  for (const c of candidates) {
    if (filePaths.some(p => p === c || p.endsWith(`/${c}`))) return c;
  }

  // Next.js / React — no explicit entrypoint needed
  if (filePaths.some(p => p.endsWith('next.config.js') || p.endsWith('next.config.mjs'))) return 'next.config.js';
  if (filePaths.some(p => p.endsWith('vite.config.js') || p.endsWith('vite.config.ts'))) return 'vite.config.js';

  // Static HTML projects
  if (filePaths.some(p => p === 'index.html' || p.endsWith('/index.html'))) return 'index.html';

  return null;
}

function _detectMissingRuntimeFiles(filePaths, pkgJson, stack) {
  const missing = [];

  // If package.json exists but no node_modules is referenced, no issue (expected)
  // Check that the file referenced in main actually exists
  if (pkgJson?.main) {
    const mainPath = pkgJson.main.replace(/^\.\//, '');
    if (!filePaths.some(p => p === mainPath || p.endsWith(`/${mainPath}`))) {
      missing.push(mainPath);
    }
  }

  return missing;
}

module.exports = { checkRuntime };
