const { startEdit }        = require('../services/editService');
const { getProject }       = require('../storage/projectStore');
const { getActiveJobCount } = require('../services/generationService');
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

  // Verify the project exists
  const project = await getProject(slug);
  if (!project) {
    return res.status(404).json({ error: `Project "${slug}" not found` });
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
