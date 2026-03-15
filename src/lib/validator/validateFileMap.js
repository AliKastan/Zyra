'use strict';

/**
 * FILE MAP VALIDATION
 *
 * Checks:
 *   - Every file in blueprint.fileList was actually generated  [critical]
 *   - Every file in blueprint.fileSpecs was generated          [critical]
 *   - .env.example exists (if env vars will be needed)         [major]
 *   - README.md exists                                         [minor]
 *   - package.json exists for non-static stacks                [major]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateFileMap(ctx) {
  const { fileMap, filePaths, blueprint, intent } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  // ── 1. Blueprint fileList ────────────────────────────────────────────────
  const fileList = blueprint.fileList || [];
  for (const expectedPath of fileList) {
    if (!filePaths.has(expectedPath)) {
      issues.push({
        id:         `missing_blueprint_file:${expectedPath}`,
        severity:   'critical',
        message:    `Blueprint required file "${expectedPath}" was not generated`,
        file:       expectedPath,
        suggestion: `Generate the missing file "${expectedPath}" with appropriate content`,
      });
    }
  }

  // ── 2. Blueprint fileSpecs paths ─────────────────────────────────────────
  const fileSpecs = blueprint.fileSpecs || [];
  for (const spec of fileSpecs) {
    const specPath = spec.path || spec.filename;
    if (!specPath) continue;
    if (!filePaths.has(specPath) && !fileList.includes(specPath)) {
      issues.push({
        id:         `missing_spec_file:${specPath}`,
        severity:   'critical',
        message:    `Blueprint spec file "${specPath}" (${spec.description || 'no description'}) was not generated`,
        file:       specPath,
        suggestion: `Generate "${specPath}" implementing: ${spec.description || specPath}`,
      });
    }
  }

  // ── 3. .env.example ──────────────────────────────────────────────────────
  const needsEnvFile = intent.needsAuth || intent.needsPayments ||
    (intent.integrations && intent.integrations.length > 0) ||
    (intent.needsDatabase && intent.needsDatabase !== false);
  if (needsEnvFile && !filePaths.has('.env.example')) {
    issues.push({
      id:         'missing_env_example',
      severity:   'major',
      message:    '.env.example is missing — env vars required by this app are not documented',
      file:       '.env.example',
      suggestion: 'Create .env.example listing all required environment variables with placeholder values',
    });
  }

  // ── 4. README.md ─────────────────────────────────────────────────────────
  const hasReadme = filePaths.has('README.md') || filePaths.has('readme.md');
  if (!hasReadme) {
    issues.push({
      id:         'missing_readme',
      severity:   'minor',
      message:    'README.md is missing — project lacks setup and usage documentation',
      file:       'README.md',
      suggestion: 'Create README.md with project description, setup steps, and env var documentation',
    });
  }

  // ── 5. package.json for non-static stacks ────────────────────────────────
  const isStaticOnly = (blueprint.tech?.backend === 'none' || blueprint.tech?.backend === undefined) &&
    !intent.needsDatabase && !intent.needsAuth;
  const hasServerJs = [...filePaths].some(p => p.endsWith('server.js') || p.endsWith('index.js') || p.includes('api/'));
  if (hasServerJs && !filePaths.has('package.json')) {
    issues.push({
      id:         'missing_package_json',
      severity:   'major',
      message:    'package.json is missing — server-side project has no dependency manifest',
      file:       'package.json',
      suggestion: 'Create package.json with required dependencies and npm scripts',
    });
  }

  return { status: _checkStatus(issues), issues };
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

module.exports = { validateFileMap };
