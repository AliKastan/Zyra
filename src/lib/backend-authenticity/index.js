'use strict';

/**
 * Backend Authenticity Checker — Public API
 *
 * Scans generated code and detects fake backend patterns before the project
 * is delivered. Runs as Stage 13 (post-packaging) of the Zyra pipeline.
 *
 * Primary entry point:
 *   checkBackendAuthenticity(input)  — runs all checkers, returns BackendAuthenticityReport
 */

const { checkFakeApi }           = require('./check-fake-api');
const { checkFakeAuth }          = require('./check-fake-auth');
const { checkFakeDb }            = require('./check-fake-db');
const { checkFakeBilling }       = require('./check-fake-billing');
const { checkFakeIntegrations }  = require('./check-fake-integrations');
const { checkFakeDashboard }     = require('./check-fake-dashboard');
const { checkFakeAdmin }         = require('./check-fake-admin');
const {
  buildAuthenticityReport,
  summarizeAuthenticity,
  buildUiAuthenticityPayload,
} = require('./build-authenticity-report');

// ── Primary entry point ──────────────────────────────────────────────────────

/**
 * Run all authenticity checks and return a structured report.
 *
 * @param {import('./types').AuthenticityInput} input
 * @returns {import('./types').BackendAuthenticityReport}
 */
function checkBackendAuthenticity(input) {
  const files = _normalizeFiles(input.files || {});

  // Static-only projects don't need backend checks
  if (_isStaticProject(files)) {
    return buildAuthenticityReport([]);  // 'authentic_backend' — static is fine
  }

  // Collect issues from all checkers
  const issues = [
    ...checkFakeApi(files),
    ...checkFakeAuth(files),
    ...checkFakeDb(files),
    ...checkFakeBilling(files),
    ...checkFakeIntegrations(files),
    ...checkFakeDashboard(files),
    ...checkFakeAdmin(files),
  ];

  // Deduplicate by id across all checkers
  const seen = new Set();
  const dedupedIssues = issues.filter(issue => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });

  return buildAuthenticityReport(dedupedIssues);
}

// ── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Detect fake backend patterns in generated files.
 * Alias for checkBackendAuthenticity for use in the repair system.
 *
 * @param {import('./types').AuthenticityInput} input
 * @returns {import('./types').AuthenticityIssue[]}
 */
function detectFakeBackendPatterns(input) {
  const report = checkBackendAuthenticity(input);
  return report.fakeBackendIssues;
}

/**
 * Get features that are blocked due to unimplemented backend.
 * @param {import('./types').BackendAuthenticityReport} report
 * @returns {import('./types').BlockedFeature[]}
 */
function getBlockedFeatures(report) {
  return report.blockedFeatures || [];
}

/**
 * Get features that are acceptable placeholders (require external configuration).
 * @param {import('./types').BackendAuthenticityReport} report
 * @returns {import('./types').PlaceholderFeature[]}
 */
function getPlaceholderFeatures(report) {
  return report.placeholderFeatures || [];
}

/**
 * True when no critical/high fake backend patterns were found.
 * @param {import('./types').BackendAuthenticityReport} report
 * @returns {boolean}
 */
function isBackendAuthentic(report) {
  return report.status === 'authentic_backend' || report.status === 'placeholder_only';
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _normalizeFiles(files) {
  if (files instanceof Map) {
    const obj = {};
    for (const [k, v] of files) obj[k] = typeof v === 'string' ? v : (v?.content || '');
    return obj;
  }
  if (Array.isArray(files)) {
    const obj = {};
    for (const f of files) {
      if (f && f.path) obj[f.path] = f.content || '';
    }
    return obj;
  }
  return files;
}

function _isStaticProject(files) {
  const paths = Object.keys(files);
  const hasHtml     = paths.some(p => p.endsWith('.html'));
  const hasServer   = paths.some(p =>
    p.endsWith('server.js') || p.endsWith('server.ts') ||
    p.includes('routes/')   || p.includes('controllers/')
  );
  const hasPackage  = files['package.json'];
  const hasDeps     = hasPackage && (
    /express|fastify|koa|hapi|nestjs/i.test(files['package.json'] || '')
  );

  return hasHtml && !hasServer && !hasDeps;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Primary entry point
  checkBackendAuthenticity,

  // Individual checkers (for selective use)
  checkFakeApi,
  checkFakeAuth,
  checkFakeDb,
  checkFakeBilling,
  checkFakeIntegrations,
  checkFakeDashboard,
  checkFakeAdmin,

  // Report
  buildAuthenticityReport,
  summarizeAuthenticity,
  buildUiAuthenticityPayload,

  // Helpers
  detectFakeBackendPatterns,
  getBlockedFeatures,
  getPlaceholderFeatures,
  isBackendAuthentic,
};
