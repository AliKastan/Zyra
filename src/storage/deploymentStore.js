const path = require('path');
const fse = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { now } = require('../utils/timestamps');

const DEPLOYMENTS_DIR = path.resolve(__dirname, '../../storage/deployments');

async function ensureDir() {
  await fse.ensureDir(DEPLOYMENTS_DIR);
}

/**
 * Creates a new deployment record with status "queued".
 */
async function createDeployment({ slug, userId, provider = 'vercel' }) {
  await ensureDir();
  const id = uuidv4();
  const record = {
    id,
    slug,
    userId,
    provider,
    status: 'queued',
    deploymentUrl: null,
    providerDeploymentId: null,
    createdAt: now(),
    updatedAt: now(),
    error: null,
  };
  await fse.writeJson(path.join(DEPLOYMENTS_DIR, `${id}.json`), record, { spaces: 2 });
  return record;
}

/**
 * Updates an existing deployment record by merging the given fields.
 */
async function updateDeployment(id, updates) {
  await ensureDir();
  const filePath = path.join(DEPLOYMENTS_DIR, `${id}.json`);
  if (!(await fse.pathExists(filePath))) throw new Error(`Deployment ${id} not found`);
  const existing = await fse.readJson(filePath);
  const record = { ...existing, ...updates, updatedAt: now() };
  await fse.writeJson(filePath, record, { spaces: 2 });
  return record;
}

/**
 * Gets a deployment record by ID.
 */
async function getDeployment(id) {
  await ensureDir();
  const filePath = path.join(DEPLOYMENTS_DIR, `${id}.json`);
  if (!(await fse.pathExists(filePath))) return null;
  return fse.readJson(filePath);
}

/**
 * Returns the most recent deployment for a given project slug.
 */
async function getLatestDeploymentForSlug(slug) {
  const all = await listDeploymentsForSlug(slug);
  return all.length > 0 ? all[0] : null;
}

/**
 * Returns all deployments for a given project slug, newest first.
 */
async function listDeploymentsForSlug(slug) {
  await ensureDir();
  const files = await fse.readdir(DEPLOYMENTS_DIR);
  const deployments = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const d = await fse.readJson(path.join(DEPLOYMENTS_DIR, file));
      if (d.slug === slug) deployments.push(d);
    } catch (_) {}
  }
  return deployments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  createDeployment,
  updateDeployment,
  getDeployment,
  getLatestDeploymentForSlug,
  listDeploymentsForSlug,
};
