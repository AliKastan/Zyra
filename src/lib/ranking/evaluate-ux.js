'use strict';

/**
 * UX Completeness Evaluator
 *
 * Scores how complete the user experience implementation is.
 *
 * Evaluates:
 * - Loading states (skeleton, spinner, isLoading)
 * - Error states (error boundaries, error messages, catch blocks)
 * - Empty states (no-results, empty list handling)
 * - Form validation feedback
 * - Navigation completeness (404, routing)
 * - Accessibility basics (aria-*, alt text)
 *
 * Returns raw score 0–100 for this dimension.
 */

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {Object} files - Normalized { path: content } map
 * @returns {{ score: number, strengths: string[], weaknesses: string[] }}
 */
function evaluateUx(files) {
  const strengths  = [];
  const weaknesses = [];
  let   score      = 0;

  const allContent = Object.values(files).join('\n');
  const paths      = Object.keys(files);

  // ── 1. Loading states (0–20 pts) ─────────────────────────────────────────
  const loadingPatterns = [
    /isLoading|loading:\s*true|setLoading\(|skeleton|Skeleton|Spinner|<Loading/,
    /useState.*false.*loading|loading.*useState/i,
  ];
  if (loadingPatterns.some(re => re.test(allContent))) {
    score += 20;
    strengths.push('Loading states implemented');
  } else {
    weaknesses.push('No loading states detected');
  }

  // ── 2. Error states (0–20 pts) ───────────────────────────────────────────
  const errorPatterns = [
    /isError|hasError|setError|error\s*&&|errorMessage|ErrorBoundary|catch\s*\(/,
    /<.*[Ee]rror.*>/,
    /\.catch\s*\(|try\s*\{.*catch/s,
  ];
  if (errorPatterns.some(re => re.test(allContent))) {
    score += 20;
    strengths.push('Error states and handling present');
  } else {
    weaknesses.push('No error states or error handling detected');
  }

  // ── 3. Empty states (0–15 pts) ───────────────────────────────────────────
  const emptyPatterns = [
    /\.length\s*===?\s*0|isEmpty|emptyState|no.*results|No results|empty.*list/i,
    /items\.length === 0|data\.length === 0|list\.length === 0/,
  ];
  if (emptyPatterns.some(re => re.test(allContent))) {
    score += 15;
    strengths.push('Empty state handling implemented');
  } else {
    weaknesses.push('No empty state handling detected');
  }

  // ── 4. Form validation (0–15 pts) ────────────────────────────────────────
  const formPatterns = [
    /required|validate|validation|isValid|formError|fieldError|invalid/i,
    /e\.preventDefault\(\)|onSubmit|handleSubmit/,
  ];
  const hasForm = /<form|<Form|<input|<Input/i.test(allContent);
  if (hasForm) {
    if (formPatterns.some(re => re.test(allContent))) {
      score += 15;
      strengths.push('Form validation present');
    } else {
      score += 5;
      weaknesses.push('Forms present but no validation detected');
    }
  } else {
    score += 10; // no forms needed — neutral
  }

  // ── 5. Navigation / routing (0–15 pts) ───────────────────────────────────
  const hasNavigation = (
    /react-router|next\/router|useNavigate|<Route|<Link|router\.push/i.test(allContent) ||
    paths.some(p => p.includes('pages/') || p.includes('routes/'))
  );
  if (hasNavigation) { score += 10; strengths.push('Navigation / routing present'); }

  const has404 = /404|NotFound|not-found/i.test(allContent) || paths.some(p => /404|not.found/i.test(p));
  if (has404) { score += 5; strengths.push('404 / not-found page present'); }
  else         { weaknesses.push('No 404 / not-found handling'); }

  // ── 6. Accessibility basics (0–15 pts) ───────────────────────────────────
  const hasAria = /aria-|role=["']|alt=["']/.test(allContent);
  if (hasAria) { score += 8; strengths.push('Accessibility attributes (aria/alt) present'); }
  else          { weaknesses.push('No aria-* or alt attributes detected'); }

  const hasSemanticHtml = /<(?:main|nav|header|footer|section|article)\b/i.test(allContent);
  if (hasSemanticHtml) { score += 7; strengths.push('Semantic HTML elements used'); }

  return { score: Math.max(0, Math.min(100, score)), strengths, weaknesses };
}

module.exports = { evaluateUx };
