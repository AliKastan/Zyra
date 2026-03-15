'use strict';

/**
 * CONSISTENCY REPAIR
 *
 * Applies light, safe consistency fixes across the generated project:
 *
 *   1. CSS variable references — ensures --color-primary etc. are declared if used
 *   2. Missing 'use strict' — adds to JS files that fetch/export but lack it
 *   3. Consistent API base URL — replaces ad-hoc localhost strings with a shared
 *      constant when multiple JS files use different base URLs
 *   4. HTML lang attribute — adds lang="en" when missing
 *   5. Meta viewport — adds responsive viewport tag when missing from HTML
 *
 * All operations are purely additive or cosmetic — no business logic is changed.
 *
 * @param {import('./types').RepairContext} ctx
 * @returns {import('./types').RepairIssueResult[]}
 */
function repairConsistency(ctx) {
  const { fileMap, filePaths, issues, decisions } = ctx;
  /** @type {import('./types').RepairIssueResult[]} */
  const results = [];

  const consistencyIssues = issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair && (
      i.id === 'missing_css_variables'    ||
      i.id === 'missing_use_strict'       ||
      i.id === 'inconsistent_api_base'    ||
      i.id === 'missing_html_lang'        ||
      i.id === 'missing_viewport_meta'
    );
  });

  // Even if no explicit issues flagged, always run the safe HTML fixes
  const issueIds = new Set(consistencyIssues.map(i => i.id));

  // ── 1. HTML lang attribute ─────────────────────────────────────────────────
  for (const [filePath, content] of fileMap) {
    if (!filePath.endsWith('.html')) continue;

    let newContent = content;

    // lang="en" on <html>
    if (/<html(?![^>]*lang=)[^>]*>/.test(newContent)) {
      newContent = newContent.replace(/<html([^>]*)>/, '<html$1 lang="en">');
    }

    // viewport meta
    if (!/<meta[^>]+viewport/.test(newContent) && newContent.includes('<head>')) {
      newContent = newContent.replace(
        /(<head[^>]*>)/,
        '$1\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">'
      );
    }

    // charset
    if (!/<meta[^>]+charset/.test(newContent) && newContent.includes('<head>')) {
      newContent = newContent.replace(
        /(<head[^>]*>)/,
        '$1\n  <meta charset="UTF-8">'
      );
    }

    if (newContent !== content) {
      fileMap.set(filePath, newContent);
      results.push({
        issueId:    'missing_html_lang',
        action:     'updated_file',
        path:       filePath,
        reason:     `Fixed HTML meta tags (lang/viewport/charset) in ${filePath}`,
        safety:     'safe_auto_repair',
        confidence: 0.95,
      });
    }
  }

  // ── 2. CSS variable declarations ───────────────────────────────────────────
  if (issueIds.has('missing_css_variables') || _usesCssVarReferences(fileMap)) {
    const stylePaths = [...filePaths].filter(p => p.endsWith('.css'));
    for (const cssPath of stylePaths) {
      const content = fileMap.get(cssPath) || '';
      if (/:root\s*\{/.test(content)) continue; // already has :root

      // Check if any var(--xxx) is used but no :root block
      if (!/var\(--/.test(content)) continue;

      const usedVars = _extractUsedVars(content);
      if (usedVars.size === 0) continue;

      const rootBlock = _buildRootBlock(usedVars);
      fileMap.set(cssPath, rootBlock + '\n' + content);
      results.push({
        issueId:    'missing_css_variables',
        action:     'updated_file',
        path:       cssPath,
        reason:     `Added :root CSS variable declarations to ${cssPath}`,
        safety:     'safe_auto_repair',
        confidence: 0.88,
      });
    }
  }

  // ── 3. 'use strict' in client JS files ─────────────────────────────────────
  if (issueIds.has('missing_use_strict')) {
    for (const [filePath, content] of fileMap) {
      if (!filePath.endsWith('.js'))              continue;
      if (filePath.includes('server'))            continue; // may be module type
      if (content.includes("'use strict'"))       continue;
      if (content.includes('"use strict"'))       continue;
      if (/import\s+|export\s+(default|const|function|class)/.test(content)) continue; // ES module

      fileMap.set(filePath, "'use strict';\n\n" + content);
      results.push({
        issueId:    'missing_use_strict',
        action:     'updated_file',
        path:       filePath,
        reason:     `Added 'use strict' to ${filePath}`,
        safety:     'safe_auto_repair',
        confidence: 0.90,
      });
    }
  }

  // ── 4. Consistent API_BASE constant ────────────────────────────────────────
  if (issueIds.has('inconsistent_api_base')) {
    _normalizeApiBase(fileMap, filePaths, results);
  }

  return results;
}

// ── CSS helpers ────────────────────────────────────────────────────────────────

function _usesCssVarReferences(fileMap) {
  for (const [p, c] of fileMap) {
    if (p.endsWith('.css') && /var\(--/.test(c) && !/:root/.test(c)) return true;
  }
  return false;
}

function _extractUsedVars(cssContent) {
  const vars = new Set();
  const re = /var\((--[a-zA-Z0-9-]+)[^)]*\)/g;
  let m;
  while ((m = re.exec(cssContent)) !== null) vars.add(m[1]);
  return vars;
}

const CSS_VAR_DEFAULTS = {
  '--color-primary':    '#4F46E5',
  '--color-secondary':  '#7C3AED',
  '--color-accent':     '#06B6D4',
  '--color-bg':         '#F8FAFC',
  '--color-surface':    '#FFFFFF',
  '--color-text':       '#1E293B',
  '--color-text-muted': '#64748B',
  '--color-border':     '#E2E8F0',
  '--color-error':      '#EF4444',
  '--color-success':    '#22C55E',
  '--space-xs':   '4px',
  '--space-sm':   '8px',
  '--space-md':   '16px',
  '--space-lg':   '24px',
  '--space-xl':   '40px',
  '--space-2xl':  '64px',
  '--radius-sm':  '4px',
  '--radius-md':  '8px',
  '--radius-lg':  '12px',
  '--radius-full':'9999px',
  '--shadow-sm':  '0 1px 2px rgba(0,0,0,0.05)',
  '--shadow-md':  '0 4px 6px rgba(0,0,0,0.07)',
};

function _buildRootBlock(usedVars) {
  const declarations = [...usedVars]
    .map(v => `  ${v}: ${CSS_VAR_DEFAULTS[v] || '#000'};`)
    .join('\n');
  return `:root {\n${declarations}\n}`;
}

// ── API base normalizer ────────────────────────────────────────────────────────

function _normalizeApiBase(fileMap, filePaths, results) {
  const API_CONST = `const API_BASE = (typeof process !== 'undefined' && process.env && process.env.API_URL)
  ? process.env.API_URL
  : (window.location.hostname === 'localhost' ? 'http://localhost:3000' : '');`;

  for (const [filePath, content] of fileMap) {
    if (!filePath.endsWith('.js'))           continue;
    if (filePath.includes('server'))         continue;
    if (content.includes('API_BASE'))        continue;

    // Only add if there are fetch/axios calls with hardcoded localhost
    if (!/['"](https?:\/\/localhost:\d+)['"]/.test(content)) continue;

    // Replace hardcoded strings
    const updated = content
      .replace(/['"](https?:\/\/localhost:\d+)['"]/g, (_, url) => {
        const path = url.replace(/https?:\/\/localhost:\d+/, '');
        return path ? `API_BASE + '${path}'` : 'API_BASE';
      });

    const withConst = API_CONST + '\n\n' + updated;
    fileMap.set(filePath, withConst);
    results.push({
      issueId:    'inconsistent_api_base',
      action:     'updated_file',
      path:       filePath,
      reason:     `Added API_BASE constant and replaced hardcoded localhost URLs in ${filePath}`,
      safety:     'safe_auto_repair',
      confidence: 0.85,
    });
  }
}

module.exports = { repairConsistency };
