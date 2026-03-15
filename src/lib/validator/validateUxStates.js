'use strict';

/**
 * UX STATE VALIDATION
 *
 * Checks that generated JS/HTML includes patterns for key UX states:
 * loading, error, and empty states. Only flags issues when the app
 * type warrants them (e.g., data-heavy apps need empty states).
 *
 * Checks:
 *   - Loading states present in async-heavy apps                [medium]
 *   - Error states present in apps with API/data calls          [medium]
 *   - Empty states present in listing/dashboard style apps      [minor]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateUxStates(ctx) {
  const { fileMap, intent } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  const allJsContent   = _joinFiles(fileMap, p => p.endsWith('.js') || p.endsWith('.ts'));
  const allHtmlContent = _joinFiles(fileMap, p => p.endsWith('.html'));
  const allContent     = allJsContent + '\n' + allHtmlContent;

  // Determine if the app is data-heavy
  const isDataHeavy = intent.needsDatabase ||
    /dashboard|analytics|listing|marketplace|crm|booking|management/.test(intent.appType || '') ||
    (intent.features || []).some(f => /list|table|grid|chart|analytics/i.test(f.name || ''));

  // Determine if the app makes async calls
  const hasAsyncCalls = /fetch\s*\(|axios\.|\.ajax\(|async\s+function|await\s+/.test(allJsContent);

  // ── 1. Loading states ────────────────────────────────────────────────────
  if (hasAsyncCalls) {
    const hasLoadingState = /loading|spinner|skeleton|isLoading|showLoader|\.loading\b/.test(allContent);
    if (!hasLoadingState) {
      issues.push({
        id:         'missing_loading_state',
        severity:   'medium',
        message:    'App makes async calls but no loading state patterns found (loading class, spinner, isLoading variable)',
        suggestion: 'Add loading indicators: show a spinner/skeleton while data is being fetched',
      });
    }
  }

  // ── 2. Error states ──────────────────────────────────────────────────────
  if (hasAsyncCalls) {
    const hasErrorState = /catch\s*\(|\.catch\s*\(|error\s*[=:({]|\.error\b|errorMessage|showError|displayError/.test(allJsContent);
    if (!hasErrorState) {
      issues.push({
        id:         'missing_error_state',
        severity:   'medium',
        message:    'App makes async calls but no error handling patterns found (catch blocks, error display)',
        suggestion: 'Add try/catch blocks around API calls and display user-friendly error messages',
      });
    }
  }

  // ── 3. Empty states ──────────────────────────────────────────────────────
  if (isDataHeavy) {
    const hasEmptyState = /empty.?state|no.?data|no.?results|no.?items|nothing.?here|isEmpty|\.length\s*===\s*0|\.length\s*==\s*0/.test(allContent);
    if (!hasEmptyState) {
      issues.push({
        id:         'missing_empty_state',
        severity:   'minor',
        message:    'Data-heavy app has no empty state handling (no-results, no-data patterns)',
        suggestion: 'Add empty state UI: show a helpful message when lists/tables have no data',
      });
    }
  }

  // ── 4. Form validation feedback ──────────────────────────────────────────
  const hasForms = /<form|<input/.test(allHtmlContent);
  if (hasForms) {
    const hasFormError = /invalid|\.valid|required|validat|form-error|field-error|input-error/.test(allContent);
    if (!hasFormError) {
      issues.push({
        id:         'missing_form_validation',
        severity:   'minor',
        message:    'App has forms but no form validation error display patterns found',
        suggestion: 'Add inline validation feedback to form fields (required field messages, format errors)',
      });
    }
  }

  return { status: _checkStatus(issues), issues };
}

function _joinFiles(fileMap, predicate) {
  const parts = [];
  for (const [p, content] of fileMap) {
    if (predicate(p) && content) parts.push(content);
  }
  return parts.join('\n');
}

/**
 * @param {import('./types').ValidationIssue[]} issues
 * @returns {import('./types').CheckStatus}
 */
function _checkStatus(issues) {
  if (issues.length === 0) return 'pass';
  if (issues.some(i => i.severity === 'critical' || i.severity === 'major')) return 'fail';
  return 'warning';
}

module.exports = { validateUxStates };
