'use strict';

/**
 * Deployment Readiness Evaluator
 *
 * Scores deployment readiness. Consumes the readinessReport from
 * the Production Readiness Checker when available.
 *
 * Evaluates:
 * - start / build / dev scripts in package.json
 * - process.env.PORT usage (dynamic port)
 * - /health route
 * - .env.example present
 * - No hardcoded secrets
 *
 * Returns raw score 0–100 for this dimension.
 */

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {Object}      files           - Normalized { path: content } map
 * @param {Object|null} readinessReport - From Production Readiness Checker (optional)
 * @returns {{ score: number, strengths: string[], weaknesses: string[] }}
 */
function evaluateReadiness(files, readinessReport) {
  const strengths  = [];
  const weaknesses = [];

  // ── A. Consume readinessReport (authoritative) ────────────────────────────
  if (readinessReport?.score?.total != null) {
    const rs = readinessReport.score.total; // already 0–100
    const breakdownStrengths = _extractReadinessStrengths(readinessReport);
    const breakdownWeaknesses = _extractReadinessWeaknesses(readinessReport);
    strengths.push(...breakdownStrengths);
    weaknesses.push(...breakdownWeaknesses);

    if (readinessReport.status === 'ready') {
      strengths.push('Production readiness: ready');
    } else if (readinessReport.status === 'not_ready') {
      weaknesses.push(`Production readiness: not ready (score ${rs}/100)`);
    }

    return { score: rs, strengths, weaknesses };
  }

  // ── B. Static analysis fallback ───────────────────────────────────────────
  let score = 30;
  const allContent = Object.values(files).join('\n');
  const paths      = Object.keys(files);

  // package.json scripts
  const pkgRaw = files['package.json'];
  if (pkgRaw && typeof pkgRaw === 'string') {
    try {
      const pkg = JSON.parse(pkgRaw);
      const scripts = pkg.scripts || {};
      if (scripts.start)  { score += 12; strengths.push('start script defined'); }
      else                 { weaknesses.push('No start script in package.json'); }
      if (scripts.build)  { score += 8;  strengths.push('build script defined'); }
      if (scripts.dev)    { score += 5;  strengths.push('dev script defined'); }
    } catch (_) {
      weaknesses.push('package.json is invalid JSON');
      score -= 10;
    }
  } else {
    weaknesses.push('No package.json found');
  }

  // Dynamic port
  const hasDynamicPort = /process\.env\.PORT/.test(allContent);
  if (hasDynamicPort) { score += 10; strengths.push('Dynamic port (process.env.PORT)'); }
  else               { weaknesses.push('Hardcoded or missing port configuration'); }

  // Health route
  const hasHealthRoute = /['"\/]health['"]/.test(allContent);
  if (hasHealthRoute) { score += 8; strengths.push('/health route present'); }
  else               { weaknesses.push('No /health route'); }

  // .env.example
  const hasEnvExample = paths.some(p => p.includes('.env.example'));
  if (hasEnvExample) { score += 10; strengths.push('.env.example present'); }
  else              { weaknesses.push('No .env.example'); }

  // No hardcoded secrets
  const hasHardcodedSecrets = /['"`]sk-[A-Za-z0-9]{20,}['"`]|AKIA[A-Z0-9]{16}/.test(allContent);
  if (!hasHardcodedSecrets) { score += 7; }
  else                      { score -= 15; weaknesses.push('Hardcoded API secrets detected'); }

  return { score: Math.max(0, Math.min(100, score)), strengths, weaknesses };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _extractReadinessStrengths(report) {
  const strengths = [];
  if (report.score?.runtime >= 80)   strengths.push('Runtime score: ' + report.score.runtime);
  if (report.score?.deployment >= 80) strengths.push('Deployment score: ' + report.score.deployment);
  if (report.score?.env >= 80)        strengths.push('Env configuration: ' + report.score.env);
  if (report.score?.security >= 80)   strengths.push('Security score: ' + report.score.security);
  return strengths;
}

function _extractReadinessWeaknesses(report) {
  const weaknesses = [];
  if (report.score?.runtime < 60)    weaknesses.push(`Low runtime score (${report.score.runtime})`);
  if (report.score?.env < 60)        weaknesses.push(`Low env configuration score (${report.score.env})`);
  if (report.score?.security < 60)   weaknesses.push(`Low security score (${report.score.security})`);
  // First 2 critical issues
  const critical = (report.allIssues || []).filter(i => i.severity === 'critical').slice(0, 2);
  critical.forEach(i => weaknesses.push(`Readiness: ${i.message || i.description}`));
  return weaknesses;
}

module.exports = { evaluateReadiness };
