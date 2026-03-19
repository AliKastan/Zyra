'use strict';

/**
 * Dev Fallback Templates
 *
 * Instant, local, fully playable HTML5 games used when real generation
 * fails. No network calls — deterministic output every time.
 *
 * Usage:
 *   const { getFallbackHtml } = require('./devFallback');
 *   const html = getFallbackHtml('2d');   // or '3d'
 */

// ── 2D Fallback — Dodge Runner ────────────────────────────────────────────────
const FALLBACK_2D = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Dodge Runner</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{background:#0a0a1a;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;overflow:hidden;font-family:system-ui,sans-serif;color:#fff;touch-action:none}
canvas{display:block;max-width:100vw;max-height:100vh}
#ui{position:fixed;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
#screen{background:rgba(10,10,26,.9);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:32px 40px;text-align:center;pointer-events:all;min-width:260px}
#screen h1{font-size:1.8rem;font-weight:800;letter-spacing:-.02em;margin-bottom:6px}
#screen p{color:rgba(255,255,255,.55);font-size:.9rem;margin-bottom:24px;line-height:1.5}
#screen .score-row{font-size:.85rem;color:rgba(255,255,255,.4);margin-bottom:20px}
button{background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;border-radius:12px;padding:14px 36px;font-size:1rem;font-weight:700;cursor:pointer;letter-spacing:.02em;width:100%}
button:active{transform:scale(.97)}
#hud{position:fixed;top:16px;left:0;right:0;display:flex;justify-content:space-between;padding:0 20px;font-size:.85rem;font-weight:600;color:rgba(255,255,255,.7)}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud"><span id="scoreHud">0</span><span id="bestHud">Best: 0</span></div>
<div id="ui"><div id="screen">
  <h1>Dodge Runner</h1>
  <p>Tap or press Space / Arrow keys to jump.<br>Avoid the red blocks.</p>
  <div class="score-row" id="scoreRow"></div>
  <button id="btn">Start</button>
</div></div>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const ui = document.getElementById('ui');
const screen = document.getElementById('screen');
const btn = document.getElementById('btn');
const scoreHud = document.getElementById('scoreHud');
const bestHud = document.getElementById('bestHud');
const scoreRow = document.getElementById('scoreRow');

let W, H, dpr;
function resize() {
  dpr = window.devicePixelRatio || 1;
  W = canvas.width  = window.innerWidth  * dpr;
  H = canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(dpr, dpr);
}
resize();
window.addEventListener('resize', resize);

const GROUND = () => H / dpr * 0.78;
const PLAYER_W = 28, PLAYER_H = 36;
let best = +localStorage.getItem('dodger_best') || 0;
bestHud.textContent = 'Best: ' + best;

let state = 'menu'; // menu | playing | dead
let player, obstacles, score, speed, frame, spawnTimer;

function initGame() {
  player = { x: 60, y: GROUND() - PLAYER_H, vy: 0, jumps: 0, grounded: true, color: '#7c3aed', squish: 1 };
  obstacles = [];
  score = 0;
  speed = 4.5;
  frame = 0;
  spawnTimer = 70;
}

function jump() {
  if (state === 'menu') { startGame(); return; }
  if (state === 'dead') { startGame(); return; }
  if (player.jumps < 2) {
    player.vy = -14;
    player.jumps++;
    player.squish = 0.7;
  }
}

function startGame() {
  initGame();
  state = 'playing';
  ui.style.display = 'none';
}

function spawnObstacle() {
  const h = 28 + Math.random() * 32;
  obstacles.push({ x: W / dpr + 20, y: GROUND() - h, w: 22 + Math.random() * 18, h, color: '#ef4444', speed: speed });
}

function update() {
  if (state !== 'playing') return;
  frame++;
  score = Math.floor(frame / 6);
  speed = 4.5 + score * 0.012;
  scoreHud.textContent = score;

  // Player physics
  player.vy += 0.65;
  player.y += player.vy;
  player.squish = Math.min(1, player.squish + 0.08);

  const gnd = GROUND() - PLAYER_H;
  if (player.y >= gnd) { player.y = gnd; player.vy = 0; player.jumps = 0; player.grounded = true; }
  else player.grounded = false;

  // Spawn
  spawnTimer--;
  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = Math.max(30, 85 - score * 0.15) + Math.random() * 30;
  }

  // Move obstacles
  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].x -= obstacles[i].speed;
    if (obstacles[i].x + obstacles[i].w < 0) obstacles.splice(i, 1);
  }

  // Collision
  const px = player.x + 4, py = player.y + 4, pw = PLAYER_W - 8, ph = PLAYER_H - 4;
  for (const o of obstacles) {
    if (px < o.x + o.w && px + pw > o.x && py < o.y + o.h && py + ph > o.y) {
      state = 'dead';
      if (score > best) { best = score; localStorage.setItem('dodger_best', best); bestHud.textContent = 'Best: ' + best; }
      scoreRow.textContent = 'Score: ' + score + ' · Best: ' + best;
      screen.querySelector('h1').textContent = 'Game Over';
      screen.querySelector('p').textContent = score >= 50 ? 'Nice run! Try to beat it.' : 'Keep going — you\'ll get there.';
      btn.textContent = 'Play Again';
      ui.style.display = 'flex';
      return;
    }
  }
}

