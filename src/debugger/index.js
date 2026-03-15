'use strict';

/**
 * @fileoverview Main orchestrator for the self-healing deploy analyzer.
 *
 * Pipeline:
 *   ingestLogs()             — parse raw log text/file/stdin
 *   getPrimaryFailure()      — classify into a failure category
 *   analyzeRootCause()       — produce human-readable explanation
 *   runAutoFix()             — apply safe fixes, generate proposals
 *   buildReport()            — assemble structured JSON + markdown report
 *   saveReport()             — persist to storage/debug-reports/
 *
 * This is the single public entry point consumed by both the CLI (scripts/self-heal.js)
 * and the HTTP controller (src/controllers/selfHealController.js).
 */

const { ingestLogs }                      = require('./log-parser');
const { getPrimaryFailure, failureFromExitCode } = require('./failure-classifier');
const { analyzeRootCause }                = require('./root-cause');
const { runAutoFix }                      = require('./auto-fix');
const { buildReport, saveReport }         = require('./report');

/** @typedef {import('./types').SelfHealOptions} SelfHealOptions */
/** @typedef {import('./types').DebugReport}     DebugReport     */

// ---------------------------------------------------------------------------
// Deploy hardening checks
// ---------------------------------------------------------------------------

/**
 * Run a suite of static deployment checks regardless of failure category.
 * These are always safe to run and produce proposals only.
 *
 * Returns a list of warning strings to append to nextActions.
 *
 * @param {string} projectRoot
 * @returns {string[]}
 */
function runDeployHardeningChecks(projectRoot) {
  const warnings = [];
  const path = require('path');
  const fs   = require('fs');

  // 1. Verify package.json exists
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    warnings.push('WARNING: package.json not found at project root. Railway cannot install dependencies.');
    return warnings;
  }

  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); }
  catch (_) { warnings.push('WARNING: package.json is not valid JSON.'); return warnings; }

  // 2. Check "start" script
  if (!pkg.scripts?.start) {
    warnings.push('package.json is missing a "start" script. Railway will not know how to launch the server.');
  }

  // 3. Check NODE_ENV compatibility — engines field
  if (!pkg.engines?.node) {
    warnings.push('package.json is missing an "engines.node" field. Specify the Node.js version to avoid runtime mismatches on Railway.');
  }

  // 4. Check for localhost bindings in common entry files
  const entryFiles = [
    'src/server/index.js', 'src/server/app.js', 'index.js', 'server.js',
  ];
  for (const rel of entryFiles) {
    const abs = path.join(projectRoot, rel);
    const src = (() => { try { return fs.readFileSync(abs, 'utf8'); } catch (_) { return null; } })();
    if (!src) continue;
    if (/\.listen\s*\(\s*\d{3,5}\s*\)/.test(src) && !src.includes('process.env.PORT')) {
      warnings.push(`${rel}: server listens on a hardcoded port without using process.env.PORT.`);
    }
    if (/['"]localhost['"]/.test(src) && src.includes('listen')) {
      warnings.push(`${rel}: server may be binding to localhost only — use 0.0.0.0 for Railway.`);
    }
  }

  // 5. Check railway.toml exists
  if (!fs.existsSync(path.join(projectRoot, 'railway.toml'))) {
    warnings.push('railway.toml not found. Consider adding it to pin the start command and health check path.');
  }

  // 6. Check .env.example exists
  if (!fs.existsSync(path.join(projectRoot, '.env.example'))) {
    warnings.push('.env.example not found. Add one so future developers know which variables are required.');
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the full self-healing pipeline.
 *
 * @param {SelfHealOptions} opts
 * @returns {Promise<DebugReport>}
 */
async function runSelfHeal(opts = {}) {
  const {
    logFile,
    logText,
    projectRoot = process.cwd(),
    exitCode,
    dryRun    = false,
    verbose   = false,
    source    = 'unknown',
  } = opts;

  const log = verbose ? (...a) => console.error('[self-heal]', ...a) : () => {};

  // ── Step 1: Ingest logs ──────────────────────────────────────────────────
  log('Ingesting logs...');
  const useStdin = !logFile && !logText;
  const lines    = await ingestLogs({ logFile, logText, stdin: useStdin, source });
  log(`Parsed ${lines.length} log lines.`);

  // ── Step 2: Classify failure ─────────────────────────────────────────────
  log('Classifying failure...');
  let failure;
  if (lines.length > 0) {
    failure = getPrimaryFailure(lines);
  } else if (exitCode !== undefined && exitCode !== 0) {
    failure = failureFromExitCode(exitCode);
    log(`No log lines — using exit code ${exitCode} for classification.`);
  } else {
    // No logs, no non-zero exit code — nothing to analyze
    failure = {
      category:      'UNKNOWN_FAILURE',
      confidence:    0.10,
      matchedLines:  [],
      captureGroups: [],
      ruleName:      'NO_INPUT',
    };
  }
  log(`Classified: ${failure.category} (${Math.round(failure.confidence * 100)}%)`);

  // ── Step 3: Analyze root cause ───────────────────────────────────────────
  log('Analyzing root cause...');
  const rootCause = analyzeRootCause(failure, lines);

  // ── Step 4: Deploy hardening warnings ────────────────────────────────────
  log('Running deploy hardening checks...');
  const hardeningWarnings = runDeployHardeningChecks(projectRoot);
  if (hardeningWarnings.length > 0) {
    log('Hardening warnings:', hardeningWarnings);
  }

  // ── Step 5: Auto-fix ─────────────────────────────────────────────────────
  log(`Running auto-fix (dryRun=${dryRun})...`);
  const fixResult = runAutoFix(rootCause, projectRoot, dryRun);
  log(`Applied ${fixResult.changesMade.length} change(s), ${fixResult.pendingProposals.length} proposal(s).`);

  // ── Step 6: Build report ─────────────────────────────────────────────────
  const report = buildReport(rootCause, fixResult, { source, exitCode });

  // Append hardening warnings to nextActions
  if (hardeningWarnings.length > 0) {
    report.nextActions = [...report.nextActions, ...hardeningWarnings];
  }

  // ── Step 7: Persist report ───────────────────────────────────────────────
  if (!dryRun) {
    saveReport(report);
    log(`Report saved: ${report.reportId}`);
  }

  return report;
}

module.exports = { runSelfHeal };
