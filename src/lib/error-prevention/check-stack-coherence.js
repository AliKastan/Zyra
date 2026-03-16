'use strict';

/**
 * Stack Coherence Checks
 *
 * Validates that the planned stack is internally consistent:
 * - Node servers need dynamic port
 * - Next.js needs appropriate scripts
 * - Expo mobile needs navigation shell
 * - Framework-specific structural requirements
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').PreventionInput} input
 * @returns {import('./types').PreventionIssue[]}
 */
function checkStackCoherence(input) {
  const { intent = {}, stack = {}, blueprint = {}, product = {} } = input;

  const issues = [];
  const allText = _buildAllText(intent, product, blueprint);
  const stackType = _detectStackType(intent, stack, blueprint);

  // ── Next.js ───────────────────────────────────────────────────────────────
  if (stackType === 'nextjs') {
    const fileList = _getFileList(stack, blueprint);
    const hasNextConfig = fileList.some(f => f.includes('next.config'));
    const hasBuildScript = _hasScript(stack, blueprint, 'build');
    const hasStartScript = _hasScript(stack, blueprint, 'start');

    if (!hasBuildScript) {
      issues.push({
        id: 'nextjs-missing-build-script',
        category: 'scripts',
        severity: 'high',
        action: 'safe_default_injected',
        reason: 'Next.js requires a "build" script (next build) for production deployment.',
        fix: 'Add "build": "next build" to package.json scripts',
      });
    }

    if (!hasStartScript) {
      issues.push({
        id: 'nextjs-missing-start-script',
        category: 'scripts',
        severity: 'medium',
        action: 'safe_default_injected',
        reason: 'Next.js requires a "start" script (next start) to serve the built app.',
        fix: 'Add "start": "next start" to package.json scripts',
      });
    }

    if (!hasNextConfig && !fileList.some(f => f.includes('pages/') || f.includes('app/'))) {
      issues.push({
        id: 'nextjs-missing-page-structure',
        category: 'stack_coherence',
        severity: 'high',
        action: 'warning_only',
        reason: 'Next.js project has no pages/ or app/ directory structure planned.',
        fix: 'Ensure blueprint.fileList includes pages/index.js or app/page.js',
      });
    }
  }

  // ── Node custom server ─────────────────────────────────────────────────────
  if (stackType === 'node') {
    const hasStartScript = _hasScript(stack, blueprint, 'start');
    const hasServerFile  = _getFileList(stack, blueprint).some(f =>
      f.endsWith('server.js') || f.endsWith('server.ts') ||
      f.endsWith('index.js')  || f.endsWith('src/index.js'),
    );

    if (!hasStartScript) {
      issues.push({
        id: 'node-missing-start-script',
        category: 'scripts',
        severity: 'high',
        action: 'safe_default_injected',
        reason: 'Node.js server apps require a start script to launch in production.',
        fix: 'Add "start": "node server.js" to package.json scripts',
      });
    }

    if (!hasServerFile) {
      issues.push({
        id: 'node-missing-server-entrypoint',
        category: 'backend_foundation',
        severity: 'high',
        action: 'generation_hint_added',
        reason: 'Node.js server has no server.js or index.js entrypoint planned.',
        fix: 'Ensure server.js or src/index.js is in the planned file list',
      });
    }
  }

  // ── Expo mobile ───────────────────────────────────────────────────────────
  if (stackType === 'mobile') {
    const fileList = _getFileList(stack, blueprint);
    const hasAppJson = fileList.some(f => f.endsWith('app.json') || f.endsWith('app.config.js'));

    if (!hasAppJson) {
      issues.push({
        id: 'expo-missing-app-config',
        category: 'stack_coherence',
        severity: 'high',
        action: 'safe_default_injected',
        reason: 'Expo apps require app.json for build and deployment configuration.',
        fix: 'Add app.json with name, slug, version, and sdkVersion to planned files',
      });
    }
  }

  // ── React SPA ─────────────────────────────────────────────────────────────
  if (stackType === 'react') {
    const fileList = _getFileList(stack, blueprint);
    const hasIndexHtml = fileList.some(f => f.endsWith('index.html'));
    const hasBuildScript = _hasScript(stack, blueprint, 'build');

    if (!hasBuildScript) {
      issues.push({
        id: 'react-missing-build-script',
        category: 'scripts',
        severity: 'medium',
        action: 'safe_default_injected',
        reason: 'React apps require a build script for production deployment.',
        fix: 'Add "build": "vite build" (or react-scripts build) to package.json scripts',
      });
    }
  }

  // ── Generic: missing dev script ────────────────────────────────────────────
  const hasDevScript = _hasScript(stack, blueprint, 'dev');
  if (!hasDevScript && stackType !== 'static') {
    issues.push({
      id: 'missing-dev-script',
      category: 'scripts',
      severity: 'low',
      action: 'safe_default_injected',
      reason: 'A dev script makes local development faster and is expected by most developers.',
      fix: 'Add "dev" script to package.json (e.g. nodemon, next dev, vite)',
    });
  }

  return issues;
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _detectStackType(intent, stack, blueprint) {
  const runtime = (stack.tech?.runtime || stack.runtime || '').toLowerCase();
  const framework = (stack.tech?.framework || '').toLowerCase();
  const appType = (intent.appType || '').toLowerCase();

  if (framework.includes('next') || runtime.includes('next')) return 'nextjs';
  if (appType === 'mobile' || framework.includes('expo') || framework.includes('react-native')) return 'mobile';
  if (framework.includes('react') || framework.includes('vite')) return 'react';
  if (framework.includes('vue') || framework.includes('svelte')) return 'react'; // treat similarly
  if (runtime === 'node' || stack.backend || stack.tech?.backend) return 'node';

  // Detect from planned files
  const files = _getFileList(stack, blueprint);
  if (files.some(f => f.includes('next.config'))) return 'nextjs';
  if (files.some(f => f.includes('app.json') || f.includes('App.js'))) return 'mobile';
  if (files.some(f => f.endsWith('server.js') || f.endsWith('src/index.js'))) return 'node';
  if (files.some(f => f.endsWith('.html'))) return 'static';

  return 'node'; // default assumption
}

function _getFileList(stack, blueprint) {
  const stackFiles = stack?.files || [];
  const bpFiles = blueprint?.fileList || [];
  return [...new Set([...stackFiles, ...bpFiles])];
}

function _hasScript(stack, blueprint, scriptName) {
  // Check blueprint notes and designNotes for script mentions
  const notes = [
    blueprint?.designNotes || '',
    blueprint?.generationHints?.join(' ') || '',
  ].join(' ').toLowerCase();

  if (scriptName === 'build') {
    return notes.includes('next build') || notes.includes('vite build') || notes.includes('"build"') || notes.includes('build:');
  }
  if (scriptName === 'start') {
    return notes.includes('"start"') || notes.includes('next start') || notes.includes('node server') || notes.includes('node index');
  }
  if (scriptName === 'dev') {
    return notes.includes('"dev"') || notes.includes('nodemon') || notes.includes('next dev') || notes.includes('vite dev');
  }
  return false;
}

function _buildAllText(intent, product, blueprint) {
  return [
    intent.appType || '',
    (intent.features || []).map(f => f.name + ' ' + (f.description || '')).join(' '),
    product.appName || '',
    product.summary || '',
    (product.pages || []).map(p => p.name || p).join(' '),
    blueprint.designNotes || '',
    blueprint.projectName || '',
  ].join(' ').toLowerCase();
}

module.exports = { checkStackCoherence };
