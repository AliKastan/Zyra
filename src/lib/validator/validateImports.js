'use strict';

const path = require('path');

/**
 * IMPORT / REFERENCE VALIDATION
 *
 * Resolves relative imports/references across all generated files and checks
 * whether the target file actually exists. Only relative paths are checked —
 * CDN/npm/external URLs are always skipped.
 *
 * Checks:
 *   - HTML: <script src>, <link href>, <img src> with relative paths  [major]
 *   - JS:   require('./...'), import from './...'                      [major]
 *   - CSS:  @import url('./...') / @import './...'                    [major]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateImports(ctx) {
  const { fileMap, filePaths } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  for (const [filePath, content] of fileMap) {
    if (!content) continue;

    if (filePath.endsWith('.html')) {
      _checkHtmlRefs(filePath, content, filePaths, issues);
    } else if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
      _checkJsImports(filePath, content, filePaths, issues);
    } else if (filePath.endsWith('.css')) {
      _checkCssImports(filePath, content, filePaths, issues);
    }
  }

  return { status: _checkStatus(issues), issues };
}

// ── HTML reference checking ───────────────────────────────────────────────────

function _checkHtmlRefs(filePath, content, filePaths, issues) {
  const dir = path.dirname(filePath);

  // <script src="...">
  for (const m of content.matchAll(/\bsrc=["']([^"'?#]+)["']/g)) {
    _checkRef(filePath, dir, m[1], filePaths, issues, 'html_broken_src');
  }

  // <link href="..."> — only CSS/font refs, not external
  for (const m of content.matchAll(/\bhref=["']([^"'?#]+\.(?:css|js))["']/g)) {
    _checkRef(filePath, dir, m[1], filePaths, issues, 'html_broken_href');
  }
}

// ── JS import/require checking ────────────────────────────────────────────────

function _checkJsImports(filePath, content, filePaths, issues) {
  const dir = path.dirname(filePath);

  // require('./...')
  for (const m of content.matchAll(/require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    _checkRef(filePath, dir, m[1], filePaths, issues, 'js_broken_require');
  }

  // import ... from './...'
  for (const m of content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    _checkRef(filePath, dir, m[1], filePaths, issues, 'js_broken_import');
  }

  // import('./...')  — dynamic
  for (const m of content.matchAll(/import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    _checkRef(filePath, dir, m[1], filePaths, issues, 'js_broken_dynamic_import');
  }
}

// ── CSS @import checking ──────────────────────────────────────────────────────

function _checkCssImports(filePath, content, filePaths, issues) {
  const dir = path.dirname(filePath);

  // @import url('./...') or @import './...'
  for (const m of content.matchAll(/@import\s+(?:url\s*\(\s*)?['"](\.[^'"]+)['"]/g)) {
    _checkRef(filePath, dir, m[1], filePaths, issues, 'css_broken_import');
  }
}

// ── Shared resolution helper ──────────────────────────────────────────────────

function _checkRef(fromFile, fromDir, ref, filePaths, issues, issueId) {
  // Skip external URLs and absolute paths
  if (/^https?:\/\//.test(ref) || ref.startsWith('//') || ref.startsWith('/')) return;
  // Skip data URIs
  if (ref.startsWith('data:')) return;
  // Only check relative paths
  if (!ref.startsWith('.')) return;

  // Normalise Windows separators and resolve
  let resolved = path.posix.normalize(
    path.posix.join(fromDir.replace(/\\/g, '/'), ref.replace(/\\/g, '/'))
  );

  // Strip leading './' for consistent matching
  if (resolved.startsWith('./')) resolved = resolved.slice(2);

  // Try exact match first
  if (filePaths.has(resolved)) return;

  // Try with common extensions if the import has none
  if (!path.extname(resolved)) {
    for (const ext of ['.js', '.ts', '.html', '.css', '.json']) {
      if (filePaths.has(resolved + ext)) return;
    }
    // Also check index files
    for (const ext of ['.js', '.ts']) {
      if (filePaths.has(`${resolved}/index${ext}`)) return;
    }
  }

  issues.push({
    id:         `${issueId}:${resolved}`,
    severity:   'major',
    message:    `"${fromFile}" references "${ref}" which does not exist (resolved: "${resolved}")`,
    file:       fromFile,
    suggestion: `Create the missing file "${resolved}" or fix the import path in "${fromFile}"`,
  });
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

module.exports = { validateImports };
