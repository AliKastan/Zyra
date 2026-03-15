'use strict';

/**
 * Stage 6 — Semantic Output Validation.
 *
 * Pure static analysis — no API call. Checks the generated files against both
 * the blueprint specification and general web quality standards.
 *
 * Checks (in order of importance):
 *   CRITICAL — block the repair pass if not fixed:
 *     - Missing files from the blueprint file list
 *     - Empty or stub files (< 200 chars)
 *     - CSS/JS files referenced in HTML but not generated
 *
 *   WARNING — passed to repair engine, fixed if possible:
 *     - Missing HTML5 DOCTYPE
 *     - Missing viewport meta
 *     - Inputs without associated labels
 *     - Buttons with no accessible text (no label, no aria-label, only icon chars)
 *     - CSS file appears to have no rules (only variables/comments)
 *     - JS file has no DOMContentLoaded or event listeners (probably incomplete)
 *     - Placeholder text remaining (Lorem ipsum)
 *     - TODO/FIXME comments remaining
 *     - Blueprint cssComponents not referenced anywhere in HTML
 *     - Blueprint JS functions not found in any JS file
 *
 * Score: 100 − (critical × 20) − (warning × 5), min 0
 */

/**
 * @param {Array<{path:string,content:string}>} files
 * @param {import('../types').AppBlueprint} blueprint
 * @returns {import('../types').ValidationReport}
 */
