/**
 * backfillProjectFiles.js
 *
 * Startup task: for every project that has metadata but is missing a
 * stored-file backup, reads the disk files and creates the backup.
 *
 * Runs once at server start, non-blocking, best-effort.
 * Prevents the "No saved snapshot" problem for pre-existing projects.
 */

const { listProjects, hasStoredFiles, backfillProjectFiles } = require('../storage/projectStore');
const logger = require('../utils/logger');

async function runBackfill() {
  let checked = 0;
  let backed = 0;
  let skipped = 0;

  try {
    const projects = await listProjects();

    for (const p of projects) {
      const slug = p.slug;
      if (!slug) continue;
      checked++;

      const alreadyBacked = await hasStoredFiles(slug).catch(() => false);
      if (alreadyBacked) { skipped++; continue; }

      const ok = await backfillProjectFiles(slug);
      if (ok) {
        backed++;
        logger.debug(`[backfill] ${slug}: backup created`);
      }
    }

    if (backed > 0 || checked > 0) {
      logger.info(`[backfill] project-files: ${checked} checked, ${backed} backed up, ${skipped} already had backups`);
    }
  } catch (err) {
    logger.warn(`[backfill] project-files failed (non-fatal): ${err.message}`);
  }
}

/**
 * Starts the backfill asynchronously — does not block server startup.
 */
function startBackfill() {
  // Small delay so server is fully started before we do disk I/O
  setTimeout(() => {
    runBackfill().catch((err) =>
      logger.warn(`[backfill] unhandled error: ${err.message}`)
    );
  }, 3000);
}

module.exports = { startBackfill };
