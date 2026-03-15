'use strict';

/**
 * ROUTE / SCREEN COMPLETENESS VALIDATION
 *
 * Checks that all pages/routes defined in the blueprint actually exist
 * as generated files, and that navigation links are consistent.
 *
 * Checks:
 *   - Each blueprint page has a corresponding HTML file          [major]
 *   - Navigation links in HTML point to existing pages           [medium]
 *   - Dashboard / settings / admin pages exist when expected     [major]
 *   - Mobile screens exist when mobile platform detected         [major]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateRoutes(ctx) {
  const { fileMap, filePaths, blueprint, intent, complexityReport } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  const allHtmlContent = _joinFiles(fileMap, p => p.endsWith('.html'));

  // ── 1. Blueprint pages must exist ────────────────────────────────────────
  const blueprintPages = _collectBlueprintPages(blueprint);

  for (const page of blueprintPages) {
    const pagePath = page.path || page.file || page;
    if (!pagePath || typeof pagePath !== 'string') continue;
    if (!pagePath.endsWith('.html')) continue;

    if (!filePaths.has(pagePath)) {
      issues.push({
        id:         `missing_page:${pagePath}`,
        severity:   'major',
        message:    `Blueprint page "${pagePath}" (${page.name || pagePath}) was not generated`,
        file:       pagePath,
        suggestion: `Generate "${pagePath}" with the page layout and content described in the blueprint`,
      });
    }
  }

  // ── 2. Navigation link consistency ───────────────────────────────────────
  // Find all <a href="*.html"> links in generated HTML
  for (const [filePath, content] of fileMap) {
    if (!content || !filePath.endsWith('.html')) continue;

    for (const m of content.matchAll(/href=["']([^"'?#]+\.html)["']/g)) {
      const linkedPath = m[1];
      // Skip external and anchor-only links
      if (linkedPath.startsWith('http') || linkedPath.startsWith('//')) continue;
      // Strip leading ./
      const normalized = linkedPath.startsWith('./') ? linkedPath.slice(2) : linkedPath;
      if (!filePaths.has(normalized)) {
        issues.push({
          id:         `broken_nav_link:${normalized}`,
          severity:   'medium',
          message:    `Navigation link to "${linkedPath}" in "${filePath}" points to a file that does not exist`,
          file:       filePath,
          suggestion: `Create "${normalized}" or fix the navigation link in "${filePath}"`,
        });
      }
    }
  }

  // ── 3. Expected standard pages ────────────────────────────────────────────
  // Dashboard apps should have a dashboard page
  const appType = intent.appType || '';
  const hasDashboardFeature = (intent.features || []).some(f =>
    /dashboard|analytics|overview/i.test(f.name || f.description || '')
  );
  const isDashboardApp = /dashboard|analytics|saas|crm|admin|management/.test(appType);

  if ((isDashboardApp || hasDashboardFeature) && !_hasPage(filePaths, 'dashboard')) {
    issues.push({
      id:         'missing_dashboard_page',
      severity:   'major',
      message:    'App appears to need a dashboard but no dashboard.html was generated',
      suggestion: 'Generate dashboard.html with key metrics, charts, and navigation',
    });
  }

  // Profile / account page for auth apps
  if (intent.needsAuth && !_hasPage(filePaths, 'profile') && !_hasPage(filePaths, 'account') && !_hasPage(filePaths, 'settings')) {
    issues.push({
      id:         'missing_profile_page',
      severity:   'medium',
      message:    'Auth-required app has no profile, account, or settings page',
      suggestion: 'Generate profile.html or settings.html for user account management',
    });
  }

  // ── 4. Mobile screens ─────────────────────────────────────────────────────
  const isMobile = (complexityReport?.signals?.hasMobile) ||
    /mobile|react.native|expo/.test(JSON.stringify(blueprint).toLowerCase());

  if (isMobile) {
    const hasScreens = [...filePaths].some(p => /screens?\//i.test(p) || /Screen\.(js|ts|tsx|jsx)$/.test(p));
    if (!hasScreens) {
      issues.push({
        id:         'missing_mobile_screens',
        severity:   'major',
        message:    'Mobile app detected but no screens/ directory or Screen files found',
        suggestion: 'Create screens/ directory with individual screen components for each route',
      });
    }
  }

  return { status: _checkStatus(issues), issues };
}

function _collectBlueprintPages(blueprint) {
  const pages = [];

  // blueprint.product.pages
  if (Array.isArray(blueprint.product?.pages)) pages.push(...blueprint.product.pages);

  // blueprint.pages
  if (Array.isArray(blueprint.pages)) pages.push(...blueprint.pages);

  // blueprint.fileSpecs for .html files
  for (const spec of (blueprint.fileSpecs || [])) {
    const specPath = spec.path || spec.filename;
    if (specPath && specPath.endsWith('.html')) {
      if (!pages.some(p => (p.path || p) === specPath)) {
        pages.push({ path: specPath, name: spec.description || specPath });
      }
    }
  }

  return pages;
}

function _hasPage(filePaths, keyword) {
  return [...filePaths].some(p => p.includes(keyword));
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

module.exports = { validateRoutes };
