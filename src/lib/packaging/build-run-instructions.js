'use strict';

/**
 * Build Run / Build / Deploy Instructions
 *
 * Generates platform-aware instructions for running the project locally,
 * building for production, and deploying. Derived from actual generated
 * files — not generic boilerplate.
 */

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * @param {import('./types').PackagingInput} input
 * @param {import('./types').ProjectManifest} manifest
 * @returns {import('./types').FinalRunInstructions}
 */
function buildRunInstructions(input, manifest) {
  const { files = [], intent = {} } = input;

  const platform = _detectPlatform(files, intent);
  const pkg      = _parsePackageJson(files);

  const installCommand = 'npm install';
  const devCommand     = _resolveDevCommand(platform, pkg, files);
  const buildCommand   = _resolveBuildCommand(platform, pkg);
  const startCommand   = _resolveStartCommand(platform, pkg, files);
  const mobileCommand  = platform === 'mobile' || platform === 'mixed' ? 'npx expo start' : undefined;
  const envSetupSteps  = _buildEnvSetupSteps(files, manifest);
  const deployNotes    = _buildDeployNotes(platform, files, manifest);

  return {
    platform,
    installCommand,
    devCommand,
    buildCommand,
    startCommand,
    mobileCommand,
    envSetupSteps,
    deployNotes,
  };
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Detect the runtime platform from generated files.
 * @returns {'static'|'node'|'react'|'nextjs'|'mobile'|'mixed'}
 */
function _detectPlatform(files, intent) {
  const paths    = files.map(f => f.path);
  const allPaths = paths.join('\n').toLowerCase();

  // Next.js
  if (paths.some(p => p === 'next.config.js' || p === 'next.config.mjs')) return 'nextjs';
  if (paths.some(p => p.startsWith('pages/') || p.startsWith('app/'))) return 'nextjs';

  // React / Vite CRA
  if (paths.some(p => p.endsWith('vite.config.js') || p.endsWith('vite.config.ts'))) return 'react';
  if (paths.some(p => p === 'src/index.jsx' || p === 'src/index.tsx' || p === 'src/App.jsx')) return 'react';

  // Expo / React Native
  const hasMobile = paths.some(p => p === 'app.json')
    && files.find(f => f.path === 'app.json') !== undefined;
  const mobileConfirm = hasMobile && (() => {
    try {
      const data = JSON.parse(files.find(f => f.path === 'app.json').content || '{}');
      return data.expo !== undefined;
    } catch (_) { return false; }
  })();

  if (mobileConfirm) {
    const hasWebEntry = paths.some(p => p === 'index.html');
    return hasWebEntry ? 'mixed' : 'mobile';
  }

  // Node.js server
  const hasServer  = paths.some(p => /server\.(js|ts|mjs)$/.test(p));
  const hasExpress = files.some(f => {
    const c = f.content || '';
    return c.includes("require('express')") || c.includes('from \'express\'');
  });
  const hasPkgJson = paths.some(p => p === 'package.json');

  if (hasServer || hasExpress || (hasPkgJson && !_isPureStaticWithPkg(files))) return 'node';

  return 'static';
}

/**
 * Some static sites have a package.json just for tooling — detect these.
 */
function _isPureStaticWithPkg(files) {
  const pkg = _parsePackageJson(files);
  if (!pkg) return true;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const keys = Object.keys(deps);
  // If the only deps are static tooling (serve, live-server, etc.), treat as static
  const staticOnly = keys.every(k => /^(serve|live-server|browser-sync|http-server)$/.test(k));
  return staticOnly || keys.length === 0;
}

function _resolveDevCommand(platform, pkg, files) {
  const scripts = pkg?.scripts || {};

  if (scripts.dev)                              return 'npm run dev';
  if (scripts.start && platform === 'node')     return 'npm start';
  if (platform === 'nextjs')                    return 'npm run dev';
  if (platform === 'react')                     return 'npm run dev';
  if (platform === 'mobile')                    return 'npx expo start';
  if (platform === 'mixed')                     return 'npm run dev   # web\n  npx expo start  # mobile';
  if (platform === 'static') {
    const hasIndex = files.some(f => f.path === 'index.html');
    return hasIndex ? 'npx serve .' : 'npm run dev';
  }
  return 'npm run dev';
}

function _resolveBuildCommand(platform, pkg) {
  const scripts = pkg?.scripts || {};
  if (scripts.build) return 'npm run build';
  if (platform === 'nextjs') return 'npm run build';
  if (platform === 'react')  return 'npm run build';
  return undefined; // no build step for node / static
}

function _resolveStartCommand(platform, pkg, files) {
  const scripts = pkg?.scripts || {};
  if (scripts.start) return 'npm start';
  if (platform === 'node') {
    const serverFile = files.find(f => /server\.(js|ts)$/.test(f.path));
    if (serverFile) return `node ${serverFile.path}`;
    return 'node index.js';
  }
  if (platform === 'nextjs') return 'npm start';
  return undefined;
}

/**
 * Build ordered env setup steps the user must do before running the app.
 */
function _buildEnvSetupSteps(files, manifest) {
  const steps = [];
  const required = (manifest.requiredEnvVars || []).filter(v => v.required && !v.hasDefault);

  if (files.some(f => f.path === '.env.example')) {
    steps.push('cp .env.example .env   # create your local env file');
  }

  if (required.length > 0) {
    steps.push(`Open .env and fill in the following required values:`);
    for (const v of required.slice(0, 8)) {
      const note = v.setupNote ? `  # ${v.setupNote}` : '';
      steps.push(`  ${v.name}=${note}`);
    }
    if (required.length > 8) {
      steps.push(`  (+ ${required.length - 8} more — see .env.example for full list)`);
    }
  }

  return steps;
}

/**
 * Generate deploy notes appropriate for the detected platform.
 */
function _buildDeployNotes(platform, files, manifest) {
  const notes = [];
  const name  = manifest.projectName || 'your-app';

  if (platform === 'static') {
    notes.push('Deploy static files to Netlify, Vercel, or GitHub Pages.');
    notes.push('Drag and drop the project folder to app.netlify.com/drop for instant deploy.');
    notes.push('No server required — all files are static HTML/CSS/JS.');
  } else if (platform === 'node') {
    notes.push('Deploy to Railway: railway up  (after railway login)');
    notes.push('Deploy to Render: connect your repo at render.com → New → Web Service.');
    notes.push('Deploy to Heroku: heroku create && git push heroku main');
    notes.push('Set all .env variables in the platform environment settings.');
    if (files.some(f => f.path === 'Dockerfile')) {
      notes.push('Docker ready — you can also deploy to any container platform (Fly.io, GCP Cloud Run, AWS ECS).');
    }
  } else if (platform === 'nextjs') {
    notes.push('Deploy to Vercel: vercel deploy  (zero-config for Next.js)');
    notes.push('Add env vars in Vercel Dashboard → Settings → Environment Variables.');
    notes.push('Production build: npm run build && npm start');
  } else if (platform === 'react') {
    notes.push('npm run build  then deploy the dist/ folder to Netlify or Vercel.');
    notes.push('Netlify: netlify deploy --prod --dir=dist');
    notes.push('For API calls: configure proxy or deploy backend separately and update VITE_API_URL.');
  } else if (platform === 'mobile') {
    notes.push('Build for iOS: npx expo build:ios  (requires Apple Developer account)');
    notes.push('Build for Android: npx expo build:android  (requires Google Play account)');
    notes.push('Use EAS Build for managed workflow: npx eas build --platform all');
  } else if (platform === 'mixed') {
    notes.push('Web: deploy the Node/web part to Railway or Render.');
    notes.push('Mobile: use EAS Build (npx eas build --platform all) for iOS + Android.');
    notes.push('Ensure the mobile app EXPO_PUBLIC_API_URL points to your deployed web server.');
  }

  return notes;
}

function _parsePackageJson(files) {
  const f = files.find(p => p.path === 'package.json' || p.path.endsWith('/package.json'));
  if (!f) return null;
  try { return JSON.parse(f.content || '{}'); } catch (_) { return null; }
}

module.exports = { buildRunInstructions };
