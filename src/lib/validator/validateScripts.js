'use strict';

/**
 * SCRIPT VALIDATION
 *
 * Checks that package.json has appropriate npm scripts for the detected stack.
 *
 * Checks:
 *   - `start` script exists when server-side code is present    [major]
 *   - `dev` script exists                                       [minor]
 *   - At least one script exists when package.json is present   [major]
 *   - Scripts are non-empty strings                             [medium]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateScripts(ctx) {
  const { fileMap, filePaths } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  if (!filePaths.has('package.json')) {
    return { status: 'pass', issues: [] }; // static projects don't need package.json
  }

  let pkg;
  try {
    pkg = JSON.parse(fileMap.get('package.json'));
  } catch {
    // Already caught in validateDependencies; skip here
    return { status: 'pass', issues: [] };
  }

  const scripts = pkg.scripts || {};
  const scriptNames = Object.keys(scripts);

  // No scripts at all
  if (scriptNames.length === 0) {
    issues.push({
      id:         'no_scripts',
      severity:   'major',
      message:    'package.json has no scripts section — app cannot be started with npm',
      file:       'package.json',
      suggestion: 'Add at minimum a "start" script to package.json',
    });
    return { status: 'fail', issues };
  }

  // Detect whether server-side code is present
  const hasServerCode = [...filePaths].some(p =>
    p.includes('server') || p.includes('index.js') || p.includes('app.js') || p.includes('api/')
  );

  // start script
  if (hasServerCode && !scripts.start) {
    issues.push({
      id:         'missing_start_script',
      severity:   'major',
      message:    'package.json is missing a "start" script — Railway/Vercel deployments require it',
      file:       'package.json',
      suggestion: 'Add "start": "node server.js" (or appropriate entry point) to package.json scripts',
    });
  }

  // dev script
  if (!scripts.dev && !scripts.develop && !scripts.watch) {
    issues.push({
      id:         'missing_dev_script',
      severity:   'minor',
      message:    'package.json has no "dev" script — local development may be inconvenient',
      file:       'package.json',
      suggestion: 'Add "dev": "nodemon server.js" or equivalent development server script',
    });
  }

  // Check for empty/whitespace-only script values
  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      issues.push({
        id:         `empty_script:${name}`,
        severity:   'medium',
        message:    `package.json script "${name}" is empty or not a string`,
        file:       'package.json',
        suggestion: `Provide a valid command for the "${name}" script`,
      });
    }
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

module.exports = { validateScripts };
