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

  const projectDir = path.resolve(GENERATED_DIR, slug);

  if (!(await fs.pathExists(projectDir))) {
    return res.status(404).json({ error: 'Project not found. Try regenerating or opening the preview first.' });
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

module.exports = { downloadProject };
