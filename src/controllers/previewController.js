const path = require('path');
const fs = require('fs-extra');
const previewService = require('../services/previewService');
const { restoreProjectFiles, hasStoredFiles, getStoredFiles } = require('../storage/projectStore');
const logger = require('../utils/logger');

const ROOT = path.join(__dirname, '../../');
const GENERATED_DIR = path.join(ROOT, 'generated-projects');

async function startPreview(req, res) {
  const { slug } = req.params;
  try {
    const preview = await previewService.startPreview(slug);
    res.json({ success: true, preview });
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      // Project directory is missing — attempt restore from persistent file storage
      try {
        const canRestore = await hasStoredFiles(slug);
        if (canRestore) {
          logger.info(`[preview] ${slug}: directory missing, attempting restore from file store`);
          const restored = await restoreProjectFiles(slug);
          if (restored) {
            logger.info(`[preview] ${slug}: restore succeeded, starting preview`);
            const preview = await previewService.startPreview(slug);
            return res.json({ success: true, preview, _restored: true });
          }
        }
      } catch (restoreErr) {
        logger.warn(`[preview] ${slug}: restore attempt failed: ${restoreErr.message}`);
      }
      return res.status(404).json({ error: 'Project files not found', expired: true });
    }
    res.status(500).json({ error: err.message });
  }
}

function getPreviewStatus(req, res) {
  const { slug } = req.params;
  const preview = previewService.getPreview(slug);
  if (!preview) return res.status(404).json({ error: 'No preview found', slug });
  res.json(preview);
}

function stopPreview(req, res) {
  const { slug } = req.params;
  previewService.stopPreview(slug);
  res.json({ success: true });
}

function listPreviews(_req, res) {
  res.json(previewService.listPreviews());
}

async function getFileContent(req, res) {
  try {
    const { slug } = req.params;
    const filePath = req.params[0];

    if (!filePath) return res.status(400).json({ error: 'Missing file path' });

    // Prevent path traversal
    const projectDir = path.resolve(GENERATED_DIR, slug);
    const fullPath = path.resolve(projectDir, filePath);
    if (!fullPath.startsWith(projectDir + path.sep) && fullPath !== projectDir) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!(await fs.pathExists(fullPath))) {
      // Disk file missing — try restoring project from backup
      const restored = await restoreProjectFiles(slug).catch(() => false);
      if (!restored || !(await fs.pathExists(fullPath))) {
        // If restore failed, try serving from stored backup directly
        const storedFiles = await getStoredFiles(slug);
        if (storedFiles) {
          const stored = storedFiles.find(f => f.path === filePath);
          if (stored) return res.json({ content: stored.content, path: filePath, _fromBackup: true });
        }
        return res.status(404).json({ error: 'File not found' });
      }
    }

    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) return res.status(400).json({ error: 'Path is a directory' });
    if (stat.size > 500_000) return res.status(413).json({ error: 'File too large to display' });

    const content = await fs.readFile(fullPath, 'utf8');
    res.json({ content, path: filePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { startPreview, getPreviewStatus, stopPreview, listPreviews, getFileContent };

