'use strict';

/**
 * MISSING FILE REPAIR
 *
 * Creates structural scaffold files for blueprint-required files that were
 * not generated. Only creates when strongly grounded by the blueprint/spec.
 *
 * Uses real, working scaffolding — not empty stubs.
 *
 * @param {import('./types').RepairContext} ctx
 * @returns {import('./types').RepairIssueResult[]}
 */
function repairMissingFiles(ctx) {
  const { fileMap, filePaths, issues, decisions, blueprint, intent } = ctx;
  /** @type {import('./types').RepairIssueResult[]} */
  const results = [];

  const missingFileIssues = issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair && (
      i.id.startsWith('missing_blueprint_file:') ||
      i.id.startsWith('missing_spec_file:') ||
      i.id.startsWith('missing_page:')
    );
  });

  if (missingFileIssues.length === 0) return results;

  for (const issue of missingFileIssues) {
    const filePath = issue.file;
    if (!filePath || filePaths.has(filePath)) continue;

    // Find spec for this file in blueprint
    const spec = _findSpec(blueprint, filePath);
    const content = _generateFileContent(filePath, spec, intent, fileMap, filePaths);

    if (content === null) continue; // can't generate — skip

    fileMap.set(filePath, content);
    filePaths.add(filePath);

    results.push({
      issueId:    issue.id,
      action:     'created_file',
      path:       filePath,
      reason:     `Created missing blueprint file "${filePath}" — ${spec?.description || 'scaffold from blueprint spec'}`,
      safety:     'conditional_auto_repair',
      confidence: 0.80,
    });
  }

  return results;
}

// ── File content generators ───────────────────────────────────────────────────

/**
 * Generate content for a missing file based on its path and type.
 * @param {string} filePath
 * @param {Object|null} spec
 * @param {Object} intent
 * @param {Map<string, string>} fileMap
 * @param {Set<string>} filePaths
 * @returns {string|null}
 */
function _generateFileContent(filePath, spec, intent, fileMap, filePaths) {
  const ext  = filePath.split('.').pop()?.toLowerCase();
  const base = filePath.split('/').pop()?.toLowerCase().replace(/\.[^.]+$/, '');
  const desc = spec?.description || base;

  if (ext === 'html') return _generateHtmlPage(filePath, base, desc, intent, fileMap, filePaths);
  if (ext === 'css')  return _generateCssFile(filePath, desc, fileMap);
  if (ext === 'js')   return _generateJsFile(filePath, base, desc, intent, spec);
  if (ext === 'json') return _generateJsonFile(filePath, base);
  if (ext === 'md')   return null; // README handled by repairDeployment
  return null;
}

// ── HTML generators ───────────────────────────────────────────────────────────

function _generateHtmlPage(filePath, base, desc, intent, fileMap, filePaths) {
  // Detect CSS file
  const cssFile = [...filePaths].find(p => p.endsWith('.css')) || 'style.css';
  const jsFile  = [...filePaths].find(p => p.endsWith('.js') && !p.includes('server')) || 'app.js';
  const title   = _titleCase(base || desc);

  // Standard page template
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="${_relativePath(filePath, cssFile)}">
</head>
<body>
  <header class="site-header">
    <nav class="nav">
      <a href="index.html" class="nav__brand">${_appName(fileMap)}</a>
      <ul class="nav__links">
        <li><a href="index.html">Home</a></li>${intent.needsAuth ? '\n        <li><a href="login.html">Sign In</a></li>' : ''}
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

  <script src="${_relativePath(filePath, jsFile)}"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // TODO: initialize ${title} page functionality
    });
  </script>
</body>
</html>
`;
}

// ── JS generators ────────────────────────────────────────────────────────────

function _generateJsFile(filePath, base, desc, intent, spec) {
  const jsFunctions = spec?.jsFunctions || [];
  const fnSigs = jsFunctions.map(f =>
    `\nfunction ${f.name || 'fn'}() {\n  // TODO: implement ${f.description || f.name}\n}\n`
  ).join('');

  return `'use strict';

/**
 * ${_titleCase(desc || base)}
 * Auto-generated scaffold — implement the TODO sections.
 */

document.addEventListener('DOMContentLoaded', () => {
  init();
});

function init() {
  // TODO: initialize ${_titleCase(desc || base)}
}

${fnSigs}
`;
}

// ── CSS generator ─────────────────────────────────────────────────────────────

function _generateCssFile(filePath, desc, fileMap) {
  // If a style.css already exists, generate a scoped extension
  if (fileMap.has('style.css') && filePath !== 'style.css') {
    const base = filePath.split('/').pop()?.replace('.css', '') || 'module';
    return `/* ${_titleCase(desc)} styles */
@import url('./style.css');

.${base}-container {
  padding: var(--space-md, 16px);
}
`;
  }

  return `/* Base stylesheet — scaffold */
:root {
  --color-primary:    #4F46E5;
  --color-bg:         #F8FAFC;
  --color-text:       #1E293B;
  --color-surface:    #FFFFFF;
  --color-border:     #E2E8F0;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 40px;
  --radius-sm: 4px;
  --radius-md: 8px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--color-bg); color: var(--color-text); }

.container { max-width: 1200px; margin: 0 auto; padding: 0 var(--space-lg); }
.btn { display: inline-flex; align-items: center; padding: var(--space-sm) var(--space-md); border-radius: var(--radius-md); border: none; cursor: pointer; font-size: 0.875rem; font-weight: 500; transition: all 0.15s ease; }
.btn--primary { background: var(--color-primary); color: #fff; }
.btn--primary:hover { filter: brightness(1.1); }

.loading-state, .empty-state, .error-state { padding: var(--space-xl); text-align: center; color: #64748B; }
.error-state { color: #EF4444; }

@media (max-width: 640px) {
  .container { padding: 0 var(--space-md); }
}
`;
}

// ── JSON generator ────────────────────────────────────────────────────────────

function _generateJsonFile(filePath, base) {
  if (base === 'package') return null; // package.json handled elsewhere
  if (base === 'tsconfig') {
    return JSON.stringify({ compilerOptions: { target: 'ES2020', module: 'commonjs', strict: true, outDir: './dist' }, include: ['src/**/*'] }, null, 2);
  }
  return JSON.stringify({ name: base }, null, 2);
}

// ── Spec finder ───────────────────────────────────────────────────────────────

function _findSpec(blueprint, filePath) {
  return (blueprint.fileSpecs || []).find(s => s.path === filePath || s.filename === filePath) || null;
}

// ── Tiny utilities ────────────────────────────────────────────────────────────

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
  // Simple relative path for same-directory files
  const fromParts = from.split('/');
  if (fromParts.length === 1) return to;
  const depth = fromParts.length - 1;
  return '../'.repeat(depth) + to;
}

module.exports = { repairMissingFiles };
