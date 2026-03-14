const path   = require('path');
const fs     = require('fs-extra');
const logger = require('../utils/logger');
const { CATALOG, CATEGORIES, validateVar, detectIntegrationsFromFiles, getModuleIntegrations } = require('../utils/integrationCatalog');

const ENV_DIR      = path.resolve(__dirname, '../../storage/env');
const PROJECTS_DIR = path.resolve(__dirname, '../../generated-projects');

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

/** Reads raw (unmasked) vars map for a slug. Returns {} if none. */
async function readRawVars(slug) {
  try {
    const fp = envFilePath(slug);
    if (!await fs.pathExists(fp)) return {};
    const data = await fs.readJson(fp);
    const vars = data.vars || [];
    return Object.fromEntries(vars.map(({ key, value }) => [key, value]));
  } catch {
    return {};
  }
}

// ── GET /api/projects/:slug/env ───────────────────────────────────────────────
// Returns vars with masked values (safe to send to browser)

async function getEnvVars(req, res) {
  const { slug } = req.params;
  try {
    await fs.ensureDir(ENV_DIR);
    const fp = envFilePath(slug);
    if (!await fs.pathExists(fp)) {
      return res.json({ vars: [] });
    }
    const raw  = await fs.readJson(fp);
    const vars = (raw.vars || []).map(({ key, value }) => ({
      key,
      masked: value.length >= 8
        ? '•'.repeat(Math.min(value.length - 4, 20)) + value.slice(-4)
        : '•'.repeat(value.length),
    }));
    res.json({ vars });
  } catch (err) {
    logger.error('envController.getEnvVars error', { slug, error: err.message });
    res.status(500).json({ error: 'Failed to read env vars' });
  }
}

// ── POST /api/projects/:slug/env ──────────────────────────────────────────────
// Saves vars; merges with existing masked values (masked values not overwritten)

async function setEnvVars(req, res) {
  const { slug } = req.params;
  const incoming = req.body?.vars;
  if (!Array.isArray(incoming)) {
    return res.status(400).json({ error: '"vars" must be an array' });
  }

  // Read existing so we can preserve values that come back masked
  const existing = await readRawVars(slug);

  const vars = incoming
    .map(sanitizeVar)
    .filter(Boolean)
    .map(({ key, value }) => {
      // If value looks like a masked string (all bullets + 4 chars), keep existing
      const isMasked = /^•+[^•]{1,4}$/.test(value);
      return { key, value: isMasked && existing[key] ? existing[key] : value };
    })
    .reduce((acc, v) => {
      const i = acc.findIndex(x => x.key === v.key);
      if (i >= 0) acc[i] = v; else acc.push(v);
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

// ── GET /api/projects/:slug/integrations ──────────────────────────────────────
// Returns the integration manifest for this project with per-var status

async function getIntegrations(req, res) {
  const { slug } = req.params;
  try {
    // Detect integrations from project files
    const projectDir = path.join(PROJECTS_DIR, slug);
    const filePaths  = await collectProjectFilePaths(projectDir);
    const detected   = detectIntegrationsFromFiles(filePaths);

    // Load saved vars
    const savedVars = await readRawVars(slug);

    // Build integration statuses
    const integrations = [];

    // Start with detected integrations, ordered by category
    const allIds = [...detected];

    // Add supabase by default if project has HTML files (most generated apps use it)
    if (!allIds.includes('supabase') && filePaths.some(p => p.endsWith('.html'))) {
      allIds.unshift('supabase');
    }

    // Sort by category order
    allIds.sort((a, b) => {
      const catA = CATALOG[a]?.category || 'z';
      const catB = CATALOG[b]?.category || 'z';
      return (CATEGORIES[catA]?.order || 99) - (CATEGORIES[catB]?.order || 99);
    });

    for (const id of allIds) {
      const integration = CATALOG[id];
      if (!integration) continue;

      const varStatuses = integration.vars.map(varDef => {
        const rawValue = savedVars[varDef.key] || '';
        const isSet    = rawValue.length > 0;
        const validErr = isSet ? (varDef.validate ? varDef.validate(rawValue) : null) : null;

        return {
          key:      varDef.key,
          label:    varDef.label,
          required: varDef.required,
          public:   varDef.public,
          hint:     varDef.hint,
          placeholder: varDef.placeholder,
          isSet,
          // Only show masked version, never raw
          maskedValue: isSet ? maskValue(rawValue) : '',
          validationError: validErr,
        };
      });

      // Compute integration status
      const requiredVars = varStatuses.filter(v => v.required);
      const allRequired  = requiredVars.every(v => v.isSet);
      const anySet       = varStatuses.some(v => v.isSet);
      const hasErrors    = varStatuses.some(v => v.validationError);

      let status = 'missing';
      if (allRequired && !hasErrors) status = 'configured';
      else if (anySet)               status = 'partial';

      integrations.push({
        id,
        label:       integration.label,
        category:    integration.category,
        description: integration.description,
        docsUrl:     integration.docsUrl,
        setupUrl:    integration.setupUrl,
        setupGuide:  integration.setupGuide || [],
        billingNote: integration.billingNote || null,
        sqlFiles:    integration.sqlFiles || [],
        status,
        vars: varStatuses,
      });
    }

    res.json({ integrations });
  } catch (err) {
    logger.error('envController.getIntegrations error', { slug, error: err.message });
    res.status(500).json({ error: 'Failed to load integrations' });
  }
}

// ── POST /api/projects/:slug/integrations/validate ───────────────────────────
// Validates a single var value against catalog rules (format check only, no network)

async function validateIntegration(req, res) {
  const { slug } = req.params;
  const { integrationId, key, value } = req.body || {};

  if (!integrationId || !key) {
    return res.status(400).json({ error: 'integrationId and key are required' });
  }

  const integration = CATALOG[integrationId];
  if (!integration) {
    return res.status(404).json({ error: `Unknown integration: ${integrationId}` });
  }

  const error = validateVar(integrationId, key, value || '');
  res.json({ valid: !error, error: error || null });
}

// ── GET /zyra-env/:slug.js ────────────────────────────────────────────────────
// Serves window.__ENV__ script — values unmasked (called by generated apps in iframe)

async function serveEnvScript(req, res) {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskValue(value) {
  if (!value || value.length === 0) return '';
  if (value.length < 8) return '•'.repeat(value.length);
  return '•'.repeat(Math.min(value.length - 4, 20)) + value.slice(-4);
}

async function collectProjectFilePaths(dir) {
  const paths = [];
  try {
    if (!await fs.pathExists(dir)) return paths;
    await walkDir(dir, paths);
  } catch { /* ignore */ }
  return paths;
}

async function walkDir(dir, paths) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(full, paths);
    } else {
      paths.push(full);
    }
  }
}

module.exports = { getEnvVars, setEnvVars, serveEnvScript, getIntegrations, validateIntegration };
