const deploymentService = require('../services/deploymentService');
const logger = require('../utils/logger');

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * POST /api/deploy/:slug
 * Starts a deployment for the given project. Returns 202 with the deployment
 * record. Client should poll GET /api/deploy/:slug/status for updates.
 */
async function startDeploy(req, res) {
  try {
    const { slug } = req.params;

    if (!slug || !SLUG_RE.test(slug)) {
      return res.status(400).json({ error: 'Invalid project slug.' });
    }

    const userId = req.user?.id || 'anonymous';
    const deployment = await deploymentService.startDeployment(slug, userId);

    logger.info(`[deployController] Deploy started: ${deployment.id} (${slug}) by ${userId}`);
    res.status(202).json({ deployment });

  } catch (err) {
    logger.warn(`[deployController] startDeploy error: ${err.message}`);

    const statusCode =
      err.code === 'DEPLOY_IN_PROGRESS' ? 409 :
      err.code === 'PROJECT_NOT_FOUND'   ? 404 :
      err.code === 'VALIDATION_FAILED'   ? 422 : 400;

    res.status(statusCode).json({
      error: err.message,
      ...(err.validationErrors ? { validationErrors: err.validationErrors } : {}),
    });
  }
}

/**
 * GET /api/deploy/:slug/status
 * Returns the most recent deployment record for the given project slug.
 */
async function getDeployStatus(req, res) {
  try {
    const { slug } = req.params;
    const deployment = await deploymentService.getLatestDeployment(slug);

    if (!deployment) {
      return res.status(404).json({ error: 'No deployments found for this project.' });
    }

    res.json({ deployment });
  } catch (err) {
    logger.error(`[deployController] getDeployStatus error: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch deployment status.' });
  }
}

/**
 * GET /api/deploy/:slug/history
 * Returns all deployment records for the given project slug, newest first.
 */
async function getDeployHistory(req, res) {
  try {
    const { slug } = req.params;
    const deployments = await deploymentService.listDeployments(slug);
    res.json({ deployments });
  } catch (err) {
    logger.error(`[deployController] getDeployHistory error: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch deployment history.' });
  }
}

module.exports = { startDeploy, getDeployStatus, getDeployHistory };
