'use strict';

/**
 * Design Quality Evaluator
 *
 * Scores the visual/structural design quality of the generated output.
 *
 * Evaluates:
 * - CSS custom properties (design tokens)
 * - Responsive layout (media queries, flex/grid)
 * - Component hierarchy (reusable components vs inline styles)
 * - Consistent spacing / typography system
 * - No inline styles as primary styling approach
 * - Dark mode / theme support
 *
 * Returns raw score 0–100 for this dimension.
 */

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {Object} files      - Normalized { path: content } map
 * @param {Object} [blueprint] - Enriched blueprint (for designSpec hints)
 * @returns {{ score: number, strengths: string[], weaknesses: string[] }}
 */
function evaluateDesign(files, blueprint) {
  const strengths  = [];
  const weaknesses = [];
  let   score      = 20; // baseline

  const cssFiles  = Object.entries(files).filter(([p]) => p.endsWith('.css') || p.endsWith('.scss') || p.endsWith('.module.css'));
  const allCss    = cssFiles.map(([, c]) => c).join('\n');
  const allContent = Object.values(files).join('\n');
  const paths     = Object.keys(files);

  // ── 1. CSS custom properties / design tokens (0–20 pts) ──────────────────
  const hasCssVars = /--[\w-]+\s*:/i.test(allCss || allContent);
  if (hasCssVars) { score += 20; strengths.push('CSS custom properties (design tokens) defined'); }
  else             { weaknesses.push('No CSS custom properties — hardcoded values may be inconsistent'); }

  // ── 2. Responsive layout (0–15 pts) ──────────────────────────────────────
  const hasMediaQueries = /@media\s*\(/.test(allCss || allContent);
  const hasFlexOrGrid   = /display\s*:\s*(?:flex|grid)/.test(allCss || allContent);
  if (hasMediaQueries) { score += 8;  strengths.push('Media queries for responsive layout'); }
  else                  { weaknesses.push('No media queries — may not be responsive'); }
  if (hasFlexOrGrid)   { score += 7;  strengths.push('Flexbox or CSS Grid layout'); }

  // ── 3. Typography system (0–10 pts) ──────────────────────────────────────
  const hasTypography = /font-size|font-family|line-height|font-weight/.test(allCss || allContent);
  const hasFontScale  = /clamp\(|rem\b|em\b/.test(allCss || allContent);
  if (hasTypography && hasFontScale) { score += 10; strengths.push('Typography scale defined'); }
  else if (hasTypography)            { score += 5;  }

  // ── 4. Component reuse (0–10 pts) ────────────────────────────────────────
  const componentCount = paths.filter(p =>
    /components\//.test(p) && /\.(jsx?|tsx?)$/.test(p)
  ).length;
  if (componentCount >= 5)      { score += 10; strengths.push(`${componentCount} reusable components`); }
  else if (componentCount >= 2) { score += 5;  }
  else                          { weaknesses.push('Few reusable components detected'); }

  // ── 5. No inline-style dominance (0–10 pts) ──────────────────────────────
  const inlineStyleCount = (allContent.match(/style=\{\{/g) || []).length;
  const htmlStyleCount   = (allContent.match(/style="[^"]{20,}"/g) || []).length;
  const totalInline      = inlineStyleCount + htmlStyleCount;
  if (totalInline === 0)      { score += 10; strengths.push('Clean CSS separation (no inline styles)'); }
  else if (totalInline <= 5)  { score += 5;  }
  else                        { weaknesses.push(`Excessive inline styles (${totalInline} occurrences)`); }

  // ── 6. Design spec hints (0–15 pts) ──────────────────────────────────────
  // Bonus if the design system selector (Stage 4.5) was applied
  const designSpec = blueprint?._designSpec;
  if (designSpec?.preset) {
    score += 10;
    strengths.push(`Design system preset applied: ${designSpec.preset}`);
  }
  if (designSpec?.generationHints?.length > 0) {
    score += 5;
    strengths.push('Design system generation hints consumed');
  }

  // ── 7. Theme / color system (0–10 pts) ───────────────────────────────────
  const hasColorSystem = (
    (/--(?:primary|accent|bg|surface|text|border)[-\w]*\s*:/i.test(allCss || allContent)) ||
    (/background.*#[0-9a-f]{3,6}|color.*#[0-9a-f]{3,6}/i.test(allCss || allContent))
  );
  if (hasColorSystem) { score += 10; strengths.push('Color system / palette defined'); }
  else                 { weaknesses.push('No consistent color system detected'); }

  return { score: Math.max(0, Math.min(100, score)), strengths, weaknesses };
}

module.exports = { evaluateDesign };
