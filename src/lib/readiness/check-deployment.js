'use strict';

/**
 * Deployment Target Compatibility Check
 *
 * Detects the project type and evaluates compatibility with:
 * Railway, Vercel, Render, Docker, Node server, Expo, Static hosting.
 *
 * Also verifies port configuration (process.env.PORT vs hardcoded).
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').ReadinessInput} input
 * @returns {import('./types').DeploymentCheckResult}
 */
function checkDeployment(input) {
  const { files = {}, stack = {}, intent = {} } = input;
  const filePaths   = Object.keys(files);
  const allContent  = Object.values(files).join('\n');

  /** @type {import('./types').ReadinessIssue[]} */
  const issues = [];

  // ── Project type detection ────────────────────────────────────────────────
  const projectType = _detectProjectType(filePaths, files);

  // ── Port configuration ────────────────────────────────────────────────────
  const portConfigured = _checkPortConfig(allContent, projectType);

  if (!portConfigured && (projectType === 'node' || projectType === 'nextjs')) {
    issues.push({
      severity: 'critical',
      category: 'deployment',
      message:  'Server uses a hardcoded port instead of process.env.PORT',
      fix:      'Replace hardcoded port with: const PORT = process.env.PORT || 3000',
    });
  }

  // ── Per-platform compatibility ────────────────────────────────────────────
  const targets = [
    _checkRailway(projectType, filePaths, files, portConfigured),
    _checkVercel(projectType, filePaths, files),
    _checkRender(projectType, filePaths, files, portConfigured),
    _checkDocker(projectType, filePaths, files),
    _checkExpo(projectType, filePaths, files),
    _checkStatic(projectType, filePaths, files),
  ].filter(Boolean);

  // Surface blocking issues from targets
  for (const target of targets) {
    if (!target.compatible && target.issues.length > 0) {
      // The recommended platform being incompatible is a critical issue
      const isRecommended = target.name === _pickRecommended(projectType, targets) || projectType === 'mobile';
      issues.push({
        severity: isRecommended ? 'critical' : 'warning',
        category: 'deployment',
        message:  `${target.name}: ${target.issues[0]}`,
        fix:      target.suggestions[0] || undefined,
      });
    }
  }

  // ── Recommended target ────────────────────────────────────────────────────
  const recommendedTarget = _pickRecommended(projectType, targets);

  // ── Score ─────────────────────────────────────────────────────────────────
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 35;
    else if (issue.severity === 'warning') score -= 8;
  }
  score = Math.max(0, score);

  return { targets, recommendedTarget, portConfigured, issues, score };
}

/**
 * Detect the project type from file structure.
 * @returns {'static'|'node'|'nextjs'|'react'|'mobile'|'mixed'}
 */
