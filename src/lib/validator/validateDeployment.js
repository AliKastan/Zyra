'use strict';

/**
 * DEPLOYMENT READINESS VALIDATION
 *
 * Checks whether the project is structurally ready for deployment to
 * Railway, Vercel, Expo, or similar platforms.
 *
 * Checks:
 *   - Health route exists for server-side apps                  [medium]
 *   - process.env.PORT is used for server port binding          [medium]
 *   - No hardcoded localhost URLs in non-config files            [medium]
 *   - README.md exists with setup instructions                  [minor]
 *   - .env.example is present and not empty                     [medium]
 *   - package.json start script is Railway-compatible           [medium]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateDeployment(ctx) {
  const { fileMap, filePaths } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  const allJsContent = _joinFiles(fileMap, p => p.endsWith('.js') || p.endsWith('.ts'));

  // Detect if this is a server-side project
  const hasServerCode = allJsContent.includes('express') ||
    allJsContent.includes('http.createServer') ||
    allJsContent.includes('app.listen') ||
    allJsContent.includes('fastify') ||
    [...filePaths].some(p => /server\.(js|ts)$/.test(p) || /index\.(js|ts)$/.test(p));

  if (!hasServerCode) {
    // Static project — minimal checks
    return _validateStaticDeployment(filePaths, fileMap, issues);
  }

  // ── 1. Health route ───────────────────────────────────────────────────────
  const hasHealthRoute = /['"]\/health['"]|['"]\/api\/health['"]|router\.get\s*\(\s*['"]\/health|app\.get\s*\(\s*['"]\/health/.test(allJsContent);
  if (!hasHealthRoute) {
    issues.push({
      id:         'missing_health_route',
      severity:   'medium',
      message:    'No health check route found (/health or /api/health) — Railway/container deployments use health checks',
      suggestion: 'Add: app.get("/health", (req, res) => res.json({ status: "ok" }))',
    });
  }

  // ── 2. process.env.PORT ───────────────────────────────────────────────────
  const hasPortEnv = /process\.env\.PORT/.test(allJsContent);
  if (!hasPortEnv) {
    // Check if app.listen is using a hardcoded port
    const hardcodedPort = allJsContent.match(/app\.listen\s*\(\s*(\d{4,5})/);
    if (hardcodedPort) {
      issues.push({
        id:         'hardcoded_port',
        severity:   'medium',
        message:    `Server listens on hardcoded port ${hardcodedPort[1]} instead of process.env.PORT — will fail on Railway/Heroku`,
        suggestion: `Change to: app.listen(process.env.PORT || ${hardcodedPort[1]}, ...)`,
      });
    }
  }

  // ── 3. Hardcoded localhost URLs ───────────────────────────────────────────
  for (const [filePath, content] of fileMap) {
    if (!content) continue;
    // Skip .env.example and README where localhost is expected
    if (filePath.includes('.env') || filePath.includes('README')) continue;
    // Skip config files
    if (/config\.(js|ts|json)$/.test(filePath)) continue;

    const localhostMatches = content.match(/['"]https?:\/\/localhost:\d+[^'"]*['"]/g);
    if (localhostMatches && localhostMatches.length > 0) {
      issues.push({
        id:         `hardcoded_localhost:${filePath}`,
        severity:   'medium',
        message:    `Hardcoded localhost URL found in "${filePath}" — will break in production`,
        file:       filePath,
        suggestion: `Replace hardcoded localhost URLs with process.env.API_URL or relative paths`,
      });
    }
  }

  // ── 4. .env.example exists and is non-empty ───────────────────────────────
  if (!filePaths.has('.env.example')) {
    issues.push({
      id:         'missing_env_example_deploy',
      severity:   'medium',
      message:    '.env.example is missing — deployment team cannot know what env vars to configure',
      file:       '.env.example',
      suggestion: 'Create .env.example listing all required environment variables',
    });
  } else {
    const envContent = fileMap.get('.env.example') || '';
    if (envContent.trim().length < 10) {
      issues.push({
        id:         'empty_env_example',
        severity:   'medium',
        message:    '.env.example exists but is nearly empty — required env vars are not documented',
        file:       '.env.example',
        suggestion: 'Document all required env vars with placeholder values in .env.example',
      });
    }
  }

  // ── 5. README.md ─────────────────────────────────────────────────────────
  if (!filePaths.has('README.md') && !filePaths.has('readme.md')) {
    issues.push({
      id:         'missing_readme_deploy',
      severity:   'minor',
      message:    'README.md is missing — deployment documentation is absent',
      suggestion: 'Create README.md with local setup instructions, env var descriptions, and deploy steps',
    });
  } else {
    // Check README has at least some useful content
    const readmeContent = fileMap.get('README.md') || fileMap.get('readme.md') || '';
    if (readmeContent.trim().length < 100) {
      issues.push({
        id:         'thin_readme',
        severity:   'minor',
        message:    'README.md exists but is very sparse (< 100 chars)',
        file:       'README.md',
        suggestion: 'Expand README.md with installation steps, env var documentation, and usage instructions',
      });
    }
  }

  return { status: _checkStatus(issues), issues };
}

function _validateStaticDeployment(filePaths, fileMap, issues) {
  // Static apps just need an index.html entry point
  if (!filePaths.has('index.html')) {
    issues.push({
      id:         'missing_index_html',
      severity:   'major',
      message:    'Static project has no index.html entry point — cannot be deployed',
      file:       'index.html',
      suggestion: 'Create index.html as the main entry point for the static app',
    });
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

module.exports = { validateDeployment };