function draw() {
  const w = W / dpr, h = H / dpr;
  ctx.clearRect(0, 0, w, h);

  // Ground
  const gY = GROUND();
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fillRect(0, gY, w, 2);

  // Ground pattern
  ctx.strokeStyle = 'rgba(255,255,255,.04)';
  ctx.lineWidth = 1;
  const offset = (frame * (speed / dpr)) % 60;
  for (let x = -offset; x < w; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, gY); ctx.lineTo(x + 30, gY); ctx.stroke();
  }

  // Player
  const px = player.x, py = player.y;
  const sx = 1, sy = player.squish;
  ctx.save();
  ctx.translate(px + PLAYER_W / 2, py + PLAYER_H);
  ctx.scale(sx, sy);
  ctx.translate(-(px + PLAYER_W / 2), -(py + PLAYER_H));
  // Body
  ctx.fillStyle = player.color;
  roundRect(ctx, px, py, PLAYER_W, PLAYER_H, 6);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(px + 7, py + 8, 5, 5);
  ctx.fillRect(px + 16, py + 8, 5, 5);
  ctx.fillStyle = '#000';
  ctx.fillRect(px + 9, py + 10, 3, 3);
  ctx.fillRect(px + 18, py + 10, 3, 3);
  ctx.restore();

  // Obstacles
  for (const o of obstacles) {
    ctx.fillStyle = o.color;
    roundRect(ctx, o.x, o.y, o.w, o.h, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.15)';
    roundRect(ctx, o.x + 3, o.y + 3, o.w - 6, 6, 2);
    ctx.fill();
  }

  // Speed trail particles (decorative)
  ctx.fillStyle = 'rgba(124,58,237,.35)';
  if (state === 'playing' && !player.grounded) {
    for (let i = 1; i <= 3; i++) {
      ctx.fillRect(player.x - i * 10, player.y + PLAYER_H / 2 + (Math.random() - .5) * 6, 6, 3);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// Input
document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
});
document.addEventListener('touchstart', e => { e.preventDefault(); jump(); }, { passive: false });
btn.addEventListener('click', jump);