function detectProjectType(files) {
  return _detectProjectType(Object.keys(files || {}), files || {});
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _detectProjectType(filePaths, files) {
  const pkgRaw = files['package.json'] || files['./package.json'];
  const pkg    = pkgRaw ? _tryParse(pkgRaw) : {};
  const deps   = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

  if (deps['next'] || filePaths.some(p => p.endsWith('next.config.js') || p.endsWith('next.config.mjs'))) return 'nextjs';
  if (deps['expo'] || filePaths.some(p => p.endsWith('app.json') || p.endsWith('expo.config.js'))) return 'mobile';
  if (deps['react'] && (deps['vite'] || deps['react-scripts'])) return 'react';

  const hasServerFramework = deps['express'] || deps['fastify'] || deps['koa'] || deps['hapi'];
  const hasServerFile = filePaths.some(p =>
    p.endsWith('server.js') || p.endsWith('server.ts') ||
    p.endsWith('src/index.js') || p.endsWith('src/server.js'),
  );
  const hasHtml   = filePaths.some(p => p.endsWith('.html'));

  // Server projects require a server framework OR an explicit server file
  if (hasServerFramework || hasServerFile) return 'node';
  // If there's HTML and no server framework → static (generic JS files like app.js are fine)
  if (hasHtml) return 'static';

  return 'node';
}

function _checkPortConfig(allContent, projectType) {
  if (projectType === 'static' || projectType === 'mobile') return true; // not applicable

  // Look for process.env.PORT usage
  return /process\.env\.PORT/.test(allContent);
}

function _checkRailway(projectType, filePaths, files, portConfigured) {
  /** @type {import('./types').DeploymentTarget} */
  const target = {
    name: 'railway',
    compatible: true,
    issues: [],
    suggestions: [],
    deployCommand: 'railway up',
  };

  if (projectType === 'mobile') {
    target.compatible = false;
    target.issues.push('Mobile (Expo) apps cannot deploy to Railway');
    target.suggestions.push('Use Expo Go or EAS Build for mobile deployment');
    return target;
  }

  if (!portConfigured && (projectType === 'node' || projectType === 'nextjs')) {
    target.compatible = false;
    target.issues.push('Railway requires process.env.PORT');
    target.suggestions.push('Replace hardcoded port with process.env.PORT || 3000');
  }

  // Check for railway.json or Procfile (nice-to-have)
  if (!filePaths.some(p => p === 'railway.json' || p === 'Procfile')) {
    target.suggestions.push('Add a Procfile or railway.json for explicit process configuration');
  }

  return target;
}

function _checkVercel(projectType, filePaths, files) {
  /** @type {import('./types').DeploymentTarget} */
  const target = {
    name: 'vercel',
    compatible: true,
    issues: [],
    suggestions: [],
    deployCommand: 'vercel deploy',
  };

  if (projectType === 'mobile') {
    target.compatible = false;
    target.issues.push('Mobile apps cannot deploy to Vercel');
    return target;
  }

  if (projectType === 'node') {
    // Pure Node servers need vercel.json or a serverless adapter
    const hasVercelConfig = filePaths.some(p => p === 'vercel.json');
    if (!hasVercelConfig) {
      target.compatible = false;
      target.issues.push('Pure Node.js servers require vercel.json to configure routing');
      target.suggestions.push('Add vercel.json with routes configuration, or consider Railway/Render for Node servers');
    }
  }

  if (projectType === 'nextjs') {
    target.compatible = true;
    target.suggestions.push('Next.js deploys to Vercel with zero configuration');
  }

  if (projectType === 'static' || projectType === 'react') {
    target.compatible = true;
    target.suggestions.push('Static sites and React SPAs deploy to Vercel automatically');
  }

  return target;
}

function _checkRender(projectType, filePaths, files, portConfigured) {
  /** @type {import('./types').DeploymentTarget} */
  const target = {
    name: 'render',
    compatible: true,
    issues: [],
    suggestions: [],
    deployCommand: 'git push (auto-deploy)',
  };

  if (projectType === 'mobile') {
    target.compatible = false;
    target.issues.push('Mobile apps cannot deploy to Render');
    return target;
  }

  if (!portConfigured && projectType === 'node') {
    target.compatible = false;
    target.issues.push('Render requires process.env.PORT');
    target.suggestions.push('Replace hardcoded port with process.env.PORT || 3000');
  }

  if (!filePaths.some(p => p === 'render.yaml')) {
    target.suggestions.push('Add render.yaml for explicit Render service configuration');
  }

  return target;
}

function _checkDocker(projectType, filePaths, files) {
  /** @type {import('./types').DeploymentTarget} */
  const target = {
    name: 'docker',
    compatible: true,
    issues: [],
    suggestions: [],
    configFile: 'Dockerfile',
    deployCommand: 'docker build && docker run',
  };

  if (projectType === 'mobile') {
    target.compatible = false;
    target.issues.push('Mobile apps cannot run in Docker containers');
    return target;
  }

  const hasDockerfile = filePaths.some(p => p === 'Dockerfile' || p === './Dockerfile');
  if (!hasDockerfile) {
    target.compatible = false;
    target.issues.push('No Dockerfile found');
    target.suggestions.push('Add a Dockerfile to enable Docker / container-based deployment');
  }

  const hasDockerIgnore = filePaths.some(p => p === '.dockerignore');
  if (!hasDockerIgnore) {
    target.suggestions.push('Add .dockerignore to exclude node_modules and .env from image');
  }

  return target;
}

function _checkExpo(projectType, filePaths, files) {
  if (projectType !== 'mobile') return null;

  /** @type {import('./types').DeploymentTarget} */
  const target = {
    name: 'expo',
    compatible: true,
    issues: [],
    suggestions: [],
    deployCommand: 'eas build --platform all',
  };

  const hasAppJson = filePaths.some(p => p === 'app.json' || p.endsWith('/app.json'));
  if (!hasAppJson) {
    target.compatible = false;
    target.issues.push('Missing app.json required by Expo');
    target.suggestions.push('Add app.json with name, slug, and version fields');
  }

  const pkgRaw = files['package.json'];
  const pkg    = pkgRaw ? _tryParse(pkgRaw) : {};
  if (!pkg?.dependencies?.expo) {
    target.compatible = false;
    target.issues.push('expo dependency not found in package.json');
    target.suggestions.push('Run: npm install expo');
  }

  return target;
}

function _checkStatic(projectType, filePaths, files) {
  if (projectType !== 'static') return null;

  /** @type {import('./types').DeploymentTarget} */
  const target = {
    name: 'static',
    compatible: true,
    issues: [],
    suggestions: ['Deploy to Vercel, Netlify, GitHub Pages, or any static host'],
    deployCommand: 'vercel deploy / netlify deploy',
  };

  const hasIndexHtml = filePaths.some(p => p === 'index.html' || p.endsWith('/index.html'));
  if (!hasIndexHtml) {
    target.compatible = false;
    target.issues.push('No index.html found for static hosting');
    target.suggestions.push('Ensure index.html exists at the project root');
  }

  return target;
}

function _pickRecommended(projectType, targets) {
  const preferences = {
    nextjs:  'vercel',
    react:   'vercel',
    static:  'static',
    node:    'railway',
    mixed:   'railway',
    mobile:  'expo',
  };

  const preferred = preferences[projectType] || 'railway';
  const match = targets.find(t => t.name === preferred && t.compatible);
  if (match) return match.name;

  // Fall back to first compatible target
  const first = targets.find(t => t.compatible);
  return first ? first.name : preferred;
}

function _tryParse(raw) {
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

module.exports = { checkDeployment, detectProjectType };
