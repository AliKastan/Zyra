/**
 * debugController.js — HTTP handlers for the Fix My App debug system.
 *
 * Endpoints:
 *  POST   /:slug              Start standard debug (Fix My App)
 *  GET    /:slug/session/:id  Poll any debug job
 *  POST   /:slug/apply        Apply a patch
 *  POST   /:slug/rollback     Rollback applied patch
 *  POST   /:slug/heal         Start self-healing plan
 *  POST   /:slug/incident     Start production incident analysis
 *  POST   /:slug/visual       Start visual bug analysis
 */

const {
  startDebug,
  startHealPlan,
  startIncidentAnalysis,
  startVisualDebug,
  applyDebugFix,
  rollbackDebugFix,
} = require('../services/debugService');
const { getJob }    = require('../storage/jobStore');
const { getProject } = require('../storage/projectStore');
const logger        = require('../utils/logger');

// ── POST /:slug  (Fix My App — standard) ──────────────────────────────────────

async function handleStartDebug(req, res) {
  const { slug } = req.params;
  if (!slug?.trim()) return res.status(400).json({ error: 'Project slug is required' });

  const {
    consoleErrors    = [],
    previewState     = 'unknown',
    userDescription  = null,
    previewUrl       = null,
    mode             = 'balanced',
  } = req.body || {};

  const signals = {
    consoleErrors:   Array.isArray(consoleErrors) ? consoleErrors.slice(0, 20) : [],
    previewState:    String(previewState || 'unknown').slice(0, 50),
    userDescription: userDescription ? String(userDescription).slice(0, 1000) : null,
    previewUrl:      previewUrl ? String(previewUrl).slice(0, 500) : null,
  };

  logger.info(`debugController: start debug — "${slug}" previewState="${signals.previewState}" errors=${signals.consoleErrors.length}`);

  try {
    const jobId = await startDebug(slug, signals, String(mode));
    return res.status(202).json({ jobId });
  } catch (err) {
    logger.error('debugController: failed to start debug', { error: err.message, slug });
    return res.status(500).json({ error: err.message || 'Failed to start debug analysis' });
  }
}

// ── GET /:slug/session/:jobId  (poll any debug job) ───────────────────────────

async function handleGetDebugSession(req, res) {
  const { slug, jobId } = req.params;
  if (!jobId) return res.status(400).json({ error: 'Job ID required' });

  try {
    const job = await getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Debug session not found' });
    if (job.projectSlug !== slug) return res.status(404).json({ error: 'Debug session not found' });
    return res.json({ job });
  } catch (err) {
    logger.error('debugController: failed to get debug session', { error: err.message, jobId });
    return res.status(500).json({ error: err.message || 'Failed to get debug session' });
  }
}

// ── POST /:slug/apply ─────────────────────────────────────────────────────────

async function handleApplyFix(req, res) {
  const { slug } = req.params;
  const { patch } = req.body || {};

  if (!slug?.trim()) return res.status(400).json({ error: 'Project slug is required' });
  if (!Array.isArray(patch) || patch.length === 0) return res.status(400).json({ error: 'Patch array required' });

  for (const entry of patch) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.content !== 'string') {
      return res.status(400).json({ error: 'Each patch entry must have string "path" and "content"' });
    }
  }

  logger.info(`debugController: apply fix — "${slug}" ${patch.length} file(s)`);

  try {
    const result = await applyDebugFix(slug, patch);
    return res.json(result);
  } catch (err) {
    logger.error('debugController: failed to apply fix', { error: err.message, slug });
    return res.status(500).json({ error: err.message || 'Failed to apply fix' });
  }
}

// ── POST /:slug/rollback ──────────────────────────────────────────────────────

async function handleRollback(req, res) {
  const { slug } = req.params;
  const { backup } = req.body || {};

  if (!slug?.trim()) return res.status(400).json({ error: 'Project slug is required' });
  if (!Array.isArray(backup) || backup.length === 0) return res.status(400).json({ error: 'Backup array required' });

  logger.info(`debugController: rollback — "${slug}" ${backup.length} file(s)`);

  try {
    const result = await rollbackDebugFix(slug, backup);
    return res.json(result);
  } catch (err) {
    logger.error('debugController: failed to rollback', { error: err.message, slug });
    return res.status(500).json({ error: err.message || 'Failed to rollback' });
  }
}

// ── POST /:slug/heal  (self-healing plan) ─────────────────────────────────────

