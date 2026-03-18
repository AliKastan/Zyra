/**
 * fixController.js
 *
 * POST /api/fix/:slug
 *
 * "Fix My Game" — loads the project, runs static game-playability analysis,
 * builds a targeted fix prompt from the detected issues, then routes the
 * repair through the existing editService pipeline (progress, file writing,
 * metadata update all handled there).
 *
 * Returns: { jobId, issuesFound, criticalIssues[] }
 * Client polls /api/jobs/:id the same way it tracks any edit job.
 */

const path = require('path');
const fse  = require('fs-extra');

const { startEdit }               = require('../services/editService');
const { getActiveJobCount }       = require('../services/generationService');
const { GENERATED_PROJECTS_DIR }  = require('../generators/projectGenerator');
const { validateGamePlayability, validateGeneratedCode } = require('../utils/codeValidator');
const limits = require('../config/limits');
const logger = require('../utils/logger');

// ── File loader (same logic as editService, inline to avoid circular deps) ────

const TEXT_EXTS = new Set(['.html', '.htm', '.css', '.js', '.ts', '.json', '.md', '.txt', '.svg']);

async function loadGameFiles(projectDir) {
  if (!(await fse.pathExists(projectDir))) return [];
  const files = [];
  await walkDir(projectDir, projectDir, files);
  return files;
}

async function walkDir(dir, root, out) {
  let entries;
  try { entries = await fse.readdir(dir, { withFileTypes: true }); }
  catch (_) { return; }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { await walkDir(full, root, out); continue; }
    if (!TEXT_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
    try {
      const content = await fse.readFile(full, 'utf8');
      out.push({ path: path.relative(root, full).replace(/\\/g, '/'), content });
    } catch (_) {}
  }
}

// ── Fix prompt builder ─────────────────────────────────────────────────────────

/**
 * Builds a BUG_FIX_REQUEST-classified edit prompt enriched with the results
 * of our static game-playability analysis.
 */
function buildFixPrompt(description, gameIssues, syntaxErrors) {
  const lines = [
    'Fix my game. Perform a full game code analysis and fix every playability issue found.',
  ];

  if (gameIssues.critical.length > 0) {
    lines.push('\nCRITICAL GAME ISSUES (must all be fixed):');
    gameIssues.critical.forEach((i) => lines.push(`- ${i.message}`));
  }

  if (gameIssues.warnings.length > 0) {
    lines.push('\nADDITIONAL WARNINGS:');
    gameIssues.warnings.forEach((i) => lines.push(`- ${i.message}`));
  }

  if (syntaxErrors.length > 0) {
    lines.push('\nCODE ERRORS:');
    syntaxErrors.slice(0, 6).forEach((e) => lines.push(`- ${e.file}: ${e.message}`));
  }

  if (description) {
    lines.push(`\nUSER-REPORTED ISSUE: ${description}`);
  }

  lines.push(
    '\nA valid game requires: requestAnimationFrame game loop, pointerdown/touchstart touch controls, ' +
    'canvas.getContext(\'2d\') setup, game state machine (menu → playing → gameover), ' +
    'working restart that resets all state, no TODO stubs, no empty function bodies. ' +
    'Fix or remove every broken feature. Simplify mechanics if needed to ensure stability.',
  );

  return lines.join('\n');
}

// ── Controller ────────────────────────────────────────────────────────────────

async function handleFixGame(req, res) {
  const { slug } = req.params;
  const { description = '', mode = 'balanced' } = req.body;

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid project slug' });
  }
  if (!['fast', 'balanced', 'quality'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode' });
  }

  const projectDir = path.join(GENERATED_PROJECTS_DIR, slug);
  if (!(await fse.pathExists(projectDir))) {
    return res.status(404).json({ error: 'Project not found. Try regenerating first.' });
  }

  const userId = req.user?.id;
  if (getActiveJobCount(userId) >= (limits.MAX_CONCURRENT_JOBS || 1)) {
    return res.status(429).json({ error: 'A job is already in progress.', code: 'JOB_IN_PROGRESS' });
  }

  // ── Static analysis ────────────────────────────────────────────────────────
  const files       = await loadGameFiles(projectDir);
  const gameIssues  = validateGamePlayability(files);
  const syntaxErrors = validateGeneratedCode(files);

  const totalIssues = gameIssues.critical.length + gameIssues.warnings.length + syntaxErrors.length;
  logger.info(
    `fixController: "${slug}" — ` +
    `${gameIssues.critical.length} critical, ${gameIssues.warnings.length} warnings, ` +
    `${syntaxErrors.length} syntax errors`
  );

  // ── Build fix prompt + route through edit pipeline ─────────────────────────
  const fixPrompt = buildFixPrompt(description.trim(), gameIssues, syntaxErrors);

  try {
    const jobId = await startEdit(fixPrompt, slug, mode, { userId });
    logger.info(`fixController: started fix job ${jobId} for "${slug}"`);
    return res.status(202).json({
      jobId,
      issuesFound:    totalIssues,
      criticalIssues: gameIssues.critical.map((i) => i.type),
    });
  } catch (err) {
    logger.error('fixController: failed to start fix', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { handleFixGame };
