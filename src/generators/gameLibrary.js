/**
 * gameLibrary.js
 *
 * Canonical, battle-tested code patterns for common mobile game systems.
 * Injected into coder prompts so the AI uses these exact implementations
 * instead of generating buggy variations from scratch.
 *
 * Each export is a compact JS snippet string.
 * buildGameLibraryBlock() returns the full block for prompt injection.
 */

// ── Score manager ──────────────────────────────────────────────────────────────
const SCORE_MANAGER = `
// Score manager
let score = 0;
let bestScore = parseInt(localStorage.getItem('zyra_best') || '0', 10);
function addScore(n) {
  score += n;
  if (score > bestScore) { bestScore = score; try { localStorage.setItem('zyra_best', bestScore); } catch(_){} }
}
function resetScore() { score = 0; }`.trim();

// ── Health / lives ─────────────────────────────────────────────────────────────
const HEALTH_SYSTEM = `
// Health system
let lives = 3;
let invincible = 0; // invincibility frames (seconds)
function takeDamage() {
  if (invincible > 0) return;
  lives--;
  invincible = 1.2;
  if (lives <= 0) { lives = 0; gameState = 'gameover'; }
}
function resetHealth() { lives = 3; invincible = 0; }`.trim();

// ── Wave spawner ───────────────────────────────────────────────────────────────
const WAVE_SPAWNER = `
// Wave spawner
let wave = 1;
let enemiesLeft = 0;
let spawnTimer = 0;
const SPAWN_INTERVAL = 2.0; // seconds between spawns
function startWave(n) {
  wave = n;
  enemiesLeft = 3 + n * 2;
  spawnTimer = 0;
}
function updateSpawner(dt) {
  if (enemiesLeft <= 0) return;
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = Math.max(0.4, SPAWN_INTERVAL - wave * 0.1);
    spawnEnemy();
    enemiesLeft--;
  }
}`.trim();

// ── Pause / resume ─────────────────────────────────────────────────────────────
const PAUSE_SYSTEM = `
// Pause system
function togglePause() {
  if (gameState === 'playing') { gameState = 'paused'; }
  else if (gameState === 'paused') { gameState = 'playing'; }
}`.trim();

// ── Full game loop (delta-capped rAF) ──────────────────────────────────────────
const GAME_LOOP = `
// Main game loop
let lastTime = 0;
function gameLoop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05); // cap delta at 50ms
  lastTime = ts;
  if (gameState === 'playing') { update(dt); draw(); }
  else { drawUI(); } // always draw UI for menu/pause/gameover
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);`.trim();

// ── Canvas setup ───────────────────────────────────────────────────────────────
const CANVAS_SETUP = `
// Canvas setup
const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('No canvas element');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D not supported');
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();`.trim();

// ── Touch / pointer input ──────────────────────────────────────────────────────
const TAP_INPUT = `
// Tap input
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  const r  = canvas.getBoundingClientRect();
  const tx = (e.clientX - r.left) * (canvas.width  / r.width);
  const ty = (e.clientY - r.top)  * (canvas.height / r.height);
  handleTap(tx, ty);
});`.trim();

// ── Restart / full state reset ─────────────────────────────────────────────────
const RESTART_PATTERN = `
// Restart — full state reset
function restartGame() {
  resetScore();
  resetHealth();
  player.x = canvas.width / 2;
  player.y = canvas.height * 0.75;
  enemies = [];
  bullets = [];
  particles = [];
  wave = 1;
  spawnTimer = 0;
  gameState = 'playing';
}`.trim();

// ── HUD draw helpers ───────────────────────────────────────────────────────────
const HUD_HELPERS = `
// HUD draw helpers
function drawText(text, x, y, size, color, align) {
  ctx.save();
  ctx.font = \`bold \${size}px system-ui, sans-serif\`;
  ctx.fillStyle = color || '#fff';
  ctx.textAlign = align || 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4;
  ctx.fillText(text, x, y);
  ctx.restore();
}
function drawHealthBar(x, y, w, h, current, max, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color || '#51cf66';
  ctx.fillRect(x, y, w * Math.max(0, current / max), h);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.strokeRect(x, y, w, h);
}
function drawButton(x, y, w, h, label, color) {
  ctx.fillStyle = color || 'rgba(108,99,255,0.9)';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x - w/2, y - h/2, w, h, 12)
                : ctx.rect(x - w/2, y - h/2, w, h);
  ctx.fill();
  drawText(label, x, y + 6, 18, '#fff', 'center');
}`.trim();

// ── Asset discipline rules ─────────────────────────────────────────────────────
const ASSET_RULES = `
ASSET DISCIPLINE (non-negotiable):
- Zero external image files — draw everything with canvas API (ctx.arc, ctx.fillRect, ctx.fillText, gradients)
- Zero external audio files — use Web Audio API oscillators for all sounds
- Zero CDN/npm dependencies — use only browser built-ins
- If a feature requires an asset file, replace it with a canvas-drawn equivalent`;

/**
 * Returns a compact game library block suitable for coder prompt injection.
 * Includes canonical patterns for the most common failure points.
 *
 * @param {{ controls?: string }} [options]
 * @returns {string}
 */
function buildGameLibraryBlock(options = {}) {
  return `## CANONICAL GAME PATTERNS (use these exact implementations — do not invent variants)

### Game loop (copy verbatim):
\`\`\`js
${GAME_LOOP}
\`\`\`

### Canvas setup:
\`\`\`js
${CANVAS_SETUP}
\`\`\`

### Input (tap/swipe/drag):
\`\`\`js
${inputSnippet}
\`\`\`

### Score manager:
\`\`\`js
${SCORE_MANAGER}
\`\`\`

### Health system:
\`\`\`js
${HEALTH_SYSTEM}
\`\`\`

### Restart (adapt to your variables, keep the pattern):
\`\`\`js
${RESTART_PATTERN}
\`\`\`

### HUD draw helpers:
\`\`\`js
${HUD_HELPERS}
\`\`\`

${ASSET_RULES}`;
}

module.exports = {
  SCORE_MANAGER,
  HEALTH_SYSTEM,
  WAVE_SPAWNER,
  PAUSE_SYSTEM,
  GAME_LOOP,
  CANVAS_SETUP,
  TAP_INPUT,

  RESTART_PATTERN,
  HUD_HELPERS,
  ASSET_RULES,
  buildGameLibraryBlock,
};
