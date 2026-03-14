const path = require('path');
const fs   = require('fs-extra');
const logger = require('../utils/logger');

const ENV_DIR = path.resolve(__dirname, '../../storage/env');

function envFilePath(slug) {
  return path.join(ENV_DIR, `${slug}.json`);
}

/** Validate + sanitize a single env var entry */
function sanitizeVar({ key, value }) {
  if (typeof key !== 'string' || typeof value !== 'string') return null;
  const k = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 128);
  if (!k) return null;
  return { key: k, value: value.slice(0, 4096) };
}

/** GET /api/projects/:slug/env — returns vars with values masked */
async function getEnvVars(req, res) {
  const { slug } = req.params;
  try {
    await fs.ensureDir(ENV_DIR);
    const fp = envFilePath(slug);
    if (!await fs.pathExists(fp)) {
      return res.json({ vars: [] });
    }
    const raw = await fs.readJson(fp);
    const vars = (raw.vars || []).map(({ key, value }) => ({
      key,
      // Mask: show last 4 chars only if value is 8+ chars
      masked: value.length >= 8
        ? '•'.repeat(Math.min(value.length - 4, 16)) + value.slice(-4)
        : '•'.repeat(value.length),
    }));
    res.json({ vars });
  } catch (err) {
    logger.error('envController.getEnvVars error', { slug, error: err.message });
    res.status(500).json({ error: 'Failed to read env vars' });
  }
}

/** POST /api/projects/:slug/env — saves vars */
async function setEnvVars(req, res) {
  const { slug } = req.params;
  const incoming = req.body?.vars;
  if (!Array.isArray(incoming)) {
    return res.status(400).json({ error: '"vars" must be an array' });
  }

  const vars = incoming
    .map(sanitizeVar)
    .filter(Boolean)
    // Deduplicate by key (last value wins)
    .reduce((acc, v) => {
      const existing = acc.findIndex(x => x.key === v.key);
      if (existing >= 0) acc[existing] = v;
      else acc.push(v);
      return acc;
    }, []);

  try {
    await fs.ensureDir(ENV_DIR);
    await fs.writeJson(envFilePath(slug), { vars }, { spaces: 2 });
    logger.info(`envController: saved ${vars.length} vars for slug="${slug}"`);
    res.json({ ok: true, count: vars.length });
  } catch (err) {
    logger.error('envController.setEnvVars error', { slug, error: err.message });
    res.status(500).json({ error: 'Failed to save env vars' });
  }
}

/**
 * GET /zyra-env/:slug.js — serves window.__ENV__ script (no auth, called by generated apps)
 * Values are NOT masked here — the iframe is same-origin and the user set these vars themselves.
 */
async function serveEnvScript(req, res) {
  // Extract slug from ":slug.js" param
  const raw  = req.params.slugjs || '';
  const slug = raw.endsWith('.js') ? raw.slice(0, -3) : raw;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const fp = envFilePath(slug);
    if (!slug || !await fs.pathExists(fp)) {
      return res.send('window.__ENV__ = {};');
    }
    const { vars = [] } = await fs.readJson(fp);
    const obj = {};
    for (const { key, value } of vars) obj[key] = value;

    // Also expose each var as window.__KEY__ for backward compat
    const extras = vars
      .map(({ key, value }) => `window.__${key}__ = ${JSON.stringify(value)};`)
      .join('\n');

    res.send(`window.__ENV__ = ${JSON.stringify(obj)};\n${extras}`);
  } catch (err) {
    logger.warn('envController.serveEnvScript error', { slug, error: err.message });
    res.send('window.__ENV__ = {};');
  }
}

module.exports = { getEnvVars, setEnvVars, serveEnvScript };
