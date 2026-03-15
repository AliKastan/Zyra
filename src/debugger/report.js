'use strict';

/**
 * @fileoverview Report generator for the self-healing deploy analyzer.
 *
 * Produces two outputs from the pipeline results:
 *  1. A structured DebugReport JSON object
 *  2. A human-readable Markdown string
 *
 * Also handles persistence: saves reports to storage/debug-reports/{reportId}.json
 * and keeps a pointer at storage/debug-reports/latest.json.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

/** @typedef {import('./types').DebugReport}       DebugReport      */
/** @typedef {import('./types').RootCause}         RootCause        */
/** @typedef {import('./types').AutoFixResult}     AutoFixResult    */
/** @typedef {import('./types').ClassifiedFailure} ClassifiedFailure */

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

/**
 * Derive a top-level status from the analysis results.
 * @param {RootCause}     rootCause
 * @param {AutoFixResult} fixResult
 * @returns {DebugReport['status']}
 */
function deriveStatus(rootCause, fixResult) {
  const hasProposals = fixResult.pendingProposals.length > 0;
  const hasChanges   = fixResult.changesMade.length > 0;

  if (rootCause.category === 'UNKNOWN_FAILURE') return 'unknown';
  if (hasChanges && !hasProposals)              return 'fixed';
  if (hasChanges &&  hasProposals)              return 'partial';
  if (!hasChanges && hasProposals)              return 'review_required';
  if (!rootCause.autoFixEligible)               return 'review_required';
  return 'failed';
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

/** Status → emoji badge */
const STATUS_BADGE = {
  fixed:           '✅ FIXED',
  partial:         '⚠️  PARTIAL FIX',
  review_required: '🔍 REVIEW REQUIRED',
  failed:          '❌ FAILED',
  unknown:         '❓ UNKNOWN',
};

/**
 * Render a DebugReport as clean Markdown.
 * @param {DebugReport} report
 * @returns {string}
 */
function renderMarkdown(report) {
  const lines = [];

  lines.push(`# Self-Heal Deploy Report`);
  lines.push(`**Status:** ${STATUS_BADGE[report.status] || report.status}`);
  lines.push(`**Category:** \`${report.category}\``);
  lines.push(`**Confidence:** ${Math.round(report.confidence * 100)}%`);
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push(`**Report ID:** \`${report.reportId}\``);
  lines.push('');

  // ── Root cause ──────────────────────────────────────────────────────────
  lines.push('## Root Cause');
  lines.push(report.rootCause);
  lines.push('');

  // ── Important log lines ─────────────────────────────────────────────────
  if (report.importantLogLines.length > 0) {
    lines.push('## Key Log Lines');
    lines.push('```');
    for (const l of report.importantLogLines) lines.push(l);
    lines.push('```');
    lines.push('');
  }

  // ── Changes applied ─────────────────────────────────────────────────────
  if (report.changesMade.length > 0) {
    lines.push('## Changes Applied Automatically');
    for (const c of report.changesMade) {
      const icon = c.type === 'create' ? '➕' : c.type === 'delete' ? '➖' : '✏️';
      lines.push(`- ${icon} \`${c.path}\` — ${c.description}`);
    }
    lines.push('');
  }

  // ── Proposals ───────────────────────────────────────────────────────────
  if (report.proposals.length > 0) {
    lines.push('## Proposals Requiring Manual Review');
    for (const p of report.proposals) {
      const riskEmoji = { low: '🟢', medium: '🟡', high: '🔴' }[p.risk] || '⚪';
      lines.push(`### ${riskEmoji} ${p.title}`);
      lines.push(p.explanation);
      if (p.changes.length > 0) {
        lines.push('');
        lines.push('**Proposed changes:**');
        for (const c of p.changes) {
          lines.push(`- \`${c.path}\` — ${c.description}`);
          if (c.after) {
            lines.push('  ```');
            // Show first 400 chars of the proposed after content
            const preview = c.after.slice(0, 400);
            for (const l of preview.split('\n')) lines.push('  ' + l);
            if (c.after.length > 400) lines.push('  ...(truncated)');
            lines.push('  ```');
          }
        }
      }
      lines.push('');
    }
  }

  // ── Next actions ────────────────────────────────────────────────────────
  if (report.nextActions.length > 0) {
    lines.push('## Next Actions');
    for (let i = 0; i < report.nextActions.length; i++) {
      lines.push(`${i + 1}. ${report.nextActions[i]}`);
    }
    lines.push('');
  }

  // ── Manual review flag ──────────────────────────────────────────────────
  if (report.manualReviewRequired) {
    lines.push('---');
    lines.push('> ⚠️  **Manual review required.** One or more proposed fixes could not be');
    lines.push('> applied automatically. Review the proposals above before redeploying.');
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Next-action generator
// ---------------------------------------------------------------------------

/**
 * Build an ordered list of concrete next actions based on the report.
 * @param {RootCause}     rootCause
 * @param {AutoFixResult} fixResult
 * @returns {string[]}
 */
function buildNextActions(rootCause, fixResult) {
  const actions = [];

  if (fixResult.changesMade.length > 0) {
    actions.push('Review the auto-applied changes shown above, then commit and redeploy.');
  }

  if (fixResult.pendingProposals.length > 0) {
    actions.push('Apply the proposed manual fixes listed in the "Proposals" section.');
    actions.push('Commit the applied patches, then redeploy.');
  }

  // Category-specific follow-ups
  switch (rootCause.category) {
    case 'MISSING_ENV':
      actions.push(
        'Set the missing environment variable(s) in Railway → Settings → Variables.',
        'Trigger a new Railway deploy after setting the variable.'
      );
      break;
    case 'PORT_BIND_ERROR':
      actions.push('Verify the server starts locally with: PORT=3001 npm start');
      break;
    case 'DATABASE_CONNECTION_ERROR':
      actions.push('Check the database is running and accessible from Railway.');
      actions.push('Verify DATABASE_URL is correctly formatted (include ?sslmode=require if needed).');
      break;
    case 'MIGRATION_FAILURE':
      actions.push('Run "prisma migrate status" against production DATABASE_URL.');
      actions.push('Never run "prisma migrate reset" in production — it drops all data.');
      break;
    case 'PACKAGE_INSTALL_FAILURE':
      actions.push('Run "npm install" locally, fix conflicts, then commit package-lock.json.');
      break;
    case 'HEALTHCHECK_FAILURE':
      actions.push('Confirm GET /api/health returns HTTP 200 within 5 s.');
      actions.push('Ensure server binds to 0.0.0.0 and uses process.env.PORT.');
      break;
    case 'UNKNOWN_FAILURE':
      actions.push('Increase log verbosity and redeploy to capture more detail.');
      actions.push('Run the app locally with production env vars: NODE_ENV=production npm start');
      break;
  }

  if (actions.length === 0) {
    actions.push('Investigate the log lines above and redeploy after fixing.');
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const REPORTS_DIR = path.resolve(process.cwd(), 'storage', 'debug-reports');

/**
 * Save a report to disk and update the latest pointer.
 * @param {DebugReport} report
 */
function saveReport(report) {
  try {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const filePath   = path.join(REPORTS_DIR, `${report.reportId}.json`);
    const latestPath = path.join(REPORTS_DIR, 'latest.json');
    const json       = JSON.stringify(report, null, 2);
    fs.writeFileSync(filePath, json, 'utf8');
    fs.writeFileSync(latestPath, json, 'utf8');
  } catch (_) {
    // Persistence failure must never crash the CLI/API
  }
}

/**
 * Load the most recent saved report, or null if none exists.
 * @returns {DebugReport|null}
 */
function loadLatestReport() {
  try {
    const latestPath = path.join(REPORTS_DIR, 'latest.json');
    const raw = fs.readFileSync(latestPath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a complete DebugReport from the pipeline results.
 *
 * @param {RootCause}     rootCause
 * @param {AutoFixResult} fixResult
 * @param {Object}        [meta]       - Extra metadata (source, exitCode…)
 * @returns {DebugReport}
 */
function buildReport(rootCause, fixResult, meta = {}) {
  const reportId   = 'sh-' + crypto.randomBytes(5).toString('hex');
  const status     = deriveStatus(rootCause, fixResult);
  const nextActions = buildNextActions(rootCause, fixResult);

  const report = {
    reportId,
    status,
    category:             rootCause.category,
    confidence:           rootCause.confidence,
    rootCause:            rootCause.explanation,
    importantLogLines:    rootCause.importantLogLines,
    safeAutoFixApplied:   fixResult.applied,
    changesMade:          fixResult.changesMade,
    manualReviewRequired: fixResult.pendingProposals.length > 0,
    proposals:            fixResult.pendingProposals,
    nextActions,
    generatedAt:          new Date().toISOString(),
    markdownReport:       '',   // filled below
    // Optional metadata
    ...(meta.source   ? { source:   meta.source }   : {}),
    ...(meta.exitCode !== undefined ? { exitCode: meta.exitCode } : {}),
  };

  report.markdownReport = renderMarkdown(report);

  return report;
}

module.exports = { buildReport, saveReport, loadLatestReport, renderMarkdown };
