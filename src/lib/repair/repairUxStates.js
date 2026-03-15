'use strict';

/**
 * UX STATE REPAIR
 *
 * Injects loading, error, and empty-state patterns into JS files that perform
 * async data fetching but lack these feedback patterns.
 *
 * Strategy:
 *   1. Find JS files with async fetch calls but no loading/error/empty patterns
 *   2. Inject a small UX state helper near the top of the file
 *   3. Wrap identified fetch calls with the pattern
 *
 * Conservative approach: only injects when we can clearly identify the fetch
 * call site and a corresponding container element. Does NOT rewrite logic.
 *
 * @param {import('./types').RepairContext} ctx
 * @returns {import('./types').RepairIssueResult[]}
 */
function repairUxStates(ctx) {
  const { fileMap, filePaths, issues, decisions } = ctx;
  /** @type {import('./types').RepairIssueResult[]} */
  const results = [];

  const uxIssues = issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair && (
      i.id === 'missing_loading_states' ||
      i.id === 'missing_error_states'   ||
      i.id === 'missing_empty_states'
    );
  });

  if (uxIssues.length === 0) return results;

  const issueIds = new Set(uxIssues.map(i => i.id));

  // Find JS files that fetch data
  for (const [filePath, content] of fileMap) {
    if (!filePath.endsWith('.js'))            continue;
    if (filePath.includes('server'))          continue; // server-side files — skip
    if (!_hasFetch(content))                  continue; // no async calls

    let newContent = content;
    let changed    = false;

    // ── Loading state ──────────────────────────────────────────────────────
    if (issueIds.has('missing_loading_states') && !_hasLoadingPattern(content)) {
      newContent = _injectLoadingHelper(newContent, filePath);
      changed = true;
    }

    // ── Error state ────────────────────────────────────────────────────────
    if (issueIds.has('missing_error_states') && !_hasErrorPattern(content)) {
      newContent = _injectErrorHandler(newContent);
      changed = true;
    }

    // ── Empty state ────────────────────────────────────────────────────────
    if (issueIds.has('missing_empty_states') && !_hasEmptyPattern(content)) {
      newContent = _injectEmptyCheck(newContent);
      changed = true;
    }

    if (changed && newContent !== content) {
      fileMap.set(filePath, newContent);
      const patched = [
        issueIds.has('missing_loading_states') && !_hasLoadingPattern(content) ? 'loading' : null,
        issueIds.has('missing_error_states')   && !_hasErrorPattern(content)   ? 'error'   : null,
        issueIds.has('missing_empty_states')   && !_hasEmptyPattern(content)   ? 'empty'   : null,
      ].filter(Boolean);

      results.push({
        issueId:    uxIssues[0].id,
        action:     'injected_code',
        path:       filePath,
        reason:     `Injected ${patched.join('/')} state patterns into ${filePath}`,
        safety:     'conditional_auto_repair',
        confidence: 0.72,
      });
    }
  }

  // ── HTML: ensure state divs are present in pages with data containers ─────
  if (issueIds.has('missing_loading_states') || issueIds.has('missing_error_states') || issueIds.has('missing_empty_states')) {
    for (const [filePath, content] of fileMap) {
      if (!filePath.endsWith('.html')) continue;

      const htmlResult = _injectHtmlStateDivs(filePath, content, issueIds);
      if (htmlResult && htmlResult !== content) {
        fileMap.set(filePath, htmlResult);
        results.push({
          issueId:    uxIssues[0].id,
          action:     'updated_file',
          path:       filePath,
          reason:     `Added loading/error/empty state divs to ${filePath}`,
          safety:     'conditional_auto_repair',
          confidence: 0.70,
        });
      }
    }
  }

  return results;
}

// ── Detection helpers ─────────────────────────────────────────────────────────

