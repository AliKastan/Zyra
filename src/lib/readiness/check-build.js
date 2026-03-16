'use strict';

/**
 * Build System Check
 *
 * Verifies:
 * - project has a working build configuration
 * - dependencies match detected imports
 * - framework-specific build tools are present
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').ReadinessInput} input
 * @returns {import('./types').BuildCheckResult}
 */
function checkBuild(input) {
  const { files = {}, stack = {} } = input;
  const filePaths = Object.keys(files);

  /** @type {import('./types').ReadinessIssue[]} */
  const issues = [];

  const pkgRaw = files['package.json'] || files['./package.json'];
  const pkg    = pkgRaw ? _tryParse(pkgRaw) : null;
  const deps   = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const scripts = pkg?.scripts || {};

  // ── Build tool detection ──────────────────────────────────────────────────
  const { hasBuildTool, buildTool } = _detectBuildTool(filePaths, deps, scripts);

  if (!hasBuildTool) {
    const isStatic = _isStaticProject(filePaths);
    if (!isStatic) {
      issues.push({
        severity: 'info',
        category: 'build',
        message:  'No build tool detected (Vite, Next.js, Webpack, etc.)',
        fix:      'Add a build tool appropriate for your stack (e.g. "npm install vite" for React)',
      });
    }
  }

  // ── Framework-specific build script checks ────────────────────────────────
  if (deps['next'] && !scripts.build?.includes('next build')) {
    issues.push({
      severity: 'warning',
      category: 'build',
      message:  'Next.js detected but build script does not call "next build"',
      fix:      'Set "build": "next build" in package.json scripts',
      file:     'package.json',
    });
  }

  if ((deps['vite'] || deps['@vitejs/plugin-react']) && !scripts.build?.includes('vite build')) {
    issues.push({
      severity: 'warning',
      category: 'build',
      message:  'Vite detected but build script does not call "vite build"',
      fix:      'Set "build": "vite build" in package.json scripts',
      file:     'package.json',
    });
  }

  // ── Missing dependencies ──────────────────────────────────────────────────
  const missingDependencies = _detectMissingDependencies(files, deps);
  const dependenciesDeclared = missingDependencies.length === 0;

  for (const dep of missingDependencies) {
    issues.push({
      severity: 'warning',
      category: 'build',
      message:  `Imported package "${dep}" is not listed in package.json dependencies`,
      fix:      `Run: npm install ${dep}`,
    });
  }

  // ── package.json existence ────────────────────────────────────────────────
  if (!pkg && _isNodeProject(filePaths) && !_isStaticProject(filePaths)) {
    issues.push({
      severity: 'critical',
      category: 'build',
      message:  'No package.json found in a Node.js project',
      fix:      'Run: npm init -y to create package.json',
    });
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 35;
    else if (issue.severity === 'warning') score -= 10;
    else if (issue.severity === 'info') score -= 3;
  }
  score = Math.max(0, score);

  return {
    hasBuildTool,
    buildTool: buildTool || undefined,
    dependenciesDeclared,
    missingDependencies,
    issues,
    score,
  };
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _detectBuildTool(filePaths, deps, scripts) {
  if (deps['next'])    return { hasBuildTool: true, buildTool: 'next' };
  if (deps['vite'])    return { hasBuildTool: true, buildTool: 'vite' };
  if (deps['webpack']) return { hasBuildTool: true, buildTool: 'webpack' };
  if (deps['esbuild']) return { hasBuildTool: true, buildTool: 'esbuild' };
  if (deps['parcel'])  return { hasBuildTool: true, buildTool: 'parcel' };
  if (deps['rollup'])  return { hasBuildTool: true, buildTool: 'rollup' };
  if (deps['tsc'] || deps['typescript']) return { hasBuildTool: true, buildTool: 'tsc' };

  if (filePaths.some(p => p.endsWith('vite.config.js') || p.endsWith('vite.config.ts'))) return { hasBuildTool: true, buildTool: 'vite' };
  if (filePaths.some(p => p.endsWith('next.config.js') || p.endsWith('next.config.mjs'))) return { hasBuildTool: true, buildTool: 'next' };
  if (filePaths.some(p => p.endsWith('webpack.config.js'))) return { hasBuildTool: true, buildTool: 'webpack' };
  if (filePaths.some(p => p.endsWith('tsconfig.json'))) return { hasBuildTool: true, buildTool: 'tsc' };

  // Node apps with no transpiler — just node, that's fine
  if (scripts.start?.includes('node ') || scripts.start?.includes('nodemon ')) {
    return { hasBuildTool: true, buildTool: 'node' };
  }

  return { hasBuildTool: false, buildTool: null };
}

function _isStaticProject(filePaths) {
  const hasHtml = filePaths.some(p => p.endsWith('.html'));
  const hasServerJs = filePaths.some(p =>
    p.endsWith('server.js') || p.endsWith('src/index.js') || p.endsWith('src/server.js'),
  );
  return hasHtml && !hasServerJs;
}

function _isNodeProject(filePaths) {
  return filePaths.some(p =>
    p.endsWith('.js') || p.endsWith('.ts') || p.endsWith('server.js'),
  );
}

/**
 * Detect packages that are imported in JS/TS files but not listed in package.json.
 * Only flags well-known packages, not relative imports.
 */
function _detectMissingDependencies(files, declaredDeps) {
  const missing = new Set();
  const allDeclared = new Set(Object.keys(declaredDeps));

  // Common packages to watch for (not exhaustive — avoids false positives)
  const KNOWN_PACKAGES = [
    'express', 'fastify', 'koa', 'hapi',
    'cors', 'body-parser', 'helmet', 'morgan',
    'dotenv', 'axios', 'node-fetch', 'got',
    'mongoose', 'pg', 'mysql2', 'better-sqlite3',
    'jsonwebtoken', 'bcrypt', 'bcryptjs',
    'stripe', 'openai', '@anthropic-ai/sdk', 'supabase',
    'nodemailer', 'resend',
    'uuid', 'lodash', 'date-fns', 'dayjs',
    'zod', 'joi', 'yup',
    'socket.io', 'ws',
    'multer', 'sharp', 'jimp',
    'redis', 'ioredis',
  ];

  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith('.js') && !path.endsWith('.ts') && !path.endsWith('.mjs')) continue;
    if (typeof content !== 'string') continue;

    for (const pkg of KNOWN_PACKAGES) {
      if (allDeclared.has(pkg)) continue; // Already declared
      if (
        content.includes(`require('${pkg}')`) ||
        content.includes(`require("${pkg}")`) ||
        content.includes(`from '${pkg}'`) ||
        content.includes(`from "${pkg}"`)
      ) {
        missing.add(pkg);
      }
    }
  }

  return [...missing];
}

function _tryParse(raw) {
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

module.exports = { checkBuild };
