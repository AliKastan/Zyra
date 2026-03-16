'use strict';

/**
 * Completeness Evaluator
 *
 * Scores how complete the generated output is. Consumes the validationReport
 * from the AI Validator when available; falls back to static analysis.
 *
 * Evaluates:
 * - Required routes present (matching blueprint pages/flows)
 * - Integration scaffolding (wrappers for declared integrations)
 * - No broken/missing imports
 * - Feature coverage (declared features have corresponding files)
 * - Error prevention coverage (from preventionReport)
 *
 * Returns raw score 0–100 for this dimension.
 */

// Known integration wrapper patterns
const INTEGRATION_WRAPPERS = {
  Stripe:    [/require\(['"`]stripe['"`]\)|stripe\.paymentIntents/],
  OpenAI:    [/require\(['"`]openai['"`]\)|new OpenAI/],
  Anthropic: [/require\(['"`]@anthropic-ai\/sdk['"`]\)|new Anthropic/],
  Supabase:  [/createClient.*supabase/i],
  SendGrid:  [/sgMail|require\(['"`]@sendgrid/],
  Resend:    [/new Resend|require\(['"`]resend['"`]\)/],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {Object}      files            - Normalized { path: content } map
 * @param {Object|null} validationReport - From AI Validator (optional)
 * @param {Object|null} preventionReport - From Error Prevention Layer (optional)
 * @param {Object}      [blueprint]      - Enriched blueprint (optional)
 * @returns {{ score: number, strengths: string[], weaknesses: string[] }}
 */
function evaluateCompleteness(files, validationReport, preventionReport, blueprint) {
  const strengths  = [];
  const weaknesses = [];
  let   score      = 40; // baseline

  // ── A. Consume validationReport (AI Validator output) ─────────────────────
  if (validationReport) {
    const vs = validationReport.score || 0;
    // Map validator score (0–100) to a +/- delta of max 40 pts
    const delta = Math.round((vs / 100) * 40) - 20; // -20..+20 range
    score += delta;

    if (vs >= 80) strengths.push(`AI validation score ${vs}/100`);
    else          weaknesses.push(`Low AI validation score (${vs}/100)`);

    const critCount = (validationReport.criticalIssues || []).length;
    if (critCount > 0) {
      score -= critCount * 4;
      weaknesses.push(`${critCount} critical validation issue${critCount > 1 ? 's' : ''}`);
    }
  }

  // ── B. Consume preventionReport (Error Prevention output) ─────────────────
  if (preventionReport) {
    const unresolved = (preventionReport.unresolvedRisks || []).length;
    const prevented  = (preventionReport.preventedIssues || []).length;

    if (prevented > 0) { score += Math.min(10, prevented * 2); strengths.push(`${prevented} structural issue${prevented > 1 ? 's' : ''} auto-prevented`); }
    if (unresolved > 0) { score -= unresolved * 3; weaknesses.push(`${unresolved} unresolved structural risk${unresolved > 1 ? 's' : ''}`); }
  }

  // ── C. Static analysis ────────────────────────────────────────────────────
  score += _staticCompletenessScore(files, blueprint, strengths, weaknesses);

  return { score: Math.max(0, Math.min(100, score)), strengths, weaknesses };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _staticCompletenessScore(files, blueprint, strengths, weaknesses) {
  let delta = 0;
  const allContent = Object.values(files).join('\n');
  const paths      = Object.keys(files);

  // Integration wrappers present
  const detectedIntegrations = Object.entries(INTEGRATION_WRAPPERS)
    .filter(([, patterns]) => patterns.some(re => re.test(allContent)))
    .map(([name]) => name);

  if (detectedIntegrations.length > 0) {
    delta += Math.min(10, detectedIntegrations.length * 3);
    strengths.push(`Integration wrappers: ${detectedIntegrations.join(', ')}`);
  }

  // Blueprint feature coverage
  if (blueprint?.fileList?.length > 0) {
    const planned  = blueprint.fileList.length;
    const actual   = paths.filter(p => /\.(js|ts|jsx|tsx|html|css)$/.test(p)).length;
    const coverage = Math.min(1, actual / planned);
    if (coverage >= 0.8) { delta += 8; strengths.push(`High file coverage (${Math.round(coverage * 100)}% of planned)`); }
    else if (coverage < 0.5) { weaknesses.push(`Low file coverage (${Math.round(coverage * 100)}% of planned)`); delta -= 5; }
  }

  // Broken imports check (relative imports to files that don't exist in the output)
  const brokenImports = _countBrokenRelativeImports(files);
  if (brokenImports === 0)   { delta += 5; }
  else if (brokenImports > 3) { delta -= 8; weaknesses.push(`${brokenImports} possibly broken relative imports`); }

  // Middleware / shared utilities
  const hasMiddleware = paths.some(p => p.includes('middleware/') || p.includes('utils/'));
  if (hasMiddleware) { delta += 3; strengths.push('Shared utilities / middleware present'); }

  // Test files (bonus)
  const hasTests = paths.some(p => p.includes('.test.') || p.includes('.spec.') || p.includes('__tests__'));
  if (hasTests) { delta += 3; strengths.push('Test files included'); }

  return delta;
}

function _countBrokenRelativeImports(files) {
  const paths = new Set(Object.keys(files).map(p => p.replace(/\\/g, '/')));
  let broken  = 0;

  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    if (!/\.(js|ts|jsx|tsx)$/.test(filePath)) continue;

    const dir     = filePath.split('/').slice(0, -1).join('/');
    const imports = [...content.matchAll(/(?:require|import)\s*\(?['"`](\.\.?\/[^'"`\s]+)['"`]/g)];

    for (const [, relPath] of imports) {
      // Resolve the import relative to the file's directory
      const parts    = (dir + '/' + relPath).split('/');
      const resolved = [];
      for (const p of parts) {
        if (p === '..') resolved.pop();
        else if (p !== '.') resolved.push(p);
      }
      const candidate = resolved.join('/');
      const extensions = ['', '.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts'];
      const found = extensions.some(ext => paths.has(candidate + ext));
      if (!found) broken++;
    }
  }

  return broken;
}

module.exports = { evaluateCompleteness };
