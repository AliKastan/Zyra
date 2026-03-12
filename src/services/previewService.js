/**
 * previewService.js
 * Manages live preview processes for generated projects.
 *
 * For static HTML/CSS/JS projects: immediately serves via Express static at /preview/{slug}/
 * For React/Next.js/Node projects: spawns a dev server on a free port, waits for readiness.
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs-extra');
const { detectProjectType } = require('../utils/projectTypeDetector');
const { findFreePort } = require('../utils/portFinder');
const logger = require('../utils/logger');

const ROOT = path.join(__dirname, '../../');
const GENERATED_DIR = path.join(ROOT, 'generated-projects');

// Map<slug, PreviewRecord>
const previews = new Map();

/**
 * PreviewRecord shape:
 * { slug, type, status, port, url, pid, _proc, error }
 * status: 'installing' | 'starting' | 'ready' | 'error' | 'stopped'
 */

async function startPreview(slug) {
  const projectDir = path.join(GENERATED_DIR, slug);

  if (!(await fs.pathExists(projectDir))) {
    throw new Error(`Project directory not found: generated-projects/${slug}`);
  }

  // Return existing preview if already running/starting
  const existing = previews.get(slug);
  if (existing && ['ready', 'starting', 'installing'].includes(existing.status)) {
    return _sanitize(existing);
  }

  // Kill any stale preview for this slug
  if (existing) _killProcess(existing);

  const { type, needsInstall } = await detectProjectType(projectDir);

  // Static sites are served immediately via Express static middleware
  if (type === 'static') {
    const mainPort = parseInt(process.env.PORT || '3001', 10);
    const record = {
      slug, type: 'static', status: 'ready',
      port: mainPort,
      url: `/preview/${slug}/`,
      pid: null, _proc: null, error: null,
    };
    previews.set(slug, record);
    return _sanitize(record);
  }

  // Dynamic projects: find a free port and spawn the dev server
  const port = await findFreePort(3100, 3200);
  const record = {
    slug, type, status: needsInstall ? 'installing' : 'starting',
    port, url: `http://localhost:${port}`,
    pid: null, _proc: null, error: null,
  };
  previews.set(slug, record);

  // Spawn asynchronously; callers should poll getPreview() for status updates
  _spawnServer(slug, projectDir, type, port, record, needsInstall).catch((err) => {
    logger.error(`[preview] Failed to start ${slug}: ${err.message}`);
    record.status = 'error';
    record.error = err.message;
  });

  return _sanitize(record);
}

async function _spawnServer(slug, projectDir, type, port, record, needsInstall) {
  // npm install if node_modules is missing
  if (needsInstall && !(await fs.pathExists(path.join(projectDir, 'node_modules')))) {
    logger.info(`[preview] Installing dependencies for ${slug}...`);
    await _runCommand('npm', ['install', '--legacy-peer-deps', '--prefer-offline'], projectDir);
    logger.info(`[preview] Dependencies installed for ${slug}`);
  }

  record.status = 'starting';

  // Determine the start command
  let cmd = 'node';
  let args = ['index.js'];

  try {
    const pkg = await fs.readJson(path.join(projectDir, 'package.json')).catch(() => ({}));

    if (type === 'nextjs') {
      cmd = 'npx'; args = ['next', 'dev', '-p', String(port)];
    } else if (type === 'react-cra') {
      cmd = 'npx'; args = ['react-scripts', 'start'];
    } else if (type === 'vite') {
      cmd = 'npx'; args = ['vite', '--port', String(port), '--strictPort'];
    } else {
      // Generic Node.js server
      if (pkg.scripts?.start) {
        cmd = 'npm'; args = ['start'];
      } else {
        const main = pkg.main || 'index.js';
        cmd = 'node'; args = [main];
      }
    }
  } catch (_) {
    // fall through to defaults
  }

  const env = {
    ...process.env,
    PORT: String(port),
    BROWSER: 'none',    // prevent CRA from opening a browser
    CI: 'false',        // prevent CRA from treating warnings as errors
  };

  logger.info(`[preview] Spawning ${type} server for ${slug} on port ${port}: ${cmd} ${args.join(' ')}`);

  const proc = spawn(cmd, args, {
    cwd: projectDir,
    env,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  record._proc = proc;
  record.pid = proc.pid;

  proc.stdout?.on('data', (d) => logger.debug(`[preview:${slug}] ${d.toString().trimEnd()}`));
  proc.stderr?.on('data', (d) => logger.debug(`[preview:${slug}:err] ${d.toString().trimEnd()}`));

  proc.on('error', (err) => {
    if (record.status !== 'stopped') {
      record.status = 'error';
      record.error = err.message;
    }
  });

  proc.on('exit', (code) => {
    if (record.status !== 'stopped') {
      record.status = code === 0 ? 'stopped' : 'error';
      if (code !== 0) record.error = `Process exited with code ${code}`;
    }
  });

  // Poll until the port accepts TCP connections (works for any server type)
  await _waitForPort(port, 90_000);
  record.status = 'ready';
  logger.info(`[preview] ${slug} ready at http://localhost:${port}`);
}

/** Runs a command synchronously (for npm install). */
function _runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

/** Polls a TCP port until it accepts connections or times out. */
function _waitForPort(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function attempt() {
      if (Date.now() > deadline) {
        return reject(new Error(`Server on port ${port} did not respond within ${Math.round(timeoutMs / 1000)}s`));
      }
      const socket = net.createConnection(port, '127.0.0.1');
      socket.setTimeout(1000);
      socket.on('connect', () => { socket.destroy(); resolve(); });
      socket.on('error', () => setTimeout(attempt, 800));
      socket.on('timeout', () => { socket.destroy(); setTimeout(attempt, 800); });
    }

    setTimeout(attempt, 1500); // initial delay — give the server time to start
  });
}

function _killProcess(record) {
  if (record._proc) {
    try { record._proc.kill(); } catch (_) {}
    record._proc = null;
  }
  record.status = 'stopped';
}

function _sanitize(record) {
  return {
    slug: record.slug,
    type: record.type,
    status: record.status,
    port: record.port,
    url: record.url,
    error: record.error || null,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

function getPreview(slug) {
  const record = previews.get(slug);
  return record ? _sanitize(record) : null;
}

function stopPreview(slug) {
  const record = previews.get(slug);
  if (!record) return;
  _killProcess(record);
  previews.delete(slug);
  logger.info(`[preview] Stopped preview for ${slug}`);
}

function stopAll() {
  for (const slug of previews.keys()) stopPreview(slug);
}

function listPreviews() {
  return Array.from(previews.values()).map(_sanitize);
}

module.exports = { startPreview, getPreview, stopPreview, stopAll, listPreviews };
