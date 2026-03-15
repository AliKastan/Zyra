'use strict';

/**
 * DEPENDENCY VALIDATION
 *
 * Checks that every non-relative, non-built-in package used in JS files
 * is declared in package.json dependencies or devDependencies.
 *
 * Checks:
 *   - package.json exists (if server-side code detected)       [major — skips rest if absent]
 *   - require('pkg') / import from 'pkg' are in package.json   [major]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateDependencies(ctx) {
  const { fileMap, filePaths } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  // No package.json → skip (validated in validateFileMap)
  if (!filePaths.has('package.json')) {
    return { status: 'pass', issues: [] };
  }

  // Parse package.json
  let pkg;
  try {
    pkg = JSON.parse(fileMap.get('package.json'));
  } catch {
    issues.push({
      id:         'invalid_package_json',
      severity:   'major',
      message:    'package.json exists but contains invalid JSON',
      file:       'package.json',
      suggestion: 'Fix JSON syntax in package.json',
    });
    return { status: 'fail', issues };
  }

  const declared = new Set([
    ...Object.keys(pkg.dependencies       || {}),
    ...Object.keys(pkg.devDependencies    || {}),
    ...Object.keys(pkg.peerDependencies   || {}),
  ]);

  // Collect all packages used in JS files
  const usedPackages = new Map(); // pkgName → Set<fromFile>

  for (const [filePath, content] of fileMap) {
    if (!filePath.endsWith('.js') && !filePath.endsWith('.ts')) continue;
    if (!content) continue;

    // require('pkg') — capture bare specifier
    for (const m of content.matchAll(/require\s*\(\s*['"]([^.'"\/][^'"]*)['"]\s*\)/g)) {
      const pkg = _extractPackageName(m[1]);
      if (pkg && !_isBuiltIn(pkg)) {
        if (!usedPackages.has(pkg)) usedPackages.set(pkg, new Set());
        usedPackages.get(pkg).add(filePath);
      }
    }

    // import ... from 'pkg'
    for (const m of content.matchAll(/from\s+['"]([^.'"\/][^'"]*)['"]/g)) {
      const pkg = _extractPackageName(m[1]);
      if (pkg && !_isBuiltIn(pkg)) {
        if (!usedPackages.has(pkg)) usedPackages.set(pkg, new Set());
        usedPackages.get(pkg).add(filePath);
      }
    }
  }

  // Check each used package against declared
  for (const [pkgName, fromFiles] of usedPackages) {
    if (!declared.has(pkgName)) {
      const filesStr = [...fromFiles].slice(0, 3).join(', ');
      issues.push({
        id:         `missing_dependency:${pkgName}`,
        severity:   'major',
        message:    `Package "${pkgName}" is used in code but not declared in package.json (used in: ${filesStr})`,
        file:       'package.json',
        suggestion: `Add "${pkgName}" to package.json dependencies`,
      });
    }
  }

  return { status: _checkStatus(issues), issues };
}

/**
 * Extract the npm package name from a specifier like 'pkg', '@scope/pkg', 'pkg/sub'.
 * @param {string} specifier
 * @returns {string|null}
 */
function _extractPackageName(specifier) {
  if (!specifier) return null;
  // Skip relative paths
  if (specifier.startsWith('.')) return null;
  // Scoped package: @scope/name
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return null;
  }
  // Regular package: take only the root name
  return specifier.split('/')[0] || null;
}

/** Node.js built-in module names (v18+) */
const BUILT_INS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'stream/consumers', 'stream/promises', 'stream/web', 'string_decoder',
  'timers', 'timers/promises', 'tls', 'trace_events', 'tty', 'url', 'util',
  'util/types', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  // node: prefix variants
  'node:fs', 'node:path', 'node:http', 'node:https', 'node:crypto',
  'node:os', 'node:url', 'node:util', 'node:stream', 'node:events',
  'node:buffer', 'node:process', 'node:child_process',
]);

function _isBuiltIn(name) {
  return BUILT_INS.has(name) || name.startsWith('node:');
}

/**
 * @param {import('./types').ValidationIssue[]} issues
 * @returns {import('./types').CheckStatus}
 */
function _checkStatus(issues) {
  if (issues.length === 0) return 'pass';
  if (issues.some(i => i.severity === 'critical' || i.severity === 'major')) return 'fail';
  return 'warning';
}

module.exports = { validateDependencies };
