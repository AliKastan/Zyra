const fs = require('fs-extra');
const path = require('path');

/**
 * Detects the project type from its directory.
 * Returns { type, needsInstall, startScript }
 * type: 'static' | 'nextjs' | 'react-cra' | 'vite' | 'node'
 */
async function detectProjectType(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');

  if (await fs.pathExists(pkgPath)) {
    let pkg = {};
    try { pkg = await fs.readJson(pkgPath); } catch (_) {}

    const deps = Object.keys({
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    });

    if (deps.includes('next')) {
      return { type: 'nextjs', needsInstall: true, startScript: 'next dev' };
    }
    if (deps.includes('react-scripts') || (pkg.scripts && pkg.scripts.start && pkg.scripts.start.includes('react-scripts'))) {
      return { type: 'react-cra', needsInstall: true, startScript: 'react-scripts start' };
    }
    if (deps.includes('vite') || (pkg.scripts && pkg.scripts.dev && pkg.scripts.dev.includes('vite'))) {
      return { type: 'vite', needsInstall: true, startScript: 'vite' };
    }
    // Generic Node.js (express, fastify, etc.)
    return { type: 'node', needsInstall: true, startScript: pkg.scripts?.start || null };
  }

  // No package.json → static HTML/CSS/JS
  return { type: 'static', needsInstall: false, startScript: null };
}

module.exports = { detectProjectType };