async function handleStartHeal(req, res) {
  const { slug } = req.params;
  if (!slug?.trim()) return res.status(400).json({ error: 'Project slug is required' });

  const {
    consoleErrors   = [],
    previewState    = 'unknown',
    userDescription = null,
    previewUrl      = null,
    mode            = 'balanced',
  } = req.body || {};

  const signals = {
    consoleErrors:   Array.isArray(consoleErrors) ? consoleErrors.slice(0, 20) : [],
    previewState:    String(previewState || 'unknown').slice(0, 50),
    userDescription: userDescription ? String(userDescription).slice(0, 1000) : null,
    previewUrl:      previewUrl ? String(previewUrl).slice(0, 500) : null,
  };

  logger.info(`debugController: start heal — "${slug}"`);

  try {
    const jobId = await startHealPlan(slug, signals, String(mode));
    return res.status(202).json({ jobId });
  } catch (err) {
    logger.error('debugController: failed to start heal', { error: err.message, slug });
    return res.status(500).json({ error: err.message || 'Failed to start self-healing analysis' });
  }
}

// ── POST /:slug/incident  (production incident analysis) ──────────────────────

async function handleStartIncident(req, res) {
  const { slug } = req.params;
  if (!slug?.trim()) return res.status(400).json({ error: 'Project slug is required' });

  const {
    consoleErrors   = [],
    previewState    = 'unknown',
    userDescription = null,
    deployHistory   = [],
  } = req.body || {};

  const signals = {
    consoleErrors:   Array.isArray(consoleErrors) ? consoleErrors.slice(0, 20) : [],
    previewState:    String(previewState || 'unknown').slice(0, 50),
    userDescription: userDescription ? String(userDescription).slice(0, 1000) : null,
  };

  const safeDeployHistory = Array.isArray(deployHistory) ? deployHistory.slice(0, 10) : [];

  logger.info(`debugController: start incident — "${slug}" deploys=${safeDeployHistory.length}`);

  try {
    const jobId = await startIncidentAnalysis(slug, signals, safeDeployHistory);
    return res.status(202).json({ jobId });
  } catch (err) {
    logger.error('debugController: failed to start incident', { error: err.message, slug });
    return res.status(500).json({ error: err.message || 'Failed to start incident analysis' });
  }
}

// ── POST /:slug/visual  (visual bug analysis) ─────────────────────────────────

async function handleStartVisual(req, res) {
  const { slug } = req.params;
  if (!slug?.trim()) return res.status(400).json({ error: 'Project slug is required' });

  const {
    screenshotBase64 = null,
    screenshotUrl    = null,
    userDescription  = null,
    previewState     = 'unknown',
  } = req.body || {};

  // Validate base64 size (max ~2MB)
  if (screenshotBase64 && screenshotBase64.length > 2_800_000) {
    return res.status(400).json({ error: 'Screenshot too large — max 2MB' });
  }

  const signals = {
    consoleErrors:   [],
    previewState:    String(previewState || 'unknown').slice(0, 50),
    userDescription: userDescription ? String(userDescription).slice(0, 1000) : null,
  };

  logger.info(`debugController: start visual — "${slug}" screenshot=${!!(screenshotBase64 || screenshotUrl)}`);

  try {
    const jobId = await startVisualDebug(
      slug,
      signals,
      screenshotBase64 ? String(screenshotBase64) : null,
      screenshotUrl    ? String(screenshotUrl).slice(0, 500) : null
    );
    return res.status(202).json({ jobId });
  } catch (err) {
    logger.error('debugController: failed to start visual', { error: err.message, slug });
    return res.status(500).json({ error: err.message || 'Failed to start visual analysis' });
  }
}

// ── POST /:slug/auto  (automatic fix — analyze + apply in one shot) ─────────

async function handleAutoFix(req, res) {
  const { slug } = req.params;
  if (!slug?.trim()) return res.status(400).json({ error: 'Project slug is required' });

  const {
    consoleErrors   = [],
    previewState    = 'unknown',
    userDescription = null,
    mode            = 'fast',
    trigger         = 'manual',  // 'runtime' | 'preview_fail' | 'post_gen' | 'manual'
  } = req.body || {};

  const signals = {
    consoleErrors:   Array.isArray(consoleErrors) ? consoleErrors.slice(0, 20) : [],
    previewState:    String(previewState || 'unknown').slice(0, 50),
    userDescription: userDescription ? String(userDescription).slice(0, 500) : null,
    trigger,
  };

  logger.info(`debugController: auto-fix — "${slug}" trigger="${trigger}" errors=${signals.consoleErrors.length}`);

  try {
    const jobId = await startDebug(slug, signals, String(mode), { autoApply: true });
    return res.status(202).json({ jobId });
  } catch (err) {
    logger.error('debugController: auto-fix failed to start', { error: err.message, slug });
    return res.status(500).json({ error: err.message || 'Failed to start auto-fix' });
  }
}

module.exports = {
  handleStartDebug,
  handleGetDebugSession,
  handleApplyFix,
  handleRollback,
  handleStartHeal,
  handleStartIncident,
  handleStartVisual,
  handleAutoFix,
};