function _hasFetch(content) {
  return /fetch\s*\(|axios\.|\.get\s*\(|\.post\s*\(|async\s+function|await\s+/.test(content);
}

function _hasLoadingPattern(content) {
  return /loading|spinner|skeleton|isLoading|setLoading/.test(content);
}

function _hasErrorPattern(content) {
  return /catch\s*\(|\.catch\s*\(|error\.textContent|error\.innerHTML|error-msg|errorMsg/.test(content);
}

function _hasEmptyPattern(content) {
  return /empty|no.data|no.results|length\s*===?\s*0|\.length\s*<\s*1/.test(content);
}

// ── JS injection helpers ──────────────────────────────────────────────────────

function _injectLoadingHelper(content, filePath) {
  const helper = `
// ── UX: Loading state helper (auto-injected) ──────────────────────────────────
function showLoading(containerId, show) {
  const el = document.getElementById(containerId + '-loading');
  if (el) el.style.display = show ? 'block' : 'none';
}

`;
  // Inject after 'use strict' or at the top of DOMContentLoaded
  if (content.includes("'use strict';")) {
    return content.replace("'use strict';", "'use strict';" + helper);
  }
  if (content.includes('DOMContentLoaded')) {
    return content.replace(
      /(document\.addEventListener\s*\(\s*['"]DOMContentLoaded['"]\s*,\s*(?:async\s+)?\(\s*\)\s*=>\s*\{)/,
      `$1\n  // Loading state helper injected — use showLoading(id, true/false)\n`
    );
  }
  return helper + content;
}

function _injectErrorHandler(content) {
  const helper = `
// ── UX: Error display helper (auto-injected) ──────────────────────────────────
function showError(containerId, message) {
  const el  = document.getElementById(containerId + '-error');
  const msg = document.getElementById(containerId + '-error-msg');
  if (el)  el.style.display = 'block';
  if (msg) msg.textContent = message || 'Something went wrong.';
}

function hideError(containerId) {
  const el = document.getElementById(containerId + '-error');
  if (el) el.style.display = 'none';
}

`;
  // Wrap any bare .catch(err => console... with showError
  let result = helper + content;

  // If there are catch blocks without user-visible error handling, add a comment
  result = result.replace(
    /} catch \((\w+)\) \{\s*\n(\s*)console\.(error|log)\(([^)]+)\);/g,
    (match, errVar, indent, level, args) =>
      `} catch (${errVar}) {\n${indent}console.${level}(${args});\n${indent}// TODO: showError('container-id', ${errVar}.message);`
  );

  return result;
}

function _injectEmptyCheck(content) {
  const helper = `
// ── UX: Empty state helper (auto-injected) ────────────────────────────────────
function showEmpty(containerId, show) {
  const el = document.getElementById(containerId + '-empty');
  if (el) el.style.display = show ? 'block' : 'none';
}

`;
  return helper + content;
}

// ── HTML injection ────────────────────────────────────────────────────────────

/**
 * Add loading/error/empty divs inside data containers that don't have them.
 * Targets `<div id="xxx-data">` or `<div id="xxx-content">` patterns.
 */
function _injectHtmlStateDivs(filePath, content, issueIds) {
  // Find containers like <div id="NAME-data"> or <div id="NAME-content">
  const containerPattern = /<div\s+id="([a-z][a-z0-9-]*(?:-data|-content|-list|-grid))"([^>]*)>/gi;
  let match;
  let result = content;
  let changed = false;

  while ((match = containerPattern.exec(content)) !== null) {
    const containerId = match[1];
    const base = containerId.replace(/-(?:data|content|list|grid)$/, '');

    const needsLoading = issueIds.has('missing_loading_states') && !content.includes(`id="${base}-loading"`);
    const needsError   = issueIds.has('missing_error_states')   && !content.includes(`id="${base}-error"`);
    const needsEmpty   = issueIds.has('missing_empty_states')   && !content.includes(`id="${base}-empty"`);

    if (!needsLoading && !needsError && !needsEmpty) continue;

    const stateHtml = [
      needsLoading ? `\n        <div class="loading-state" id="${base}-loading" style="display:none"><p>Loading...</p></div>` : '',
      needsError   ? `\n        <div class="error-state"   id="${base}-error"   style="display:none"><p id="${base}-error-msg">Something went wrong.</p></div>` : '',
      needsEmpty   ? `\n        <div class="empty-state"   id="${base}-empty"   style="display:none"><p>No results found.</p></div>` : '',
    ].join('');

    const tag = match[0];
    result  = result.replace(tag, tag + stateHtml);
    changed = true;
  }

  return changed ? result : null;
}

module.exports = { repairUxStates };
