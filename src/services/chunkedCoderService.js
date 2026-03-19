/**
 * chunkedCoderService.js
 *
 * Fault-tolerant per-file game code generation.
 *
 * Instead of one giant streaming Sonnet call (3-8 min, fragile), generates
 * each file in a separate small non-streaming call (~30-60s each, reliable).
 *
 * Benefits:
 *   - No single request > 9K output tokens  (vs 14K-28K in single-call mode)
 *   - Non-streaming: HTTP connection is short and robust
 *   - Per-file retry: one failure does not kill the whole project
 *   - Incremental progress: user sees "Writing game.js (3/5)" in real time
 *   - Partial recovery: if generation is interrupted, completed files survive
 */

const path = require('path');
const { callClaude, HAIKU_MODEL, SONNET_MODEL } = require('../providers/anthropicProvider');
const { slugify } = require('../utils/slugify');
const { withTimeout } = require('../utils/withTimeout');
const { buildGenreRuleBlock } = require('../generators/genreRules');
const promptBuilder = require('../generators/promptBuilder');
const logger = require('../utils/logger');

// ── Per-file output token budgets ─────────────────────────────────────────────
// Small enough to complete in ~30-90s. game.js gets the most (it's the largest file).
const CHUNK_TOKENS = {
  fast:     4_000,
  balanced: 7_000,
  quality:  9_000,
  '3d':     4_000, // 3D games are 3-file max with simple shapes — Haiku handles this fine
};

// Timeout per file (generous but much shorter than the 10-min coder timeout)
const CHUNK_TIMEOUT_MS = parseInt(process.env.CHUNK_TIMEOUT_MS || '90000', 10); // 90s

// ── File ordering ─────────────────────────────────────────────────────────────

/**
 * Sort files into dependency order so later files can use IDs/functions
 * defined in earlier files. HTML first (defines DOM), then CSS, then JS, then docs.
 */
function orderFiles(files) {
  const PRIORITY = [
    '.html',
    '.css',
    'game.js',
    'player.js',
    'enemies.js',
    'input.js',
    'ui.js',
    'hud.js',
    'audio.js',
    'storage.js',
    '.js',
    '.md',
    '.txt',
  ];
  return [...files].sort((a, b) => {
    const ai = PRIORITY.findIndex(p => a.toLowerCase().endsWith(p));
    const bi = PRIORITY.findIndex(p => b.toLowerCase().endsWith(p));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });
}

// ── Prompt building ───────────────────────────────────────────────────────────

const CHUNK_SYSTEM_BASE = `Mobile game file generator. Generate exactly ONE file only.

MANDATORY OUTPUT FORMAT — start immediately with the file block (no other text):
---FILE: path/to/file.ext---
[complete, working file content — no TODOs, no placeholders]
---END FILE---

VISUAL RULE: Derive ONE coherent visual style from the game's theme. Do NOT default to dark-bg + purple + red-accent — that is the generic AI game look. Choose something intentional that fits this specific game. Use a consistent 2-3 color palette across all files. No random gradients on every element. No glow on every text. Menus must feel like they belong to THIS game.`;

const CORE_GAME_RULES = `
MOBILE GAME RULES (for game.js and any file containing game logic):
- Game loop: let lastTime=0; function gameLoop(ts){const dt=Math.min((ts-lastTime)/1000,0.05);lastTime=ts;if(gameState==='playing'){update(dt);draw();}requestAnimationFrame(gameLoop);} requestAnimationFrame(gameLoop);
- State machine: let gameState='menu'; // 'menu'|'playing'|'paused'|'gameover'
- Canvas: const canvas=document.getElementById('game-canvas'); if(!canvas)return; const ctx=canvas.getContext('2d');
- Touch: canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();handleTap(e.clientX-r.left,e.clientY-r.top);});
- Resize: function resizeCanvas(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;} window.addEventListener('resize',resizeCanvas); resizeCanvas();
- Score: let score=0; let bestScore=parseInt(localStorage.getItem('zyra_best')||'0',10);
- Restart: function restartGame(){score=0;enemies=[];gameState='playing';}
- JS rules: let (not const) for mutable state; null-guard all DOM ops; try/catch around localStorage/audio
- Visual: use the CSS vars (--bg, --primary, --accent, --text) defined in style.css — never hardcode raw hex values in JS canvas draws; read them via getComputedStyle if needed or match the chosen palette`;

