#!/usr/bin/env node
'use strict';

/**
 * scripts/self-heal.js — CLI entry point for the self-healing deploy analyzer.
 *
 * Usage:
 *   npm run self-heal                          # reads from stdin
 *   npm run self-heal -- --file deploy.log     # reads from file
 *   npm run self-heal -- --text "error text"   # reads from CLI argument
 *   npm run self-heal -- --dry-run             # analyze but do not write files
 *   npm run self-heal -- --verbose             # extra debug output
 *   npm run self-heal -- --exit-code 1         # combine with exit code info
 *
 *   cat railway.log | npm run self-heal
 *
 * Exit codes:
 *   0 — fixed (auto-fix applied, no manual review needed)
 *   1 — review required (proposals generated, or low confidence)
 *   2 — error in the self-heal script itself
 */

const path = require('path');

// ── Argument parsing (no external deps) ────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name)       { return args.includes(name); }
function getArg(name)        {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

const opts = {
  logFile:     getArg('--file'),
  logText:     getArg('--text'),
  dryRun:      getFlag('--dry-run'),
  verbose:     getFlag('--verbose') || getFlag('-v'),
  exitCode:    getArg('--exit-code') != null ? parseInt(getArg('--exit-code'), 10) : undefined,
  source:      getArg('--source') || 'file',
  projectRoot: getArg('--root') || path.resolve(__dirname, '..'),
};

if (getFlag('--help') || getFlag('-h')) {
  console.log(`
  Zyra Self-Heal CLI — deployment failure analyzer

  Usage:
    npm run self-heal                         # pipe stdin
    npm run self-heal -- --file <path>        # read log file
    npm run self-heal -- --text "<log text>"  # pass inline
    npm run self-heal -- --dry-run            # analyze only, no file writes
    npm run self-heal -- --verbose            # debug output
    npm run self-heal -- --exit-code <n>      # supply process exit code
    npm run self-heal -- --source <label>     # build | runtime | healthcheck
    npm run self-heal -- --root <dir>         # project root (default: ../)

  Exit codes:
    0  Fixed — auto-fix was applied, no manual review needed
    1  Review required — proposals generated or fix not applicable
    2  Script error
  `);
  process.exit(0);
}

// ── Run pipeline ────────────────────────────────────────────────────────────

const { runSelfHeal } = require('../src/debugger/index');

async function main() {
  const startMs = Date.now();

  let report;
  try {
    report = await runSelfHeal(opts);
  } catch (err) {
    console.error('\n[self-heal] Fatal error running the analyzer:');
    console.error(err.message);
    if (opts.verbose) console.error(err.stack);
    process.exit(2);
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  // ── Print human-readable report to stdout ──────────────────────────────
  console.log('\n' + '─'.repeat(70));
  console.log(report.markdownReport);
  console.log('─'.repeat(70));

  // ── JSON summary to stderr (parseable by CI systems) ───────────────────
  const summary = {
    status:               report.status,
    category:             report.category,
    confidence:           report.confidence,
    safeAutoFixApplied:   report.safeAutoFixApplied,
    changesMade:          report.changesMade.length,
    manualReviewRequired: report.manualReviewRequired,
    proposalCount:        report.proposals.length,
    reportId:             report.reportId,
    elapsedSeconds:       parseFloat(elapsed),
  };

  console.error('\n[self-heal] Summary JSON:');
  console.error(JSON.stringify(summary, null, 2));

  // ── Console banner ─────────────────────────────────────────────────────
  const icons = { fixed: '✅', partial: '⚠️', review_required: '🔍', failed: '❌', unknown: '❓' };
  const icon  = icons[report.status] || '❓';
  console.error(`\n${icon} Status: ${report.status.toUpperCase()} (${elapsed}s)`);

  if (report.safeAutoFixApplied && report.changesMade.length > 0) {
    console.error(`   Applied ${report.changesMade.length} auto-fix(es):`);
    for (const c of report.changesMade) {
      console.error(`   • ${c.path} — ${c.description}`);
    }
  }

  if (report.manualReviewRequired) {
    console.error(`\n   ${report.proposals.length} proposal(s) require manual review.`);
    console.error(`   Report saved to: storage/debug-reports/${report.reportId}.json`);
  }

  if (report.nextActions.length > 0) {
    console.error('\n   Next actions:');
    for (let i = 0; i < Math.min(report.nextActions.length, 5); i++) {
      console.error(`   ${i + 1}. ${report.nextActions[i]}`);
    }
  }

  // ── Exit code ──────────────────────────────────────────────────────────
  process.exit(report.status === 'fixed' ? 0 : 1);
}

main().catch((err) => {
  console.error('[self-heal] Unhandled error:', err);
  process.exit(2);
});