loop();
</script>
</body>
</html>`;

// ── 3D Fallback — Cube Collect ────────────────────────────────────────────────
const FALLBACK_3D = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Cube Collect 3D</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{background:#060614;overflow:hidden;font-family:system-ui,sans-serif;color:#fff;touch-action:none}
canvas{display:block;width:100vw;height:100vh}
#hud{position:fixed;top:16px;left:0;right:0;display:flex;justify-content:space-between;padding:0 20px;font-size:.9rem;font-weight:700;color:rgba(255,255,255,.8);pointer-events:none}
#ui{position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center}
#screen{background:rgba(6,6,20,.88);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:32px 40px;text-align:center;min-width:260px;backdrop-filter:blur(20px)}
#screen h1{font-size:1.8rem;font-weight:800;margin-bottom:8px}
#screen p{color:rgba(255,255,255,.5);font-size:.9rem;margin-bottom:24px;line-height:1.5}
button{background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;border:none;border-radius:12px;padding:14px 36px;font-size:1rem;font-weight:700;cursor:pointer;width:100%}
button:active{transform:scale(.97)}
#dpad{position:fixed;bottom:32px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:56px 56px 56px;grid-template-rows:56px 56px 56px;gap:6px;opacity:.75}
#dpad button{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:12px;color:#fff;font-size:1.4rem;cursor:pointer;display:flex;align-items:center;justify-content:center;width:56px;height:56px;padding:0;transition:background .1s}
#dpad button:active{background:rgba(255,255,255,.28)}
.d-empty{background:transparent!important;border:none!important;pointer-events:none}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud"><span id="scoreHud">Score: 0</span><span id="bestHud">Best: 0</span><span id="timerHud">60s</span></div>
<div id="ui"><div id="screen">
  <h1>Cube Collect</h1>
  <p>Move your cube to collect the glowing orbs.<br>D-pad, WASD or arrow keys.</p>
  <button id="btn">Start Game</button>
</div></div>
<div id="dpad" style="display:none">
  <div class="d-empty"></div>
  <button id="dUp">▲</button>
  <div class="d-empty"></div>
  <button id="dLeft">◀</button>
  <div class="d-empty"></div>
  <button id="dRight">▶</button>
  <div class="d-empty"></div>
  <button id="dDown">▼</button>
  <div class="d-empty"></div>
</div>
<script>
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
const ui     = document.getElementById('ui');
const screen = document.getElementById('screen');
const btn    = document.getElementById('btn');
const dpad   = document.getElementById('dpad');
const scoreHud = document.getElementById('scoreHud');
const bestHud  = document.getElementById('bestHud');
const timerHud = document.getElementById('timerHud');

let W, H;
function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
resize(); window.addEventListener('resize', resize);

let best = +localStorage.getItem('cubecollect_best') || 0;
bestHud.textContent = 'Best: ' + best;

// ── Simple isometric 3D helpers ───────────────────────────────────────────────
const ISO_X = 0.866, ISO_Y = 0.5; // cos30, sin30
function isoProject(x, y, z) {
  return {
    sx: (x - z) * ISO_X,
    sy: (x + z) * ISO_Y - y,
  };
}

function drawCube(cx, cy, cz, size, hue, lit) {
  const hs = size / 2;
  // 8 corners (local space)
  const corners = [
    [cx-hs, cy,      cz-hs],
    [cx+hs, cy,      cz-hs],
    [cx+hs, cy,      cz+hs],
    [cx-hs, cy,      cz+hs],
    [cx-hs, cy-size, cz-hs],
    [cx+hs, cy-size, cz-hs],
    [cx+hs, cy-size, cz+hs],
    [cx-hs, cy-size, cz+hs],
  ].map(([x,y,z]) => {
    const p = isoProject(x, y, z);
    return [W/2 + p.sx, H/2 + p.sy];
  });

  const sat = lit ? '75%' : '55%';
  // Top face
  ctx.beginPath();
  ctx.moveTo(...corners[4]); ctx.lineTo(...corners[5]);
  ctx.lineTo(...corners[6]); ctx.lineTo(...corners[7]); ctx.closePath();
  ctx.fillStyle = 'hsl(' + hue + ',' + sat + ',' + (lit ? 65 : 48) + '%)';
  ctx.fill();
  // Left face
  ctx.beginPath();
  ctx.moveTo(...corners[0]); ctx.lineTo(...corners[4]);
  ctx.lineTo(...corners[7]); ctx.lineTo(...corners[3]); ctx.closePath();
  ctx.fillStyle = 'hsl(' + hue + ',' + sat + ',' + (lit ? 50 : 36) + '%)';
  ctx.fill();
  // Right face
  ctx.beginPath();
  ctx.moveTo(...corners[1]); ctx.lineTo(...corners[5]);
  ctx.lineTo(...corners[6]); ctx.lineTo(...corners[2]); ctx.closePath();
  ctx.fillStyle = 'hsl(' + hue + ',' + sat + ',' + (lit ? 42 : 28) + '%)';
  ctx.fill();
}

function drawOrb(cx, cy, cz, r, hue, t) {
  const p = isoProject(cx, cy - r, cz);
  const sx = W/2 + p.sx, sy = H/2 + p.sy;
  const pulse = 0.85 + Math.sin(t * 4) * 0.15;
  const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * pulse * 22);
  grad.addColorStop(0,   'hsl(' + hue + ',100%,90%)');
  grad.addColorStop(0.4, 'hsl(' + hue + ',90%,65%)');
  grad.addColorStop(1,   'hsla(' + hue + ',80%,50%,0)');
  ctx.beginPath();
  ctx.arc(sx, sy, r * pulse * 22, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
}

// ── Game state ────────────────────────────────────────────────────────────────
const GRID = 5;
let player, orbs, score, timeLeft, state, t, keys;

function initGame() {
  player = { x: 0, z: 0, vy: 0, y: 0, hue: 260 };
  orbs = [];
  score = 0; timeLeft = 60; state = 'playing'; t = 0;
  keys = {};
  for (let i = 0; i < 5; i++) spawnOrb();
}

function spawnOrb() {
  const hues = [180, 60, 340, 120, 280];
  orbs.push({
    x: (Math.floor(Math.random() * (GRID*2+1)) - GRID) * 30,
    z: (Math.floor(Math.random() * (GRID*2+1)) - GRID) * 30,
    y: 0, hue: hues[Math.floor(Math.random() * hues.length)],
    alive: true,
  });
}

const MOVE_SPEED = 2.8;
let lastTime = 0;
let moveAcc = { x: 0, z: 0 };

function update(dt) {
  if (state !== 'playing') return;
  t += dt;
  timeLeft -= dt;
  if (timeLeft <= 0) { timeLeft = 0; endGame(); return; }

  // Input
  let dx = 0, dz = 0;
  if (keys['w'] || keys['arrowup']    || keys['dUp'])    dz -= 1;
  if (keys['s'] || keys['arrowdown']  || keys['dDown'])  dz += 1;
  if (keys['a'] || keys['arrowleft']  || keys['dLeft'])  dx -= 1;
  if (keys['d'] || keys['arrowright'] || keys['dRight'])  dx += 1;

  if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }
  player.x += dx * MOVE_SPEED;
  player.z += dz * MOVE_SPEED;

  // Clamp
  const bound = GRID * 30 + 10;
  player.x = Math.max(-bound, Math.min(bound, player.x));
  player.z = Math.max(-bound, Math.min(bound, player.z));

  // Bobbing
  player.y = Math.abs(Math.sin(t * 3)) * (dx || dz ? 8 : 2);

  // Collect orbs
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    const dist = Math.hypot(player.x - o.x, player.z - o.z);
    if (dist < 22) { orbs.splice(i, 1); score++; spawnOrb(); if (score > best) { best = score; localStorage.setItem('cubecollect_best', best); } }
  }

  scoreHud.textContent = 'Score: ' + score;
  bestHud.textContent  = 'Best: ' + best;
  timerHud.textContent = Math.ceil(timeLeft) + 's';
}

function endGame() {
  state = 'dead';
  screen.querySelector('h1').textContent = 'Time\'s Up!';
  screen.querySelector('p').textContent  = 'Score: ' + score + '  ·  Best: ' + best;
  btn.textContent = 'Play Again';
  ui.style.display = 'flex';
  dpad.style.display = 'none';
}

function startGame() {
  initGame();
  ui.style.display = 'none';
  dpad.style.display = 'grid';
}

// ── Ground tiles ──────────────────────────────────────────────────────────────
function drawGround() {
  for (let ix = -GRID; ix <= GRID; ix++) {
    for (let iz = -GRID; iz <= GRID; iz++) {
      const wx = ix * 30, wz = iz * 30;
      const p = isoProject(wx, 0, wz);
      const sx = W/2 + p.sx, sy = H/2 + p.sy;
      // simple rhombus tile
      ctx.beginPath();
      const ts = 14;
      ctx.moveTo(sx,      sy - ts * ISO_Y * 2);
      ctx.lineTo(sx + ts * ISO_X, sy);
      ctx.lineTo(sx,      sy + ts * ISO_Y * 2);
      ctx.lineTo(sx - ts * ISO_X, sy);
      ctx.closePath();
      const light = (Math.abs(ix) + Math.abs(iz)) % 2 === 0;
      ctx.fillStyle = light ? 'rgba(80,80,160,.25)' : 'rgba(40,40,100,.2)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(100,100,200,.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);

  // Gradient background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#060614'); bg.addColorStop(1, '#0e0e2a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  for (let i = 0; i < 60; i++) {
    const sx = ((i * 137.508) % W), sy = ((i * 97.3) % (H * 0.5));
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }

  drawGround();

  // Sort by draw order (back to front in iso space)
  const allObjs = [
    ...orbs.map(o => ({ ...o, isOrb: true, sortKey: o.x + o.z })),
    { ...player, isPlayer: true, sortKey: player.x + player.z },
  ].sort((a, b) => a.sortKey - b.sortKey);

  for (const obj of allObjs) {
    if (obj.isOrb)    drawOrb(obj.x, obj.y, obj.z, 0.5, obj.hue, t);
    if (obj.isPlayer) drawCube(obj.x, obj.y, obj.z, 26, obj.hue, true);
  }
}

// ── Loop ──────────────────────────────────────────────────────────────────────
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ── Input ─────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault(); });
document.addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

['Up','Down','Left','Right'].forEach(dir => {
  const el = document.getElementById('d' + dir);
  if (!el) return;
  el.addEventListener('touchstart', e => { e.preventDefault(); keys['d' + dir] = true; }, { passive: false });
  el.addEventListener('touchend',   e => { e.preventDefault(); keys['d' + dir] = false; }, { passive: false });
  el.addEventListener('mousedown',  () => keys['d' + dir] = true);
  el.addEventListener('mouseup',    () => keys['d' + dir] = false);
});

btn.addEventListener('click', () => { if (state !== 'playing') startGame(); });

requestAnimationFrame(loop);
</script>
</body>
</html>`;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a fully playable HTML string for the given game mode.
 * @param {'2d'|'3d'} mode
 * @returns {string} complete HTML page
 */
function getFallbackHtml(mode) {
  return mode === '3d' ? FALLBACK_3D : FALLBACK_2D;
}

/**
 * Returns the fallback as a { files: [{ path, content }] } object
 * compatible with the generation pipeline's output format.
 * @param {'2d'|'3d'} mode
 * @param {string} [slug]
 * @returns {{ files: Array<{path:string,content:string}>, _fallback: true, _fallbackMode: string }}
 */
function getFallbackFiles(mode, slug) {
  const html = getFallbackHtml(mode);
  return {
    files:         [{ path: 'index.html', content: html }],
    projectName:   slug || (mode === '3d' ? 'cube-collect-3d' : 'dodge-runner-2d'),
    _fallback:     true,
    _fallbackMode: mode,
  };
}

module.exports = { getFallbackHtml, getFallbackFiles };