const HTML_RULES = `
HTML RULES:
- Mobile viewport: <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
- Canvas: <canvas id="game-canvas" style="display:block;"></canvas>
- Body: style="margin:0;padding:0;overflow:hidden;background:#0d0d1a;touch-action:none;"
- Include <link> for all CSS files and <script> for all JS files`;

const CSS_RULES = `
CSS RULES:
- body { margin:0; padding:0; overflow:hidden; background:var(--bg,#111); touch-action:none; -webkit-user-select:none; user-select:none; }
- canvas { display:block; width:100%; height:100%; }
- HUD elements: position:absolute, min 44px touch targets
- :root { --bg; --primary; --accent; --text; --radius:10px; --font:system-ui,sans-serif } — derive from THIS game's theme, not a generic dark-purple default
- Use ONE visual style consistently: pick a direction (gritty/casual/retro/cozy/minimal) and apply it to all elements
- 2-3 core colors max. Same palette for buttons, HUD, overlays, menus. No random gradients on every element`;

/**
 * Returns file-specific requirements for the per-file prompt.
 */
function getFileRules(filePath, plan) {
  const p = filePath.toLowerCase();
  const isGameJs = p.includes('game.js') || (p.endsWith('.js') && !p.includes('/') && plan?.files?.length <= 3);

  if (p.endsWith('.html'))  return HTML_RULES;
  if (p.endsWith('.css'))   return CSS_RULES;
  if (isGameJs)             return CORE_GAME_RULES;
  if (p.includes('player')) return 'Player entity: position, velocity, health, draw(ctx), update(dt), reset(). Export as object or class.';
  if (p.includes('enemies')) return 'Enemy types: spawn(), update(dt), draw(ctx), collision detection. Pool management.';
  if (p.includes('input'))  return 'Touch/pointer input ONLY. pointerdown/pointermove/pointerup on canvas. Export input state or functions. No keyboard-only controls.';
  if (p.includes('ui'))     return 'Canvas-drawn UI: renderMenu(ctx,canvas), renderGameOver(ctx,canvas,score,best), renderHUD(ctx,canvas,score,lives). ctx.fillText for all text.';
  if (p.includes('audio'))  return 'Web Audio API only — no external audio files. playSound(type) with oscillator for hit/score/death. Wrap in try/catch.';
  if (p.includes('storage')) return 'localStorage wrapper: saveBestScore(n), loadBestScore(), saveSettings(obj), loadSettings(). All try/catch.';
  if (p.endsWith('.md'))    return 'Short README: game name, 2-3 sentence description, controls (touch), how to run (open index.html).';
  return `Complete implementation for ${filePath} per the game plan.`;
}

/**
 * Builds context from previously generated files, capped to avoid token bloat.
 */
function buildPreviousContext(previousFiles) {
  if (!previousFiles.length) return '';

  const MAX_TOTAL = 5_000;
  const MAX_PER_FILE = 2_000;
  let total = 0;
  const lines = ['\n\nPREVIOUSLY GENERATED FILES (reference for DOM IDs, function names, imports):'];

  // Most recent 3 files are most relevant for cross-file consistency
  for (const f of previousFiles.slice(-3)) {
    const cap = Math.min(f.content.length, MAX_PER_FILE);
    if (total + cap > MAX_TOTAL) break;
    const content = cap < f.content.length ? f.content.slice(0, cap) + '\n// ...truncated' : f.content;
    lines.push(`---FILE: ${f.path}---\n${content}\n---END FILE---`);
    total += cap;
  }

  return lines.join('\n\n');
}

