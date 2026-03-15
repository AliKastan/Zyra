'use strict';

/**
 * SCRIPT REPAIR
 *
 * Adds missing npm scripts to package.json.
 * Detects the correct entry point from generated files.
 *
 * Safe: only adds missing scripts, never overrides existing ones.
 *
 * @param {import('./types').RepairContext} ctx
 * @returns {import('./types').RepairIssueResult[]}
 */
function repairScripts(ctx) {
  const { fileMap, filePaths, issues, decisions } = ctx;
  /** @type {import('./types').RepairIssueResult[]} */
  const results = [];

  if (!filePaths.has('package.json')) return results;

  const scriptIssues = issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair && (
      i.id === 'missing_start_script' ||
      i.id === 'missing_dev_script' ||
      i.id === 'no_scripts' ||
      i.id.startsWith('empty_script:')
    );
  });

  if (scriptIssues.length === 0) return results;

  let pkg;
  try {
    pkg = JSON.parse(fileMap.get('package.json'));
  } catch {
    return results;
  }

  if (!pkg.scripts) pkg.scripts = {};

  // Detect entry point
  const entryPoint = _detectEntryPoint(filePaths);
  let changed = false;

  for (const issue of scriptIssues) {
    if (issue.id === 'no_scripts' || issue.id === 'missing_start_script') {
      if (!pkg.scripts.start) {
        pkg.scripts.start = `node ${entryPoint}`;
        changed = true;
        results.push({
          issueId:    issue.id,
          action:     'added_script',
          path:       'package.json',
          reason:     `Added "start": "node ${entryPoint}" to package.json scripts`,
          safety:     'safe_auto_repair',
          confidence: 0.88,
        });
      }
    }

    if (issue.id === 'missing_dev_script') {
      if (!pkg.scripts.dev && !pkg.scripts.develop) {
        // Use nodemon if available (it's a common devDependency)
        const useNodemon = pkg.devDependencies?.nodemon || pkg.dependencies?.nodemon;
        pkg.scripts.dev = useNodemon ? `nodemon ${entryPoint}` : `node ${entryPoint}`;
        changed = true;
        results.push({
          issueId:    issue.id,
          action:     'added_script',
          path:       'package.json',
          reason:     `Added "dev": "${pkg.scripts.dev}" to package.json scripts`,
          safety:     'safe_auto_repair',
          confidence: 0.85,
        });
      }
    }

    if (issue.id.startsWith('empty_script:')) {
      const scriptName = issue.id.slice('empty_script:'.length);
      // Only fix if we have a sensible value
      const fixedValue = _knownScriptValue(scriptName, entryPoint);
      if (fixedValue && (!pkg.scripts[scriptName] || pkg.scripts[scriptName].trim().length === 0)) {
        pkg.scripts[scriptName] = fixedValue;
        changed = true;
        results.push({
          issueId:    issue.id,
          action:     'added_script',
          path:       'package.json',
          reason:     `Fixed empty "${scriptName}" script: "${fixedValue}"`,
          safety:     'safe_auto_repair',
          confidence: 0.80,
        });
      }
    }
  }

  if (changed) {
    fileMap.set('package.json', JSON.stringify(pkg, null, 2));
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Detect the main entry point from generated files.
 * @param {Set<string>} filePaths
 * @returns {string}
 */
function _detectEntryPoint(filePaths) {
  const candidates = ['server.js', 'app.js', 'index.js', 'src/server.js', 'src/app.js', 'src/index.js'];
  for (const c of candidates) {
    if (filePaths.has(c)) return c;
  }
  // Last resort: find any .js file at root level
  for (const p of filePaths) {
    if (!p.includes('/') && p.endsWith('.js')) return p;
  }
  return 'server.js';
}

function _knownScriptValue(scriptName, entryPoint) {
  switch (scriptName) {
    case 'start':  return `node ${entryPoint}`;
    case 'dev':    return `nodemon ${entryPoint}`;
    case 'build':  return 'echo "No build step required"';
    case 'test':   return 'node --experimental-vm-modules jest';
    default:       return null;
  }
}

module.exports = { repairScripts };
