/**
 * Deployment Service
 *
 * Orchestrates the full deployment pipeline:
 *   1. Validate the project
 *   2. Create a deployment record
 *   3. Run the deployment asynchronously via the configured provider
 *   4. Poll for completion and update the record
 *
 * The HTTP response returns immediately with the deployment record.
 * Clients should poll GET /api/deploy/:slug/status for updates.
 */

const logger = require('../utils/logger');
const deploymentStore = require('../storage/deploymentStore');
const { validateProjectForDeploy } = require('../utils/projectValidator');
const vercelProvider = require('../providers/vercelProvider');
const { getProject } = require('../storage/projectStore');

// In-memory guard: prevent concurrent deployments for the same project slug
const activeDeployments = new Set();
let chargeUsage;
try { chargeUsage = require('../billing/meter').chargeUsage; } catch (_) { chargeUsage = null; }

const POLL_INTERVAL_MS = 5_000;  // 5 s between status checks
const POLL_MAX_ATTEMPTS = 72;    // 72 × 5s = 6 min max wait

/**
 * Starts a deployment for the given project slug.
 *
 * Validates synchronously, creates the deployment record, then kicks off
 * the async pipeline. Returns the deployment record immediately.
 *
 * Throws on validation failure or if a deploy is already running.
 */
async function startDeployment(slug, userId) {
  if (activeDeployments.has(slug)) {
    throw Object.assign(
      new Error('A deployment is already in progress for this project. Please wait.'),
      { code: 'DEPLOY_IN_PROGRESS' }
    );
  }

  // Verify the project exists in our store
  const project = await getProject(slug);
  if (!project) {
    throw Object.assign(
      new Error('Project not found. Generate the project first, then deploy.'),
      { code: 'PROJECT_NOT_FOUND' }
    );
  }

  // Validate files on disk
  const validation = await validateProjectForDeploy(slug);
  if (!validation.valid) {
    throw Object.assign(
      new Error(validation.errors[0]),
      { code: 'VALIDATION_FAILED', validationErrors: validation.errors }
    );
  }

  // Persist the deployment record in "queued" state
  const record = await deploymentStore.createDeployment({ slug, userId, provider: 'vercel' });

  activeDeployments.add(slug);

  // Fire-and-forget: run the deployment pipeline in the background
  runDeploymentPipeline(record.id, slug, validation.projectDir, userId).catch(err => {
    logger.error(`[deploy] Unhandled error in pipeline for ${slug}: ${err.message}`);
  });

  return record;
}

/**
 * Background pipeline: deploys to Vercel and polls until terminal state.
 */
async function runDeploymentPipeline(deploymentId, slug, projectDir, userId) {
  try {
    await deploymentStore.updateDeployment(deploymentId, { status: 'deploying' });

    const result = await vercelProvider.deploy(slug, projectDir);

    await deploymentStore.updateDeployment(deploymentId, {
      status: result.status,
      deploymentUrl: result.url,
      providerDeploymentId: result.providerDeploymentId,
    });

    // If Vercel returned READY immediately (rare but possible for cached builds), we're done
    if (result.status === 'ready' || result.status === 'error' || result.status === 'cancelled') {
      logger.info(`[deploy] ${slug} reached terminal state immediately: ${result.status}`);
      if (result.status === 'ready') _chargeDeployUsage(userId, deploymentId, slug);
      return;
    }

    // Otherwise poll until terminal
    await pollUntilTerminal(deploymentId, result.providerDeploymentId, userId);

  } catch (err) {
    logger.error(`[deploy] Pipeline failed for ${slug}: ${err.message}`);
    await deploymentStore.updateDeployment(deploymentId, {
      status: 'error',
      error: friendlyError(err),
    }).catch(() => {});
  } finally {
    activeDeployments.delete(slug);
  }
}

/**
 * Polls Vercel's status endpoint until the deployment reaches a terminal state
 * (ready | error | cancelled) or we exceed the maximum number of attempts.
 */
function _chargeDeployUsage(userId, deploymentId, slug) {
  if (!userId || !chargeUsage) return;
  chargeUsage(userId, `deploy:${deploymentId}`, {
    eventType: 'deploy',
    model:     null,
    inputTokens:  0,
    outputTokens: 0,
    toolCalls:    0,
    metadata:  { slug },
  }).catch((e) => logger.warn(`[deploy] billing chargeUsage failed (non-fatal): ${e.message}`));
}

async function pollUntilTerminal(deploymentId, providerDeploymentId, userId) {
  const TERMINAL = new Set(['ready', 'error', 'cancelled']);

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const status = await vercelProvider.getDeploymentStatus(providerDeploymentId);

    await deploymentStore.updateDeployment(deploymentId, {
      status: status.status,
      ...(status.url   ? { deploymentUrl: status.url }  : {}),
      ...(status.error ? { error: status.error }         : { error: null }),
    });

    if (TERMINAL.has(status.status)) {
      logger.info(`[deploy] ${deploymentId} terminal: ${status.status}`);
      if (status.status === 'ready') _chargeDeployUsage(userId, deploymentId, '');
      return;
    }
  }

  // Timed out waiting for Vercel
  await deploymentStore.updateDeployment(deploymentId, {
    status: 'error',
    error: 'Deployment timed out waiting for Vercel. Check your Vercel dashboard for the current status.',
  });
}

// ── Public read methods ───────────────────────────────────────────────────────

async function getLatestDeployment(slug) {
  return deploymentStore.getLatestDeploymentForSlug(slug);
}

async function getDeployment(id) {
  return deploymentStore.getDeployment(id);
}

async function listDeployments(slug) {
  return deploymentStore.listDeploymentsForSlug(slug);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Converts low-level errors into short, user-readable messages.
 */
function friendlyError(err) {
  const msg = err.message || '';
  if (msg.includes('VERCEL_TOKEN'))              return 'Deployment is not configured. Ask an admin to add VERCEL_TOKEN to the server environment.';
  if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) return 'Invalid Vercel API token. Check that VERCEL_TOKEN is correct.';
  if (msg.includes('403') || msg.toLowerCase().includes('forbidden'))    return 'Insufficient Vercel permissions. Ensure your token has deployment access.';
  if (msg.includes('429') || msg.toLowerCase().includes('rate limit'))   return 'Vercel rate limit reached. Wait a moment and try again.';
  if (msg.includes('413') || msg.toLowerCase().includes('too large'))    return 'Project is too large to deploy. Remove unnecessary files and try again.';
  if (msg.includes('ENOENT'))                    return 'Project files are missing. Try regenerating the project, then deploy again.';
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) return 'Could not reach Vercel. Check your internet connection and try again.';
  return msg.length > 200 ? msg.slice(0, 200) + '…' : msg;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { startDeployment, getLatestDeployment, getDeployment, listDeployments };
