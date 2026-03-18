require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

// Captured synchronously at process start — before any async work or job creation.
// Used by stale recovery to exclude jobs created in this process.
const SERVER_START_TIME = new Date().toISOString();

const { env, validateEnv } = require('../config/env');
const { recoverStaleJobs } = require('../storage/jobStore');
const previewService = require('../services/previewService');
const { startBackfill } = require('../startup/backfillProjectFiles');
const logger = require('../utils/logger');
const app = require('./app');

// ── Startup ───────────────────────────────────────────────────────────────────
const warnings = validateEnv();
if (warnings.length > 0) {
  warnings.forEach((w) => logger.warn(`Config: ${w}`));
}

const server = app.listen(env.PORT, '0.0.0.0', async () => {
  logger.success(`Zyra server started on http://localhost:${env.PORT}`);
  logger.info(`Dashboard: http://localhost:${env.PORT}`);
  logger.info(`Health:    http://localhost:${env.PORT}/api/health`);
  logger.info(`Routing:   planner=${env.DEFAULT_PLANNER_MODEL}, coder=${env.DEFAULT_CODER_MODEL}, reviewer=${env.DEFAULT_REVIEW_MODEL}`);

  // Backfill stored-file backups for any project that doesn't have one yet.
  startBackfill();

  // Recover any jobs that were left in an active state from a previous run.
  // These are orphaned — the process that owned them is gone.
  try {
    const recovered = await recoverStaleJobs(SERVER_START_TIME);
    if (recovered > 0) {
      logger.warn(`Startup: recovered ${recovered} stale job(s) — marked as timed_out`);
    }
  } catch (err) {
    logger.error('Startup: stale job recovery failed', { error: err.message });
  }
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  previewService.stopAll();
  server.close(() => { logger.info('Server closed'); process.exit(0); });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  previewService.stopAll();
  server.close(() => { logger.info('Server closed'); process.exit(0); });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});
