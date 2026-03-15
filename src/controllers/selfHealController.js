'use strict';

/**
 * HTTP controller for the self-heal deploy analyzer API.
 *
 * POST /api/self-heal        — run a full analysis pass
 * GET  /api/self-heal/report — return the latest saved report
 *
 * Both endpoints are admin-only (require auth middleware in the router).
 */

const { runSelfHeal }    = require('../debugger/index');
const { loadLatestReport } = require('../debugger/report');
const logger             = require('../utils/logger');

// ---------------------------------------------------------------------------
// POST /api/self-heal
// ---------------------------------------------------------------------------

/**
 * Trigger a self-heal analysis.
 *
 * Body (all optional):
 *   logText   {string}  — raw log content
 *   exitCode  {number}  — process exit code
 *   source    {string}  — 'build' | 'runtime' | 'healthcheck'
 *   dryRun    {boolean} — analyse but do not write files (default: false)
 */
async function handleRunSelfHeal(req, res) {
  const { logText, exitCode, source = 'api', dryRun = false } = req.body || {};

  if (!logText && exitCode === undefined) {
    return res.status(400).json({
      error: 'Provide at least one of: logText, exitCode',
    });
  }

  // Reject suspiciously large payloads (logs should not be > 2 MB)
  if (logText && logText.length > 2_000_000) {
    return res.status(413).json({ error: 'logText too large (max 2 MB)' });
  }

  logger.info('selfHeal: starting analysis', { source, dryRun, logLength: logText?.length });

  try {
    const report = await runSelfHeal({
      logText,
      exitCode,
      source,
      dryRun:      Boolean(dryRun),
      projectRoot: process.cwd(),
    });

    logger.info('selfHeal: analysis complete', {
      reportId: report.reportId,
      status:   report.status,
      category: report.category,
    });

    return res.json(report);
  } catch (err) {
    logger.error('selfHeal: analysis failed', { error: err.message });
    return res.status(500).json({ error: 'Self-heal analysis failed', detail: err.message });
  }
}

// ---------------------------------------------------------------------------
// GET /api/self-heal/report
// ---------------------------------------------------------------------------

/**
 * Return the most recent saved debug report, or 404 if none exists.
 */
function handleGetLatestReport(req, res) {
  const report = loadLatestReport();
  if (!report) {
    return res.status(404).json({ error: 'No debug report found. Run a self-heal analysis first.' });
  }
  return res.json(report);
}

module.exports = { handleRunSelfHeal, handleGetLatestReport };
