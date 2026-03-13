const path                 = require('path');
const fse                  = require('fs-extra');
const { startEdit }        = require('../services/editService');
const { getProject }       = require('../storage/projectStore');
const { getActiveJobCount } = require('../services/generationService');
const { GENERATED_PROJECTS_DIR } = require('../generators/projectGenerator');
const limits               = require('../config/limits');
const logger               = require('../utils/logger');

async function handleEdit(req, res) {
  const { slug } = req.params;
  const { prompt, mode = 'balanced' } = req.body;

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  if (!['fast', 'balanced', 'quality'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Use fast, balanced, or quality.' });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid project slug' });
  }

  // Verify the project exists — check metadata OR files on disk (metadata can be missing after a server issue)
  const project = await getProject(slug);
  if (!project) {
    const projectDir = path.join(GENERATED_PROJECTS_DIR, slug);
    const hasFiles = await fse.pathExists(projectDir);
    if (!hasFiles) {
      return res.status(404).json({ error: `Project "${slug}" not found`, expired: true });
    }
    // Files exist on disk but metadata is missing — edit service handles this gracefully
    logger.warn(`editController: metadata missing for "${slug}" but files found on disk — proceeding`);
  }

  // Concurrency guard (shared with generation)
  if (getActiveJobCount() >= (limits.MAX_CONCURRENT_JOBS || 1)) {
    return res.status(429).json({
      error: 'A generation is already in progress. Please wait for it to complete or cancel it.',
    });
  }

  try {
    logger.info(`editController: starting edit for "${slug}" — "${prompt.trim().slice(0, 60)}"`);
    const userId = req.user?.id;
    const jobId = await startEdit(prompt.trim(), slug, mode, { userId });
    return res.status(202).json({ jobId });
  } catch (err) {
    logger.error('editController: failed to start edit', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { handleEdit };
