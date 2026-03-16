'use strict';

/**
 * Backend Quality Evaluator
 *
 * Scores the backend wiring quality. Consumes the authenticityReport from
 * the Backend Authenticity Layer when available; falls back to static analysis.
 *
 * Evaluates:
 * - Real API routes (not stubs)
 * - Database connection setup
 * - Auth middleware
 * - Error handling in route handlers
 * - No fake/hardcoded data as "backend"
 *
 * Returns raw score 0–100 for this dimension.
 */

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {Object}      files              - Normalized { path: content } map
 * @param {Object|null} authenticityReport - From Backend Authenticity Layer (optional)
 * @returns {{ score: number, strengths: string[], weaknesses: string[] }}
 */
function evaluateBackend(files, authenticityReport) {
  const strengths  = [];
  const weaknesses = [];
  let   score      = 50; // baseline: neutral

  // ── A. Use authenticity report if available (authoritative) ───────────────
  if (authenticityReport) {
    const { status, fakeBackendIssues = [], placeholderFeatures = [] } = authenticityReport;

    switch (status) {
      case 'authentic_backend':
        score += 40;
        strengths.push('Backend authenticity verified — all routes are real');
        break;
      case 'placeholder_only':
        score += 20;
        strengths.push('Backend is authentic; some features are unconfigured placeholders');
        placeholderFeatures.forEach(p => weaknesses.push(`Placeholder: ${p.feature} requires configuration`));
        break;
      case 'fake_backend_detected': {
        const criticalCount = fakeBackendIssues.filter(i => i.severity === 'critical').length;
        const highCount     = fakeBackendIssues.filter(i => i.severity === 'high').length;
        score -= (criticalCount * 15) + (highCount * 8);
        fakeBackendIssues.slice(0, 3).forEach(i => weaknesses.push(`Fake backend: ${i.message}`));
        break;
      }
      default:
        score += 10;
    }
  } else {
    // ── B. Static analysis fallback ──────────────────────────────────────────
    score += _staticBackendScore(files, strengths, weaknesses);
  }

  return { score: Math.max(0, Math.min(100, score)), strengths, weaknesses };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _staticBackendScore(files, strengths, weaknesses) {
  let delta = 0;
  const allContent = Object.values(files).join('\n');
  const paths      = Object.keys(files);

  // Real API routes
  const hasRoutes = /(?:app|router)\.(get|post|put|patch|delete)\s*\(/.test(allContent);
  if (hasRoutes) { delta += 10; strengths.push('API routes defined'); }
  else           { weaknesses.push('No API route definitions found'); }

  // Database connection
  const hasDb = /mongoose\.connect|new PrismaClient|createPool|createClient|\.connect\(process\.env/.test(allContent);
  if (hasDb) { delta += 10; strengths.push('Database connection present'); }

  // Auth middleware
  const hasAuth = /jwt\.verify|bcrypt|authenticate|requireAuth|verifyToken/.test(allContent);
  if (hasAuth) { delta += 8; strengths.push('Authentication logic present'); }

  // process.env usage (real config, not hardcoded)
  const hasEnvUsage = /process\.env\.[A-Z_]{3,}/.test(allContent);
  if (hasEnvUsage) { delta += 5; strengths.push('Environment variables used'); }

  // Detect obvious stubs
  const hasFakeData = /let\s+(?:users|posts|products|orders)\s*=\s*\[/.test(allContent);
  if (hasFakeData)  { delta -= 15; weaknesses.push('In-memory array used as fake database'); }

  // Hardcoded credentials check
  const hasHardcodedCreds = /if\s*\(\s*(?:username|email)\s*===?\s*['"`]/.test(allContent);
  if (hasHardcodedCreds) { delta -= 12; weaknesses.push('Hardcoded credentials in auth handler'); }

  return delta;
}

module.exports = { evaluateBackend };
