'use strict';

/**
 * ROUTES REPAIR
 *
 * Creates missing HTML page shells for blueprint-declared pages that were not
 * generated. Delegates to repairMissingFiles for the actual file content but
 * focuses specifically on missing_page: and missing_html_page: issue IDs not
 * already handled by repairMissingFiles (which only processes blueprint_file
 * and spec_file issues).
 *
 * Also updates navigation links in existing HTML files when a new page is added
 * so menus stay consistent.
 *
 * @param {import('./types').RepairContext} ctx
 * @returns {import('./types').RepairIssueResult[]}
 */
function repairRoutes(ctx) {
  const { fileMap, filePaths, issues, decisions, blueprint, intent } = ctx;
  /** @type {import('./types').RepairIssueResult[]} */
  const results = [];

  const routeIssues = issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair && (
      i.id.startsWith('missing_page:') ||
      i.id.startsWith('missing_html_page:')
    );
  });

  if (routeIssues.length === 0) return results;

  const newPages = [];

  for (const issue of routeIssues) {
    const filePath = issue.file || _extractFilePath(issue.id);
    if (!filePath || filePaths.has(filePath)) continue;

    const base  = filePath.split('/').pop()?.replace('.html', '') || 'page';
    const title = _titleCase(base);
    const cssFile = [...filePaths].find(p => p.endsWith('.css')) || 'style.css';
    const jsFile  = [...filePaths].find(p => p.endsWith('.js') && !p.includes('server') && !p.includes('auth')) || null;
    const appName = _appName(fileMap);

    const html = _generatePageShell({ filePath, base, title, cssFile, jsFile, appName, intent });
    fileMap.set(filePath, html);
    filePaths.add(filePath);
    newPages.push({ filePath, title });

    results.push({
      issueId:    issue.id,
      action:     'created_file',
      path:       filePath,
      reason:     `Created missing page shell "${filePath}" (${title})`,
      safety:     'conditional_auto_repair',
      confidence: 0.80,
    });
  }

  // ── Update nav links in existing HTML pages ─────────────────────────────────
  if (newPages.length > 0) {
    const navResults = _updateNavLinks(fileMap, filePaths, newPages);
    results.push(...navResults);
  }

  return results;
}

// ── Page shell generator ───────────────────────────────────────────────────────

function _generatePageShell({ filePath, base, title, cssFile, jsFile, appName, intent }) {
  const cssHref  = _relativePath(filePath, cssFile);
  const jsScript = jsFile ? `\n  <script src="${_relativePath(filePath, jsFile)}"></script>` : '';
  const authLink = intent.needsAuth ? '\n        <li><a href="login.html">Sign In</a></li>' : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — ${appName}</title>
  <link rel="stylesheet" href="${cssHref}">
</head>
<body>
  <header class="site-header">
    <nav class="nav">
      <a href="index.html" class="nav__brand">${appName}</a>
      <ul class="nav__links">
        <li><a href="index.html">Home</a></li>${authLink}
      </ul>
    </nav>
  </header>

  <main class="main-content">
    <div class="container">
      <h1>${title}</h1>

      <div id="${base}-content" class="page-content">
        <div class="loading-state" id="${base}-loading" style="display:none">
          <p>Loading...</p>
        </div>
        <div class="empty-state" id="${base}-empty" style="display:none">
          <p>No content yet.</p>
        </div>
        <div class="error-state" id="${base}-error" style="display:none">
          <p id="${base}-error-msg">Something went wrong.</p>
        </div>
        <div id="${base}-data"></div>
      </div>
    </div>
  </main>
${jsScript}
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // TODO: initialize ${title} page
      const loading = document.getElementById('${base}-loading');
      const data    = document.getElementById('${base}-data');
      // Show loading while fetching
      // loading.style.display = 'block';
    });
  </script>
</body>
</html>
`;
}

// ── Nav link updater ───────────────────────────────────────────────────────────

/**
 * Add nav entries for newly created pages into existing HTML files.
 * Only adds when a <ul class="nav__links"> pattern is found.
 */
function _updateNavLinks(fileMap, filePaths, newPages) {
  const results = [];

  for (const [filePath, content] of fileMap) {
    if (!filePath.endsWith('.html')) continue;

    const navMatch = content.match(/<ul[^>]+class="[^"]*nav__links[^"]*"[^>]*>([\s\S]*?)<\/ul>/);
    if (!navMatch) continue;

    let changed = false;
    let newContent = content;

    for (const { filePath: newPath, title } of newPages) {
      if (filePath === newPath) continue; // skip self
      const href = _relativePath(filePath, newPath);

      // Don't add duplicate
      if (newContent.includes(`href="${href}"`)) continue;

      const newLi = `\n        <li><a href="${href}">${title}</a></li>`;
      newContent = newContent.replace(
        /(<ul[^>]+class="[^"]*nav__links[^"]*"[^>]*>)/,
        `$1${newLi}`
      );
      changed = true;
    }

    if (changed) {
      fileMap.set(filePath, newContent);
      results.push({
        issueId:    'nav_link_update',
        action:     'updated_file',
        path:       filePath,
        reason:     `Updated navigation links in ${filePath} to include new pages`,
        safety:     'safe_auto_repair',
        confidence: 0.88,
      });
    }
  }

  return results;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function _extractFilePath(issueId) {
  const prefix = issueId.startsWith('missing_page:') ? 'missing_page:'
    : issueId.startsWith('missing_html_page:') ? 'missing_html_page:'
    : null;
  if (!prefix) return null;
  const raw = issueId.slice(prefix.length);
  return raw.endsWith('.html') ? raw : raw + '.html';
}

function _titleCase(str) {
  return (str || '').replace(/[-_./]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function _appName(fileMap) {
  try {
    const pkg = JSON.parse(fileMap.get('package.json') || '{}');
    return _titleCase(pkg.name || 'App');
  } catch {
    return 'App';
  }
}

function _relativePath(from, to) {
  const depth = from.split('/').length - 1;
  return depth === 0 ? to : '../'.repeat(depth) + to;
}

module.exports = { repairRoutes };