/**
 * Builds the prompt for generating a single file.
 */
function buildChunkPrompt(targetPath, plan, userPrompt, previousFiles, mode) {
  const planContext = JSON.stringify({
    game_name:     plan.game_name,
    summary:       plan.summary,
    genre:         plan.genre,
    orientation:   plan.orientation,
    controls:      plan.controls,
    files:         plan.files,
    screens:       plan.screens,
    win_condition: plan.win_condition,
    lose_condition: plan.lose_condition,
    mechanics:     plan.mechanics,
  });

  const prevBlock  = buildPreviousContext(previousFiles);
  const fileRules  = getFileRules(targetPath, plan);
  const genreRules = (plan.genre && targetPath.toLowerCase().includes('game.js'))
    ? '\n\n' + buildGenreRuleBlock(plan.genre)
    : '';
  // 3D mode: use the dedicated 3D system prompt instead of the standard chunk base
  const is3d = mode === '3d';
  const coderSystem3d = promptBuilder.CODER_SYSTEM?.['3d'];
  const systemBase = (is3d && coderSystem3d)
    ? coderSystem3d + `\n\nFILE TO GENERATE: Only generate ${targetPath}. Output: ---FILE: ${targetPath}--- [full content] ---END FILE---`
    : CHUNK_SYSTEM_BASE + fileRules + genreRules;

  return {
    system: systemBase,
    user: `Game request: "${userPrompt}"
Game plan: ${planContext}${prevBlock}

FILE TO GENERATE: ${targetPath}

Generate ONLY ${targetPath}. Complete and working — no TODOs, no placeholders.
Output: ---FILE: ${targetPath}--- [full content] ---END FILE---`,
  };
}

// ── File generation ───────────────────────────────────────────────────────────

/**
 * Parses the first ---FILE: path--- ... ---END FILE--- block from raw AI output.
 */
function parseChunkOutput(raw, targetPath) {
  const match = raw.match(/---FILE:\s*[^\n\r-]+\s*---\r?\n?([\s\S]*?)\r?\n?---END FILE---/);
  if (match) return match[1].trim() || null;

  // Fallback: if no delimiter but content looks reasonable, use it
  const trimmed = raw.trim();
  if (trimmed.length > 30 && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    logger.warn(`chunkedCoder: no delimiter in output for ${targetPath} — using raw content`);
    return trimmed;
  }
  return null;
}

/**
 * Generates one minimal stub when a file completely fails.
 */
function makeStub(filePath, plan) {
  const p = filePath.toLowerCase();
  if (p.endsWith('.md')) return `# ${plan.game_name || 'Game'}\nA mobile HTML5 Canvas game.\nOpen index.html to play.\n`;
  if (p.endsWith('.css')) return `body{margin:0;overflow:hidden;background:#0d0d1a;touch-action:none;-webkit-user-select:none}canvas{display:block;width:100%;height:100%}`;
  if (p.endsWith('.html')) return null; // HTML failure is critical — can't stub
  return `/* ${filePath} — placeholder */`;
}

/**
 * Generates a single game file. Retries once with simplified prompt + Haiku.
 *
 * @returns {Promise<{path: string, content: string}|null>} null only on critical failure
 */
