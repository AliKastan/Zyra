/**
 * Vercel Deployment Provider
 *
 * Implements the deployment provider interface for Vercel using the Vercel REST API v13.
 *
 * Provider interface:
 *   deploy(slug, projectDir)  → { providerDeploymentId, url, status }
 *   getDeploymentStatus(id)   → { status, url, error }
 */

const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const fse = require('fs-extra');
const logger = require('../utils/logger');
const { listDeployableFiles } = require('../utils/projectValidator');

const VERCEL_API = 'https://api.vercel.com';

// Map Vercel's readyState values to our normalized status strings
const STATUS_MAP = {
  QUEUED:       'deploying',
  INITIALIZING: 'deploying',
  ANALYZING:    'deploying',
  BUILDING:     'building',
  READY:        'ready',
  ERROR:        'error',
  CANCELED:     'cancelled',
};

function getToken() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error('VERCEL_TOKEN is not set. Add it to .env.local to enable deployments.');
  }
  return token;
}

function normalizeStatus(readyState) {
  return STATUS_MAP[readyState] || 'deploying';
}

/**
 * Deploys a project directory to Vercel.
 *
 * Steps:
 *  1. Read all deployable files from disk
 *  2. Optionally inject a vercel.json for non-static projects
 *  3. Upload each file to Vercel blob storage (idempotent by SHA1)
 *  4. Create deployment referencing the uploaded files
 *
 * Returns { providerDeploymentId, url, status }
 */
async function deploy(slug, projectDir) {
  const token = getToken();

  // 1. Collect files
  const fileEntries = await listDeployableFiles(projectDir);
  if (fileEntries.length === 0) throw new Error('Project directory is empty.');

  logger.info(`[vercel] Preparing ${fileEntries.length} files for "${slug}"`);

  // 2. Read file contents and compute SHA1 hashes
  const files = await Promise.all(fileEntries.map(async ({ abs, rel }) => {
    const content = await fse.readFile(abs);
    const sha = crypto.createHash('sha1').update(content).digest('hex');
    return { rel, content, sha, size: content.length };
  }));

  // 3. Inject a vercel.json if the project needs one
  const syntheticFiles = buildSyntheticFiles(files);
  const allFiles = [...files, ...syntheticFiles];

  // 4. Upload files to Vercel blob storage (concurrent, idempotent)
  logger.info(`[vercel] Uploading ${allFiles.length} files...`);
  await Promise.all(allFiles.map(f => uploadFile(token, f)));

  // 5. Build deployment name (Vercel requires lowercase, max 52 chars)
  const deploymentName = `zyra-${slug}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 52);

  // 6. Determine project settings based on project type
  const projectSettings = detectProjectSettings(allFiles.map(f => f.rel));

  // 7. Create the deployment
  logger.info(`[vercel] Creating deployment "${deploymentName}" (framework: ${projectSettings.framework || 'static'})`);

  const { data } = await axios.post(
    `${VERCEL_API}/v13/deployments`,
    {
      name: deploymentName,
      files: allFiles.map(f => ({ file: f.rel, sha: f.sha, size: f.size })),
      target: 'production',
      projectSettings,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const { id: providerDeploymentId, url, readyState } = data;
  logger.info(`[vercel] Deployment created: ${providerDeploymentId} state=${readyState}`);

  return {
    providerDeploymentId,
    url: url ? `https://${url}` : null,
    status: normalizeStatus(readyState),
  };
}

/**
 * Polls Vercel for the current status of a deployment.
 * Returns { status, url, error }
 */
async function getDeploymentStatus(providerDeploymentId) {
  const token = getToken();

  try {
    const { data } = await axios.get(
      `${VERCEL_API}/v13/deployments/${providerDeploymentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return {
      status: normalizeStatus(data.readyState),
      url: data.url ? `https://${data.url}` : null,
      error: data.errorMessage || null,
    };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return { status: 'error', url: null, error: msg };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Uploads a single file to Vercel's blob storage.
 * Vercel deduplicates by SHA1, so re-uploading an existing file is a no-op.
 */
async function uploadFile(token, file) {
  try {
    await axios.post(`${VERCEL_API}/v2/files`, file.content, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-vercel-digest': file.sha,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(file.size),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (err) {
    // HTTP 409 = file already exists in blob store — that's fine
    if (err.response?.status === 409) return;
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(`Failed to upload "${file.rel}": ${msg}`);
  }
}

/**
 * Detects the appropriate Vercel projectSettings for the given file list.
 */
function detectProjectSettings(relPaths) {
  const has = p => relPaths.includes(p);
  const hasDir = prefix => relPaths.some(p => p.startsWith(prefix));

  // Next.js
  if (has('package.json') && hasDir('pages/') || hasDir('app/')) {
    // Let Vercel auto-detect Next.js from package.json — framework: null works fine
  }

  // Vite
  if (has('vite.config.js') || has('vite.config.ts')) {
    return {
      framework: 'vite',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      installCommand: 'npm install',
    };
  }

  // Create React App
  if (has('package.json') && has('src/index.js') || has('src/index.tsx')) {
    return {
      framework: 'create-react-app',
      buildCommand: 'npm run build',
      outputDirectory: 'build',
      installCommand: 'npm install',
    };
  }

  // Static site (default — no build step)
  return {
    framework: null,
    buildCommand: null,
    outputDirectory: null,
    installCommand: null,
  };
}

/**
 * Generates synthetic config files that should be injected into the deployment
 * but should NOT be written back to the project on disk.
 *
 * For static sites: a minimal vercel.json enabling clean URLs.
 * For Node.js apps: a vercel.json routing all traffic to the entry point.
 */
function buildSyntheticFiles(files) {
  const relPaths = files.map(f => f.rel);
  const synthetic = [];

  // Don't inject if the project already provides a vercel.json
  if (relPaths.includes('vercel.json')) return [];

  const hasPackageJson = relPaths.includes('package.json');
  const hasIndexHtml   = relPaths.includes('index.html');

  let config;

  if (!hasPackageJson || hasIndexHtml) {
    // Static site
    config = { cleanUrls: true, trailingSlash: false };
  } else {
    // Node.js / server project — route everything to the entry point
    const entry = relPaths.includes('index.js') ? '/index.js'
                : relPaths.includes('server.js') ? '/server.js'
                : relPaths.includes('app.js')    ? '/app.js'
                : null;

    if (!entry) return [];

    config = {
      version: 2,
      builds: [{ src: entry.slice(1), use: '@vercel/node' }],
      routes: [{ src: '/(.*)', dest: entry }],
    };
  }

  const content = Buffer.from(JSON.stringify(config, null, 2));
  synthetic.push({
    rel: 'vercel.json',
    content,
    sha: crypto.createHash('sha1').update(content).digest('hex'),
    size: content.length,
  });

  return synthetic;
}

module.exports = { deploy, getDeploymentStatus };
