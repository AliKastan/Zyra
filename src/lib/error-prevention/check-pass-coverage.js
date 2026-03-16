'use strict';

/**
 * Generation Pass Coverage Checks
 *
 * Identifies gaps between what the app requires and what generation passes cover.
 * Flags missing UX states, missing route files, missing integration wrappers,
 * and disconnected feature planning.
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').PreventionInput} input
 * @returns {import('./types').PreventionIssue[]}
 */
function checkPassCoverage(input) {
  const { intent = {}, product = {}, stack = {}, blueprint = {}, complexityReport = null } = input;

  const issues = [];
  const allText  = _buildAllText(intent, product, blueprint, stack);
  const signals  = complexityReport?.signals || {};
  const fileList = _getFileList(stack, blueprint);
  const pages    = product.pages || [];

  // ── Dashboard / data apps need UX states ─────────────────────────────────
  const hasDashboard = /\b(dashboard|analytics|overview|stats|metrics|reports)\b/.test(allText);
  if (hasDashboard) {
    const hasLoadingState = allText.includes('loading') || allText.includes('skeleton') || allText.includes('spinner');
    const hasErrorState   = allText.includes('error state') || allText.includes('error boundary') || allText.includes('retry');
    const hasEmptyState   = allText.includes('empty state') || allText.includes('no data') || allText.includes('empty');

    if (!hasLoadingState) {
      issues.push({
        id: 'dashboard-missing-loading-state',
        category: 'ux_states',
        severity: 'medium',
        action: 'generation_hint_added',
        reason: 'Dashboard apps require loading states. Without them, async data loads show blank UI.',
        fix: 'Add loading skeleton/spinner states to dashboard components',
      });
    }

    if (!hasErrorState) {
      issues.push({
        id: 'dashboard-missing-error-state',
        category: 'ux_states',
        severity: 'medium',
        action: 'generation_hint_added',
        reason: 'Dashboard apps need error states for when API calls fail.',
        fix: 'Add error boundary or error message component for data fetch failures',
      });
    }

    if (!hasEmptyState) {
      issues.push({
        id: 'dashboard-missing-empty-state',
        category: 'ux_states',
        severity: 'low',
        action: 'generation_hint_added',
        reason: 'Dashboards should show a helpful message when there is no data yet.',
        fix: 'Add empty state UI for charts/tables that show when no data is available',
      });
    }
  }

  // ── Page → file coverage gap ──────────────────────────────────────────────
  for (const page of pages) {
    const pageName = (page.name || page || '').toLowerCase().replace(/\s+/g, '-');
    if (!pageName) continue;

    const isPlanned = fileList.some(f => f.toLowerCase().includes(pageName));
    if (!isPlanned && pageName.length > 2) {
      issues.push({
        id: `page-file-gap-${pageName}`,
        category: 'routing',
        severity: 'medium',
        action: 'warning_only',
        reason: `Page "${pageName}" is in the product plan but has no corresponding file in the planned file list.`,
        fix: `Add ${pageName}.html or pages/${pageName}.js to the planned file list`,
      });
    }
  }

  // ── Integration wrapper planning ──────────────────────────────────────────
  const integrations = _detectIntegrations(allText, signals);
  for (const integration of integrations) {
    const hasWrapper = fileList.some(f =>
      f.toLowerCase().includes(integration.name.toLowerCase()) ||
      f.toLowerCase().includes(integration.alias || integration.name.toLowerCase()),
    );

    if (!hasWrapper) {
      issues.push({
        id: `integration-missing-wrapper-${integration.name.toLowerCase()}`,
        category: 'integrations',
        severity: 'medium',
        action: 'generation_hint_added',
        reason: `${integration.name} integration is planned but no wrapper/client module is in the file map.`,
        fix: `Add lib/${integration.name.toLowerCase()}.js or utils/${integration.alias || integration.name.toLowerCase()}.js to centralize ${integration.name} logic`,
      });
    }
  }

  // ── Settings / profile pages ──────────────────────────────────────────────
  const hasUserFeatures = intent.isMultiUser || signals.hasAuth || /\b(user|account|profile|settings)\b/.test(allText);
  if (hasUserFeatures) {
    const hasSettingsPage = pages.some(p => /settings|profile|account/i.test(p.name || p));
    const hasSettingsFile = fileList.some(f => /settings|profile|account/i.test(f));

    if (!hasSettingsPage && !hasSettingsFile) {
      issues.push({
        id: 'multi-user-missing-settings-profile',
        category: 'routing',
        severity: 'low',
        action: 'warning_only',
        reason: 'Multi-user apps typically need settings and profile pages. Missing these creates a poor user experience.',
        fix: 'Add settings and profile pages to the product plan',
      });
    }
  }

  // ── Not-found / 404 page ─────────────────────────────────────────────────
  const isWebApp = !(/mobile|expo/.test(allText));
  if (isWebApp && (complexityReport?.complexityTier !== 'simple')) {
    const has404 = fileList.some(f => /404|not.?found|notfound/i.test(f));
    if (!has404) {
      issues.push({
        id: 'missing-404-page-plan',
        category: 'routing',
        severity: 'low',
        action: 'generation_hint_added',
        reason: 'Web apps should have a 404/not-found page to handle broken links gracefully.',
        fix: 'Add a 404.html or 404.js page to the planned file list',
      });
    }
  }

  return issues;
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _detectIntegrations(allText, signals) {
  const found = [];

  if (signals.hasBilling || /stripe/.test(allText))    found.push({ name: 'Stripe', alias: 'billing' });
  if (signals.hasAI || /openai|claude api/.test(allText)) found.push({ name: 'OpenAI', alias: 'ai' });
  if (/supabase/.test(allText)) found.push({ name: 'Supabase', alias: 'supabase' });
  if (/sendgrid/.test(allText)) found.push({ name: 'SendGrid', alias: 'email' });
  if (/resend/.test(allText))   found.push({ name: 'Resend', alias: 'email' });
  if (/cloudinary/.test(allText)) found.push({ name: 'Cloudinary', alias: 'storage' });

  return found;
}

function _getFileList(stack, blueprint) {
  return [...new Set([...(stack?.files || []), ...(blueprint?.fileList || [])])];
}

function _buildAllText(intent, product, blueprint, stack) {
  return [
    intent.appType || '',
    (intent.features || []).map(f => `${f.name} ${f.description || ''}`).join(' '),
    product.summary || '',
    (product.pages || []).map(p => p.name || p).join(' '),
    blueprint.designNotes || '',
    (blueprint._designSpec?.generationHints || []).join(' '),
    (stack?.files || []).join(' '),
  ].join(' ').toLowerCase();
}

module.exports = { checkPassCoverage };