async function generateOneFile(targetPath, plan, userPrompt, previousFiles, mode, costTracker) {
  const claudeModel = (mode === 'fast' || mode === '3d') ? HAIKU_MODEL : SONNET_MODEL;
  const maxTokens   = CHUNK_TOKENS[mode] || 7_000;

  const { system, user } = buildChunkPrompt(targetPath, plan, userPrompt, previousFiles, mode);

  let raw;
  try {
    raw = await withTimeout(
      callClaude(system, user, { maxTokens, model: claudeModel }),
      CHUNK_TIMEOUT_MS,
      `Chunk(${targetPath})`
    );
    if (costTracker) costTracker.record(`chunk:${targetPath}`, system, user, raw);
  } catch (err) {
    logger.warn(`chunkedCoder: ${targetPath} failed (${err.message}), retrying with Haiku`);

    // Retry with Haiku + minimal prompt (more reliable, slightly lower quality)
    const simpleUser =
      `Generate ${targetPath} for a ${plan.genre || 'arcade'} mobile game: "${plan.summary || userPrompt}".\n` +
      `${getFileRules(targetPath, plan)}\n` +
      `Output: ---FILE: ${targetPath}--- [complete content] ---END FILE---`;
    try {
      raw = await withTimeout(
        callClaude(CHUNK_SYSTEM_BASE, simpleUser, { maxTokens: Math.round(maxTokens * 0.6), model: HAIKU_MODEL }),
        60_000,
        `ChunkRetry(${targetPath})`
      );
      if (costTracker) costTracker.record(`chunk-retry:${targetPath}`, CHUNK_SYSTEM_BASE, simpleUser, raw);
    } catch (retryErr) {
      logger.error(`chunkedCoder: ${targetPath} retry also failed: ${retryErr.message}`);
      return null;
    }
  }

  const content = parseChunkOutput(raw, targetPath);
  if (!content) {
    logger.warn(`chunkedCoder: could not parse output for ${targetPath}`);
    return null;
  }

  logger.debug(`chunkedCoder: ${targetPath} generated (${content.length} chars)`);
  return { path: targetPath, content };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Generates a game project file-by-file using separate small API calls.
 * Each call is non-streaming and capped at CHUNK_TOKENS output tokens.
 *
 * @param {string}   userPrompt
 * @param {object}   plan         - from plannerService
 * @param {string}   mode         - 'fast'|'balanced'|'quality'
 * @param {object}   costTracker
 * @param {Function} onProgress   - ({ filesComplete, currentFile, filesTotal }) => void
 * @param {Function} log          - async (msg: string) => void
 * @param {object}   options      - { scopeNote? }
 * @returns {Promise<{projectName: string, files: Array<{path,content}>, _chunked: true}>}
 */
async function runChunkedCoder(userPrompt, plan, mode, costTracker, onProgress, log, options = {}) {
  const planFiles    = Array.isArray(plan.files) && plan.files.length > 0
    ? plan.files
    : ['index.html', 'css/style.css', 'js/game.js'];
  const orderedFiles = orderFiles(planFiles);
  const totalFiles   = orderedFiles.length;

  logger.info(`chunkedCoder: starting ${totalFiles} files mode="${mode}" genre="${plan.genre || 'unknown'}"`);

  const generated = [];
  let failCount = 0;

  for (let i = 0; i < orderedFiles.length; i++) {
    const targetPath = orderedFiles[i];

    // Signal start of this file to the progress system
    if (onProgress) await onProgress({ filesComplete: i, currentFile: targetPath, filesTotal: totalFiles });
    if (log) await log(`Generating ${targetPath} (${i + 1}/${totalFiles})...`);

    const file = await generateOneFile(targetPath, plan, userPrompt, generated, mode, costTracker);

    if (file) {
      generated.push(file);
    } else {
      failCount++;
      logger.warn(`chunkedCoder: ${targetPath} failed — using stub`);
      const stub = makeStub(targetPath, plan);
      if (stub) {
        generated.push({ path: targetPath, content: stub });
      } else {
        logger.error(`chunkedCoder: critical file ${targetPath} has no fallback — skipping`);
      }
    }

    // Signal completion of this file
    if (onProgress) await onProgress({ filesComplete: i + 1, currentFile: null, filesTotal: totalFiles });
  }

  if (failCount > 0 && log) {
    await log(`${totalFiles - failCount}/${totalFiles} files generated (${failCount} used stubs)`);
  }

  const projectName = slugify(userPrompt) || 'generated-game';
  return { projectName, files: generated, _chunked: true };
}

module.exports = { runChunkedCoder };
