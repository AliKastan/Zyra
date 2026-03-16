'use strict';

/**
 * In-Flight Prevention Checks
 *
 * Runs AFTER files are generated but BEFORE packaging/validation.
 * Catches issues that only become visible in the actual generated output:
 * - hardcoded ports in server files
 * - localhost-only assumptions
 * - missing env file
 * - missing health route in generated server
 * - imports to missing modules
 * - missing error handling in async functions
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').InFlightPreventionInput} input
 * @returns {import('./types').PreventionIssue[]}
 */
function runInFlightPreventionChecks(input) {
  const { files: rawFiles = {}, blueprint = {}, intent = {}, stack = {}, stage = 'post-generation' } = input;

  const files = _normalizeFiles(rawFiles);
  const issues = [];

  const filePaths  = Object.keys(files);
  const allContent = Object.values(files).join('\n');
  const appType    = (intent.appType || '').toLowerCase();
  const isMobile   = appType === 'mobile' || /expo|react.native/.test(allContent);
  const isServer   = !isMobile && (
    filePaths.some(p => p.endsWith('server.js') || p.endsWith('src/index.js')) ||
    allContent.includes("require('express')") || allContent.includes('from "express"')
  );

  // ── Hardcoded port ────────────────────────────────────────────────────────
  if (isServer) {
    const portIssue = _checkHardcodedPort(files);
    if (portIssue) issues.push(portIssue);
  }

  // ── Health route ──────────────────────────────────────────────────────────
  if (isServer) {
    const hasHealthRoute = allContent.includes('/health') || allContent.includes("'/health'") || allContent.includes('"/health"');
    if (!hasHealthRoute) {
      issues.push({
        id: 'inflight-missing-health-route',
        category: 'healthcheck',
        severity: 'medium',
        action: 'warning_only',
        reason: 'Generated server has no /health route. Deployment platforms will fail health checks.',
        fix: 'Add: app.get("/health", (req, res) => res.json({ ok: true, uptime: process.uptime() }))',
      });
    }
  }

  // ── Missing .env.example ──────────────────────────────────────────────────
  const hasEnvExample = filePaths.some(p => p === '.env.example' || p.endsWith('/.env.example'));
  const hasEnvVarUsage = /process\.env\.[A-Z_]{3,}/.test(allContent);
  if (!hasEnvExample && hasEnvVarUsage) {
    issues.push({
      id: 'inflight-missing-env-example',
      category: 'env',
      severity: 'medium',
      action: 'warning_only',
      reason: 'Generated code uses environment variables but no .env.example file was produced.',
      fix: 'Add .env.example listing all process.env.* variables used in the project',
    });
  }

  // ── Localhost hardcoded in callbacks/config ────────────────────────────────
  const localhostInCode = _checkLocalhostAssumptions(files);
  for (const loc of localhostInCode) {
    issues.push({
      id: 'inflight-localhost-assumption',
      category: 'deployment',
      severity: 'low',
      action: 'warning_only',
      reason: `Hardcoded localhost URL found in ${loc.file} — will break in production deployment.`,
      fix: `Replace hardcoded localhost with process.env.BASE_URL in ${loc.file}`,
      file: loc.file,
    });
  }

  // ── Missing error handling in async functions ────────────────────────────
  if (!isMobile && isServer) {
    const asyncWithoutTryCatch = _checkMissingErrorHandling(files);
    if (asyncWithoutTryCatch.length > 0) {
      issues.push({
        id: 'inflight-missing-error-handling',
        category: 'backend_foundation',
        severity: 'low',
        action: 'warning_only',
        reason: `${asyncWithoutTryCatch.length} async route handler(s) may be missing try/catch blocks.`,
        fix: 'Wrap all async route handlers in try/catch and call next(err) on errors',
      });
    }
  }

  // ── Mobile: localStorage usage ────────────────────────────────────────────
  if (isMobile && allContent.includes('localStorage')) {
    issues.push({
      id: 'inflight-mobile-localstorage',
      category: 'stack_coherence',
      severity: 'high',
      action: 'warning_only',
      reason: 'Generated mobile code uses localStorage which is not available in React Native.',
      fix: 'Replace localStorage with AsyncStorage from @react-native-async-storage/async-storage',
    });
  }

  // ── Package.json missing declared deps ────────────────────────────────────
  const pkgRaw = files['package.json'];
  if (pkgRaw) {
    const missingDeps = _checkMissingPackages(files, pkgRaw);
    for (const dep of missingDeps) {
      issues.push({
        id: `inflight-missing-dep-${dep}`,
        category: 'dependencies',
        severity: 'medium',
        action: 'warning_only',
        reason: `Package "${dep}" is imported in generated code but not listed in package.json dependencies.`,
        fix: `Run: npm install ${dep}`,
      });
    }
  }

  return issues;
}

