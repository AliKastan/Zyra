/**
 * downloadController.js
 *
 * Streams the generated mobile game project as a ZIP file.
 * Uses `archiver` to compress the project directory on-the-fly.
 *
 * Route: GET /api/download/:slug
 */

const path     = require('path');
const fs       = require('fs-extra');
const archiver = require('archiver');
const logger   = require('../utils/logger');
const { restoreProjectFiles, getStoredFiles } = require('../storage/projectStore');

const GENERATED_DIR = path.resolve(__dirname, '../../generated-projects');

/**
 * Download the full project as a ZIP archive.
 * Streams the ZIP directly to the HTTP response — no temp file created.
 */
async function downloadProject(req, res) {
  const { slug } = req.params;

  // Validate slug — no path traversal
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid project name' });
  }

  let projectDir = path.resolve(GENERATED_DIR, slug);

  if (!(await fs.pathExists(projectDir))) {
    // Disk files missing — attempt restore from stored backup before failing
    logger.info(`downloadController: ${slug} not on disk — attempting restore from backup`);
    try {
      const restored = await restoreProjectFiles(slug);
      if (!restored) {
        // Restore failed: try streaming ZIP directly from stored file backup
        const storedFiles = await getStoredFiles(slug);
        if (storedFiles && storedFiles.length > 0) {
          logger.info(`downloadController: ${slug} streaming ZIP from stored backup (${storedFiles.length} files)`);
          return streamZipFromMemory(res, slug, storedFiles);
        }
        return res.status(404).json({
          error: 'Project files not found.',
          hint: 'The project may have been deleted or the server was reset. Try regenerating the project.',
        });
      }
      logger.info(`downloadController: ${slug} restored from backup, proceeding with download`);
    } catch (restoreErr) {
      logger.warn(`downloadController: restore failed for ${slug}: ${restoreErr.message}`);
      return res.status(404).json({ error: 'Project files not found. Try regenerating the project.' });
    }
  }

  const zipFileName = `${slug}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
  res.setHeader('X-Project-Slug', slug);

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('error', (err) => {
    logger.error(`downloadController: archive error for ${slug}`, { error: err.message });
    // If headers not sent yet, send error JSON; otherwise just end the stream
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create archive: ' + err.message });
    } else {
      res.end();
    }
  });

  archive.on('finish', () => {
    logger.info(`downloadController: served ${slug}.zip (${archive.pointer()} bytes)`);
  });

  // Pipe archive data directly to response
  archive.pipe(res);

  // Add entire project directory into the zip (preserves subdirectory structure)
  archive.directory(projectDir, slug);

  archive.finalize();
}

/**
 * Streams a ZIP file built in-memory from an array of file objects.
 * Used when disk files are gone but the stored backup is available.
 */
function streamZipFromMemory(res, slug, files) {
  const zipFileName = `${slug}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
  res.setHeader('X-Project-Slug', slug);

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('error', (err) => {
    logger.error(`downloadController: in-memory archive error for ${slug}`, { error: err.message });
    if (!res.headersSent) res.status(500).json({ error: 'Failed to create archive: ' + err.message });
    else res.end();
  });

  archive.on('finish', () => {
    logger.info(`downloadController: served ${slug}.zip from memory (${archive.pointer()} bytes)`);
  });

  archive.pipe(res);

  for (const file of files) {
    if (file.path && typeof file.content === 'string') {
      archive.append(file.content, { name: `${slug}/${file.path}` });
    }
  }

  archive.finalize();
}

module.exports = { downloadProject };
