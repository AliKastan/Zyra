/**
 * qualityFixController.js
 *
 * POST /api/fix/quality/:slug
 * Body: { errors: [{check, message}], originalPrompt: string }
 *
 * Called by the client-side Quality Pipeline when automated sandbox testing
 * finds runtime bugs in a freshly-generated game. Takes the list of detected
 * errors, reads the current index.html from disk, asks Claude to fix the
 * specific bugs, writes the fixed HTML back, and responds synchronously.
 *
 * Unlike handleFixGame (which creates an async job), this is a synchronous
 * round-trip because the client is already showing a loading screen and
 * polling is not needed — we just want the fix to land before we reveal
 * the game to the user.
 */

const path = require('path');
const fse  = require('fs-extra');

const { callClaude, SONNET_MODEL } = require('../providers/anthropicProvider');
const { GENERATED_PROJECTS_DIR }   = require('../generators/projectGenerator');
const logger = require('../utils/logger');

const MAX_INPUT_CHARS = 120_000; // ~30k tokens — truncate if game is huge
const FIX_MAX_TOKENS  = 14_000;  // enough for a complete game file

// ── Fix prompt ────────────────────────────────────────────────────────────────

function buildFixPrompt(originalPrompt, errors, brokenCode) {
  const errorList = errors
    .slice(0, 10) // cap to avoid giant prompts
    .map((e, i) => `${i + 1}. [${e.check}] ${e.message}`)
    .join('\n');

  return [
    `You generated this HTML5 mobile game but automated testing found bugs.`,
    `Fix every error below. Return ONLY the complete fixed HTML — no explanation, no markdown fences.`,
    ``,
    `ORIGINAL GAME REQUEST: "${(originalPrompt || '').slice(0, 300)}"`,
    ``,
    `RUNTIME ERRORS DETECTED:`,
    errorList,
    ``,
    `FIX RULES:`,
    `- Fix every error above. Do not skip any.`,
    `- Do NOT remove features or simplify the game to avoid the fix — fix the root cause.`,
    `- Do NOT change the visual design, theme, or concept.`,
    `- All buttons must be clickable and trigger the correct behaviour.`,
    `- Game must fit within a 375×812px mobile viewport — no horizontal scrolling.`,
    `- All variables must be declared before use (no ReferenceError).`,
    `- Attach DOM listeners inside DOMContentLoaded or at the end of <body>.`,
    `- Replace any broken external image URLs with CSS shapes, canvas drawing, or emoji.`,
    `- No infinite loops or blocking code in the main thread.`,
    ``,
    `BROKEN CODE:`,
    brokenCode.slice(0, MAX_INPUT_CHARS),
  ].join('\n');
}

// ── HTML extractor ────────────────────────────────────────────────────────────
// Claude sometimes wraps its response in ```html ... ``` even when told not to.

function extractHtml(raw) {
  // Strip markdown fences if present
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

// ── Controller ────────────────────────────────────────────────────────────────

async function handleQualityFix(req, res) {
  const { slug } = req.params;
  const { errors = [], originalPrompt = '' } = req.body;

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid project slug' });
  }
  if (!Array.isArray(errors) || errors.length === 0) {
    return res.status(400).json({ error: 'errors array is required' });
  }

  const indexPath = path.join(GENERATED_PROJECTS_DIR, slug, 'index.html');
  if (!(await fse.pathExists(indexPath))) {
    return res.status(404).json({ error: 'Project not found' });
  }

  let brokenCode;
  try {
    brokenCode = await fse.readFile(indexPath, 'utf8');
  } catch (err) {
    return res.status(500).json({ error: 'Could not read project file' });
  }

  logger.info(`[quality-fix] "${slug}" — ${errors.length} errors to fix`);
  errors.forEach((e, i) => logger.debug(`[quality-fix]   ${i + 1}. [${e.check}] ${e.message}`));

  const system = [
    'You are an expert HTML5 mobile game developer specialising in bug fixes.',
    'You will receive buggy game code and a list of runtime errors.',
    'Return ONLY the complete fixed HTML file — no markdown, no explanations, nothing else.',
  ].join(' ');

  const userPrompt = buildFixPrompt(originalPrompt, errors, brokenCode);

  let raw;
  try {
    raw = await callClaude(system, userPrompt, {
      model:     SONNET_MODEL,
      maxTokens: FIX_MAX_TOKENS,
    });
  } catch (err) {
    logger.error(`[quality-fix] Claude call failed: ${err.message}`);
    return res.status(500).json({ error: 'AI fix failed: ' + err.message });
  }

  const fixedHtml = extractHtml(raw);

  // Basic sanity check — don't overwrite with garbage
  if (!fixedHtml.includes('<') || fixedHtml.length < 100) {
    logger.warn(`[quality-fix] "${slug}" — Claude returned unusable output, keeping original`);
    return res.status(422).json({ error: 'Fixed output was not valid HTML' });
  }

  try {
    await fse.writeFile(indexPath, fixedHtml, 'utf8');
    logger.info(`[quality-fix] "${slug}" — fixed file written (${fixedHtml.length} chars)`);
  } catch (err) {
    return res.status(500).json({ error: 'Could not write fixed file' });
  }

  return res.json({ ok: true, fixedLength: fixedHtml.length });
}

module.exports = { handleQualityFix };