// ── Private helpers ─────────────────────────────────────────────────────────

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

function _checkHardcodedPort(files) {
  const SERVER_FILES = ['server.js', 'index.js', 'app.js', 'src/server.js', 'src/index.js'];

  for (const [path, content] of Object.entries(files)) {
    const isServerFile = SERVER_FILES.some(s => path.endsWith(s));
    if (!isServerFile || typeof content !== 'string') continue;

    // Detect hardcoded port: listen(3000) or PORT = 3000 without process.env
    const hasHardcoded = /\.listen\s*\(\s*(?!process\.env)[0-9]{3,5}/.test(content) ||
                         /const\s+PORT\s*=\s*[0-9]{3,5}(?!\s*\|\|)/.test(content);
    const hasDynamic   = /process\.env\.PORT/.test(content);

    if (hasHardcoded && !hasDynamic) {
      return {
        id: 'inflight-hardcoded-port',
        category: 'port_config',
        severity: 'high',
        action: 'warning_only',
        reason: `Server in ${path} uses a hardcoded port instead of process.env.PORT.`,
        fix: 'Change to: const PORT = process.env.PORT || 3000;',
        file: path,
      };
    }
  }

  return null;
}

function _checkLocalhostAssumptions(files) {
  const found = [];
  const LOCALHOST_RE = /['"`](https?:\/\/localhost:[0-9]+[^'"`]*?)['"`]/g;
  const SKIP = ['.env', '.md', 'README'];

  for (const [path, content] of Object.entries(files)) {
    if (SKIP.some(s => path.includes(s))) continue;
    if (typeof content !== 'string') continue;

    // Only flag if it's clearly a runtime callback/config URL, not just a dev comment
    const matches = [...content.matchAll(LOCALHOST_RE)];
    for (const match of matches) {
      // Skip if it's in a comment line
      const lineStart = content.lastIndexOf('\n', match.index);
      const line = content.slice(lineStart + 1, match.index + match[0].length);
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
      // Skip if it's clearly a test file
      if (path.includes('test') || path.includes('spec')) continue;

      found.push({ file: path, url: match[1] });
      break; // one per file is enough
    }
  }

  return found;
}

function _checkMissingErrorHandling(files) {
  const missing = [];

  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith('.js') && !path.endsWith('.ts')) continue;
    if (typeof content !== 'string') continue;

    // Detect async route handlers without try/catch
    const asyncRoutes = content.match(/app\.(get|post|put|delete|patch)\s*\([^,]+,\s*async\s/g) || [];
    const hasTryCatch = content.includes('try {') || content.includes('try{');

    if (asyncRoutes.length > 0 && !hasTryCatch) {
      missing.push(path);
    }
  }

  return missing;
}

function _checkMissingPackages(files, pkgRaw) {
  const missing = [];
  let pkg;
  try { pkg = JSON.parse(pkgRaw); } catch (_) { return missing; }

  const declared = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ]);

  // High-signal packages that often get forgotten
  const KNOWN = ['express', 'cors', 'dotenv', 'helmet', 'morgan', 'bcrypt', 'bcryptjs',
                 'jsonwebtoken', 'stripe', 'openai', 'mongoose', 'pg', 'mysql2',
                 'nodemailer', 'resend', 'uuid', 'axios', 'zod', 'joi', 'multer'];

  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith('.js') && !path.endsWith('.ts')) continue;
    if (typeof content !== 'string') continue;

    for (const pkg of KNOWN) {
      if (declared.has(pkg)) continue;
      if (
        content.includes(`require('${pkg}')`) ||
        content.includes(`require("${pkg}")`) ||
        content.includes(`from '${pkg}'`) ||
        content.includes(`from "${pkg}"`)
      ) {
        if (!missing.includes(pkg)) missing.push(pkg);
      }
    }
  }

  return missing;
}

module.exports = { runInFlightPreventionChecks };
