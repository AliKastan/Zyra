/**
 * debugController.js — HTTP handlers for the Fix My App debug feature.
 */

const { startDebug, applyDebugFix, rollbackDebugFix } = require('../services/debugService');
const { getProject } = require('../storage/projectStore');
const logger = require('../utils/logger');

/**
 * POST /api/debug/:slug
 * Body: { consoleErrors: [], previewState: 'blank'|'loaded'|'error', userDescription: '' }
 * Returns: 202 { jobId }
 */
async function handleStartDebug(req, res) {
  const { slug } = req.params;

  if (!slug || typeof slug !== 'string' || !slug.trim()) {
    return res.status(400).json({ error: 'Project slug is required' });
  }

  const {
    consoleErrors    = [],
    previewState     = 'unknown',
    userDescription  = null,
    previewUrl       = null,
  } = req.body || {};

  const signals = {
    consoleErrors:   Array.isArray(consoleErrors) ? consoleErrors.slice(0, 20) : [],
    previewState:    String(previewState || 'unknown').slice(0, 50),
    userDescription: userDescription ? String(userDescription).slice(0, 1000) : null,
    previewUrl:      previewUrl ? String(previewUrl).slice(0, 500) : null,
  };

  const mode = String(req.body?.mode || 'balanced');

  logger.info(`debugController: start debug for "${slug}" previewState="${signals.previewState}" errors=${signals.consoleErrors.length}`);

  try {
    const jobId = await startDebug(slug, signals, mode);
    return res.status(202).json({ jobId });
  } catch (err) {
    logger.error('debugController: failed to start debug', { error: err.message, slug });
    return res.status(500).json({ error: err.message || 'Failed to start debug analysis' });
  }
}

/**
 * POST /api/debug/:slug/apply
 * Body: { patch: [{ path, content }] }
 * Returns: { written, failed, backup }
 */
async function handleApplyFix(req, res) {
  const { slug } = req.params;
  const { patch } = req.body || {};

  if (!slug || typeof slug !== 'string' || !slug.trim()) {
    return res.status(400).json({ error: 'Project slug is required' });
  }

  if (!Array.isArray(patch) || patch.length === 0) {
    return res.status(400).json({ error: 'Patch array is required and must not be empty' });
  }

  // Validate patch shape
  for (const entry of patch) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.content !== 'string') {
      return res.status(400).json({ error: 'Each patch entry must have string "path" and "content" fields' });
    }
  }

  logger.info(`debugController: apply fix for "${slug}" — ${patch.length} file(s)`);

  try {
    const result = await applyDebugFix(slug, patch);
    return res.json(result);
  } catch (err) {
    logger.error('debugController: failed to apply fix', { error: err.message, slug });
    return res.status(500).json({ error: err.message || 'Failed to apply fix' });
  }
}

/**
 * POST /api/debug/:slug/rollback
 * Body: { backup: [{ path, original }] }
 * Returns: { written, failed }
 */
async function handleRollback(req, res) {
  const { slug } = req.params;
  const { backup } = req.body || {};

  if (!slug || typeof slug !== 'string' || !slug.trim()) {
    return res.status(400).json({ error: 'Project slug is required' });
  }

  if (!Array.isArray(backup) || backup.length === 0) {
    return res.status(400).json({ error: 'Backup array is required and must not be empty' });
  }

  logger.info(`debugController: rollback for "${slug}" — ${backup.length} file(s)`);

  try {
    const result = await rollbackDebugFix(slug, backup);
    return res.json(result);
  } catch (err) {
    logger.error('debugController: failed to rollback', { error: err.message, slug });
    return res.status(500).json({ error: err.message || 'Failed to rollback' });
  }
}

module.exports = { handleStartDebug, handleApplyFix, handleRollback };
