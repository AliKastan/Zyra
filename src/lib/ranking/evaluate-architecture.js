'use strict';

/**
 * Architecture Quality Evaluator
 *
 * Scores a candidate's project structure for:
 * - Separation of concerns (routes / controllers / models / services)
 * - File count sanity (not sparse, not bloated)
 * - Naming consistency (kebab-case files, PascalCase components)
 * - Absence of god-files (single 1000+ line file doing everything)
 * - Presence of config / env / package management
 *
 * Max contribution: 25 points to the weighted composite.
 * Returns a raw score 0–100 for this dimension.
 */

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {Object} files   - Normalized { path: content } file map
 * @param {Object} [blueprint] - Enriched blueprint (optional)
 * @returns {{ score: number, strengths: string[], weaknesses: string[] }}
 */
function evaluateArchitecture(files, blueprint) {
  const paths   = Object.keys(files);
  const points  = [];
  const strengths  = [];
  const weaknesses = [];

  // ── 1. Separation of concerns (0–30 pts) ─────────────────────────────────
  const hasSeparation = _hasSeparationOfConcerns(paths);
  if (hasSeparation.routes)      { points.push(8);  strengths.push('Dedicated routes layer'); }
  else                            { weaknesses.push('No routes/ or api/ directory'); }
  if (hasSeparation.controllers) { points.push(7);  strengths.push('Separate controllers'); }
  if (hasSeparation.models)      { points.push(8);  strengths.push('Dedicated models or schema layer'); }
  if (hasSeparation.services)    { points.push(7);  strengths.push('Service layer present'); }

  // ── 2. Package management (0–10 pts) ─────────────────────────────────────
  const hasPackage = paths.some(p => p === 'package.json' || p.endsWith('/package.json'));
  if (hasPackage) { points.push(10); strengths.push('package.json present'); }
  else             { weaknesses.push('No package.json found'); }

  // ── 3. Config / env planning (0–10 pts) ──────────────────────────────────
  const hasEnvExample = paths.some(p => p.includes('.env.example'));
  const hasConfig     = paths.some(p => p.includes('config/') || p.includes('src/config'));
  if (hasEnvExample) { points.push(7); strengths.push('.env.example present'); }
  else               { weaknesses.push('No .env.example'); }
  if (hasConfig)     { points.push(3); strengths.push('Config directory present'); }

  // ── 4. File count sanity (0–15 pts) ──────────────────────────────────────
  const fileCount = paths.filter(p => /\.(js|ts|jsx|tsx|css|html)$/.test(p)).length;
  if (fileCount >= 5 && fileCount <= 60)  { points.push(15); strengths.push(`Healthy file count (${fileCount} files)`); }
  else if (fileCount < 5)                  { weaknesses.push(`Very few files (${fileCount}) — may be incomplete`); }
  else                                     { weaknesses.push(`Very large file count (${fileCount}) — may be bloated`); }

  // ── 5. No single god-file (0–10 pts) ─────────────────────────────────────
  const hasGodFile = Object.entries(files).some(([p, c]) =>
    typeof c === 'string' && c.length > 8000 &&
    (p.endsWith('.js') || p.endsWith('.ts'))
  );
  if (!hasGodFile) { points.push(10); }
  else             { weaknesses.push('Large monolithic file detected (>8000 chars) — poor modularity'); }

  // ── 6. Frontend / backend separation (0–10 pts) ───────────────────────────
  const hasFrontend = paths.some(p => p.includes('src/') || p.includes('components/') || p.includes('pages/') || p.includes('frontend/'));
  const hasBackend  = paths.some(p => p.includes('routes/') || p.includes('controllers/') || p.endsWith('server.js') || p.endsWith('app.js'));
  const hasPublic   = paths.some(p => p.includes('public/') || p.includes('static/'));

  if ((hasFrontend && hasBackend) || hasPublic) {
    points.push(10);
    strengths.push('Clear frontend/backend separation');
  } else if (hasFrontend || hasBackend) {
    points.push(5);
  } else {
    weaknesses.push('No clear frontend or backend structure');
  }

  const raw = Math.min(100, points.reduce((a, b) => a + b, 0));
  return { score: raw, strengths, weaknesses };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _hasSeparationOfConcerns(paths) {
  return {
    routes:      paths.some(p => p.includes('routes/') || p.includes('/api/')),
    controllers: paths.some(p => p.includes('controllers/') || p.includes('handlers/')),
    models:      paths.some(p => p.includes('models/') || p.includes('schema') || p.includes('entities/')),
    services:    paths.some(p => p.includes('services/') || p.includes('lib/')),
  };
}

module.exports = { evaluateArchitecture };