function validateOutput(files, blueprint) {
  /** @type {import('../types').ValidationIssue[]} */
  const issues  = [];
  const fileMap = new Map(files.map(f => [f.path, f.content]));

  // ── 1. All blueprint files must be present ───────────────────────────────────
  for (const filePath of (blueprint.fileList || [])) {
    if (!fileMap.has(filePath)) {
      issues.push({ type: 'missing_file', file: filePath, message: 'Expected file was not generated', severity: 'critical' });
    }
  }

  // Gather HTML and non-HTML content for cross-checks
  const htmlEntries = [...fileMap.entries()].filter(([p]) => p.endsWith('.html'));
  const jsEntries   = [...fileMap.entries()].filter(([p]) => p.endsWith('.js'));
  const cssEntries  = [...fileMap.entries()].filter(([p]) => p.endsWith('.css'));
  const allHtml     = htmlEntries.map(([, c]) => c).join('\n');
  const allJs       = jsEntries.map(([, c]) => c).join('\n');
  const allCss      = cssEntries.map(([, c]) => c).join('\n');

  // ── 2. File completeness checks ───────────────────────────────────────────────
  for (const [path, content] of fileMap) {
    const minLength = path.endsWith('.html') ? 200 : path.endsWith('.css') ? 100 : 50;
    if (!content || content.trim().length < minLength) {
      issues.push({ type: 'empty_file', file: path, message: `File is too short (${content?.trim().length || 0} chars) — likely incomplete`, severity: 'critical' });
    }
  }

  // ── 3. HTML structure checks ──────────────────────────────────────────────────
  for (const [path, content] of htmlEntries) {
    if (!content || content.trim().length < 200) continue; // already caught above

    if (!content.includes('<!DOCTYPE') && !/<html/i.test(content)) {
      issues.push({ type: 'no_html_structure', file: path, message: 'Missing <!DOCTYPE html> declaration', severity: 'warning' });
    }

    if (!/viewport/.test(content)) {
      issues.push({ type: 'missing_viewport', file: path, message: 'Missing <meta name="viewport"> — not mobile-friendly', severity: 'warning' });
    }

    // Check inputs have labels
    const inputIds = [...content.matchAll(/<input[^>]+id=["']([^"']+)["']/g)].map(m => m[1]);
    for (const id of inputIds) {
      if (!new RegExp(`for=["']${id}["']`).test(content)) {
        issues.push({ type: 'missing_label', file: path, message: `Input id="${id}" has no associated <label for="${id}">`, severity: 'warning' });
      }
    }

    // Check for Lorem ipsum / placeholder text
    if (/lorem ipsum/i.test(content)) {
      issues.push({ type: 'placeholder_text', file: path, message: 'Lorem ipsum placeholder text found — replace with real content', severity: 'warning' });
    }

    // Check for TODO/FIXME comments
    if (/(?:TODO|FIXME|PLACEHOLDER|add your|your content here)/i.test(content)) {
      issues.push({ type: 'unimplemented_stub', file: path, message: 'TODO/placeholder comments found — feature not implemented', severity: 'warning' });
    }
  }

  // ── 4. CSS/JS referenced in HTML must exist ───────────────────────────────────
  const cssRefs = [...allHtml.matchAll(/href=["']([^"'?#]+\.css)["']/g)].map(m => m[1]);
  const jsRefs  = [...allHtml.matchAll(/src=["']([^"'?#]+\.js)["']/g)].map(m => m[1]);

  for (const ref of [...cssRefs, ...jsRefs]) {
    if (ref.startsWith('http') || ref.startsWith('//') || ref.startsWith('https')) continue;
    if (!fileMap.has(ref)) {
      issues.push({ type: 'broken_reference', file: ref, message: `Referenced in HTML (<link>/<script>) but not generated`, severity: 'critical' });
    }
  }

  // ── 5. CSS quality checks ─────────────────────────────────────────────────────
  for (const [path, content] of cssEntries) {
    if (!content || content.trim().length < 100) continue;

    // CSS has almost no rules (probably just variables dumped)
    const ruleCount = (content.match(/\{[^}]+\}/g) || []).length;
    if (ruleCount < 5) {
      issues.push({ type: 'incomplete_css', file: path, message: `Only ${ruleCount} CSS rule blocks — stylesheet appears incomplete`, severity: 'warning' });
    }

    // No media queries — not responsive
    if (!/@media[\s(]/.test(content) && allHtml.length > 0) {
      issues.push({ type: 'no_responsive_css', file: path, message: 'No @media queries found — not responsive', severity: 'warning' });
    }
  }

  // ── 6. JS quality checks ──────────────────────────────────────────────────────
  for (const [path, content] of jsEntries) {
    if (!content || content.trim().length < 50) continue;

    // No DOMContentLoaded and no immediate invocation — likely broken init
    const hasInit = /DOMContentLoaded/.test(content) || /\(\s*function/.test(content) || /window\.onload/.test(content);
    if (!hasInit) {
      issues.push({ type: 'no_dom_init', file: path, message: 'No DOMContentLoaded handler — DOM manipulation may run before elements exist', severity: 'warning' });
    }

    // TODO/FIXME stubs
    if (/(?:TODO|FIXME|not implemented|stub|placeholder)/i.test(content)) {
      issues.push({ type: 'unimplemented_stub', file: path, message: 'TODO/stub comments found — feature not fully implemented', severity: 'warning' });
    }

    // console.log left in
    if (/console\.log/.test(content)) {
      issues.push({ type: 'debug_code', file: path, message: 'console.log() calls found — remove before deployment', severity: 'warning' });
    }
  }

  // ── 7. Blueprint CSS components referenced in HTML ────────────────────────────
  const expectedComponents = (blueprint.cssComponents || []).map(c => c.className?.replace(/^\./, '')).filter(Boolean);
  const missingComponents  = expectedComponents.filter(cls => !allHtml.includes(cls) && !allCss.includes(`.${cls}`));
  if (missingComponents.length > 0 && expectedComponents.length > 2) {
    // Only flag if a significant fraction is missing (tolerate minor drift)
    const missingFraction = missingComponents.length / expectedComponents.length;
    if (missingFraction > 0.5) {
      issues.push({
        type:     'blueprint_drift',
        file:     'style.css',
        message:  `${missingComponents.length}/${expectedComponents.length} blueprint CSS components not found in HTML or CSS: ${missingComponents.slice(0, 5).join(', ')}`,
        severity: 'warning',
      });
    }
  }

  // ── 8. Blueprint JS functions implemented ─────────────────────────────────────
  const expectedFunctions = (blueprint.fileSpecs || [])
    .flatMap(s => (s.jsFunctions || []).map(fn => fn.name))
    .filter(Boolean);
  const missingFunctions  = expectedFunctions.filter(name => !allJs.includes(name));
  if (missingFunctions.length > 0) {
    const missingFraction = missingFunctions.length / expectedFunctions.length;
    if (missingFraction > 0.4) {
      issues.push({
        type:     'missing_functions',
        file:     jsEntries[0]?.[0] || 'app.js',
        message:  `${missingFunctions.length} blueprint functions not found: ${missingFunctions.slice(0, 5).join(', ')}`,
        severity: 'warning',
      });
    }
  }

  // ── Score and summary ─────────────────────────────────────────────────────────
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount  = issues.filter(i => i.severity === 'warning').length;
  const score         = Math.max(0, 100 - criticalCount * 20 - warningCount * 5);
  const passed        = criticalCount === 0;

  return {
    passed,
    score,
    issues,
    warnings: issues.filter(i => i.severity === 'warning').map(i => `[${i.file}] ${i.message}`),
  };
}

module.exports = { validateOutput };
