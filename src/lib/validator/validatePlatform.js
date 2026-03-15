'use strict';

/**
 * PLATFORM STRUCTURE VALIDATION
 *
 * Detects the target platform (web / mobile / fullstack) from generated files
 * and checks that the platform's structural requirements are met.
 *
 * Checks for web:
 *   - At least one .html entry point exists                     [critical]
 *   - Entry point is index.html or a named page                 [major]
 *
 * Checks for mobile (React Native / Expo):
 *   - App.js or App.tsx exists                                  [critical]
 *   - Navigation container is wired (NavigationContainer)       [major]
 *   - screens/ directory or Screen files exist                  [major]
 *   - app.json or app.config.js exists                         [major]
 *
 * Checks for fullstack:
 *   - Both frontend and backend layers have files               [major]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validatePlatform(ctx) {
  const { fileMap, filePaths, intent, complexityReport, blueprint } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  const platform = _detectPlatform(filePaths, fileMap, intent, complexityReport);

  switch (platform) {
    case 'mobile':
      _validateMobile(fileMap, filePaths, issues);
      break;
    case 'fullstack':
      _validateFullstack(filePaths, issues);
      // Also validate web layer
      _validateWeb(filePaths, issues);
      break;
    case 'web':
    default:
      _validateWeb(filePaths, issues);
      break;
  }

  return { status: _checkStatus(issues), issues };
}

// ── Platform detection ────────────────────────────────────────────────────────

function _detectPlatform(filePaths, fileMap, intent, complexityReport) {
  // Mobile signals
  const hasMobileSignals = complexityReport?.signals?.hasMobile;
  const hasAppJs = filePaths.has('App.js') || filePaths.has('App.tsx') || filePaths.has('App.jsx');
  const hasExpoConfig = filePaths.has('app.json') || filePaths.has('app.config.js') || filePaths.has('app.config.ts');
  const allJsContent = _joinFiles(fileMap, p => p.endsWith('.js') || p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.jsx'));
  const hasRNImport = /react-native|@react-navigation|expo/.test(allJsContent);

  if (hasMobileSignals || (hasAppJs && hasRNImport) || hasExpoConfig) {
    return 'mobile';
  }

  // Fullstack signals: has both HTML and backend server
  const hasHtml = [...filePaths].some(p => p.endsWith('.html'));
  const hasServer = [...filePaths].some(p => /server\.(js|ts)$/.test(p)) || /app\.listen/.test(allJsContent);
  const hasApiRoutes = [...filePaths].some(p => p.includes('routes/') || p.includes('api/'));

  if (hasHtml && (hasServer || hasApiRoutes)) {
    return 'fullstack';
  }

  return 'web';
}

// ── Web validation ────────────────────────────────────────────────────────────

function _validateWeb(filePaths, issues) {
  const htmlFiles = [...filePaths].filter(p => p.endsWith('.html'));

  if (htmlFiles.length === 0) {
    issues.push({
      id:         'missing_html_entry_point',
      severity:   'critical',
      message:    'Web app has no .html files — there is no user-facing entry point',
      suggestion: 'Generate index.html as the main entry point',
    });
    return;
  }

  // Check index.html exists (or at least one root-level HTML)
  const hasIndexHtml = filePaths.has('index.html') || filePaths.has('./index.html');
  const hasRootHtml  = htmlFiles.some(p => !p.includes('/'));

  if (!hasIndexHtml && !hasRootHtml) {
    issues.push({
      id:         'missing_index_html',
      severity:   'major',
      message:    `HTML files exist (${htmlFiles.slice(0, 3).join(', ')}) but no index.html root entry point`,
      suggestion: 'Create index.html as the app entry point or ensure the main HTML file is at the root',
    });
  }
}

// ── Mobile validation ─────────────────────────────────────────────────────────

function _validateMobile(fileMap, filePaths, issues) {
  const allJsContent = _joinFiles(fileMap, p =>
    p.endsWith('.js') || p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.jsx')
  );

  // App.js / App.tsx must exist
  const hasAppEntry = filePaths.has('App.js') || filePaths.has('App.tsx') || filePaths.has('App.jsx');
  if (!hasAppEntry) {
    issues.push({
      id:         'missing_app_entry',
      severity:   'critical',
      message:    'Mobile app has no App.js or App.tsx entry point',
      suggestion: 'Create App.js as the root component with NavigationContainer setup',
    });
  }

  // Navigation container
  const hasNavigationContainer = /NavigationContainer/.test(allJsContent);
  if (!hasNavigationContainer) {
    issues.push({
      id:         'missing_navigation_container',
      severity:   'major',
      message:    'No NavigationContainer found — React Navigation is not properly wired',
      suggestion: 'Wrap your app in <NavigationContainer> in App.js and set up your stack/tab navigator',
    });
  }

  // Navigator setup
  const hasNavigator = /createStackNavigator|createNativeStackNavigator|createBottomTabNavigator|createDrawerNavigator/.test(allJsContent);
  if (!hasNavigator) {
    issues.push({
      id:         'missing_navigator',
      severity:   'major',
      message:    'No navigator setup found (createStackNavigator, createBottomTabNavigator, etc.)',
      suggestion: 'Create a navigator (e.g., createNativeStackNavigator) and define your screen routes',
    });
  }

  // Screens
  const hasScreens = [...filePaths].some(p => /[Ss]creen\.(js|ts|tsx|jsx)$/.test(p) || /screens?\//i.test(p));
  if (!hasScreens) {
    issues.push({
      id:         'missing_screens',
      severity:   'major',
      message:    'No screen files found (screens/ directory or *Screen.js files)',
      suggestion: 'Create a screens/ directory with individual screen components for each route',
    });
  }

  // app.json config
  const hasAppConfig = filePaths.has('app.json') || filePaths.has('app.config.js') || filePaths.has('app.config.ts');
  if (!hasAppConfig) {
    issues.push({
      id:         'missing_app_config',
      severity:   'major',
      message:    'No app.json or app.config.js found — Expo cannot build without an app configuration',
      suggestion: 'Create app.json with name, slug, version, and icon configuration',
    });
  }
}

// ── Fullstack validation ──────────────────────────────────────────────────────

function _validateFullstack(filePaths, issues) {
  // Should have both frontend (HTML) and backend (server/routes) files
  const hasHtml = [...filePaths].some(p => p.endsWith('.html'));
  const hasBackend = [...filePaths].some(p =>
    /server\.(js|ts)$/.test(p) || p.includes('routes/') || p.includes('api/')
  );

  if (!hasHtml) {
    issues.push({
      id:         'missing_frontend_layer',
      severity:   'major',
      message:    'Fullstack app is missing frontend HTML files',
      suggestion: 'Generate HTML files for the frontend layer',
    });
  }

  if (!hasBackend) {
    issues.push({
      id:         'missing_backend_layer',
      severity:   'major',
      message:    'Fullstack app is missing backend server/routes files',
      suggestion: 'Generate server.js or routes/ directory with API endpoints',
    });
  }
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

module.exports = { validatePlatform };
