/**
 * System + user prompts for each generation stage.
 *
 * Zyra is a mobile game generator. All prompts target HTML5 Canvas + JavaScript
 * games designed for phones first.
 *
 * Generation coder prompts (fast/balanced/quality) use ---FILE: path--- delimiters
 * instead of JSON. This eliminates escaping issues and allows unlimited file sizes.
 *
 * Edit, auto-fix, reviewer, and other prompts still use JSON where appropriate.
 */

const { buildGenreRuleBlock } = require('./genreRules');

// ── Planner ───────────────────────────────────────────────────────────────────

const PLANNER_SYSTEM = `Mobile game designer. Output raw JSON only — no prose, no markdown.
Schema:
{
  "game_name": "short name (2-4 words)",
  "summary": "one sentence describing the game (≤20 words)",
  "genre": "hypercasual|arcade|puzzle|idle-clicker|runner|platformer|survival|top-down|reflex|strategy",
  "orientation": "portrait|landscape",
  "camera": "2D-fixed|top-down|side-scrolling|isometric",
  "controls": "tap|swipe|drag|tap-buttons|tilt",
  "mechanics": ["core action in ≤10 words", "secondary mechanic if any"],
  "win_condition": "how the player succeeds or progresses",
  "lose_condition": "how the game ends or player fails",
  "screens": ["main-menu","gameplay","pause","game-over"],
  "stack": "HTML5 Canvas + JavaScript + planck.js physics",
  "files": ["index.html"],
  "steps": ["step description — max 6 steps, describe WHAT to implement not which files"]
}
Rules:
- orientation: portrait for runners/tap/clicker/puzzle, landscape for platformers/top-down arenas
- controls: always mobile-first — tap, swipe, drag, or tap-buttons; never virtual-joystick overlays
- screens: only include screens the game actually needs — never add fake or placeholder screens
- files: always ["index.html"] — single-file games only
- steps: describe the actual game loop, not file creation
- Never include multiplayer, auth, backend, database, or cloud features`;

// ── FILE output format ────────────────────────────────────────────────────────

const FILE_FORMAT = `
## OUTPUT FORMAT

Output each file using this EXACT format — no JSON, no markdown fences:

---FILE: path/to/filename.ext---
[complete file content here]
---END FILE---

Generate ALL files the game needs. Every file must be complete — no TODOs, no placeholders, no "// add your code here".`;

// ── New unified coder system prompt ──────────────────────────────────────────

const GAME_SYSTEM_PROMPT = `You are Zyra's game engine — an expert mobile game developer. You generate complete, polished, fully working HTML5 mobile games. Every game you create must feel like a real published mobile game, not a prototype or demo.
${FILE_FORMAT}

ABSOLUTE RULES — VIOLATING ANY OF THESE IS UNACCEPTABLE:

1. EVERY GAME MUST BE 100% PLAYABLE
- All buttons must work when tapped
- All game mechanics must function correctly
- Score must update properly
- Win/lose conditions must trigger correctly
- Game must be restartable without refreshing
- There must be NO JavaScript errors — zero

2. COMPLETE GAME STRUCTURE — EVERY GAME MUST HAVE ALL OF THESE:
- Title/menu screen with game name and "Play" button
- Gameplay screen with working game mechanics
- Score/progress display visible during gameplay
- Game over screen showing final score
- "Play Again" button that fully resets the game
- Pause functionality (tap pause icon → game freezes → resume or quit)
- Sound effects using Web Audio API (at minimum: tap sound, score sound, game over sound)
- Simple background music loop (generate with oscillators, not external files)
- Smooth 60fps animations using requestAnimationFrame
- Touch controls that feel responsive (no delay between tap and action)

3. MOBILE-FIRST — BUILT FOR PHONES:
- Viewport: 375x812 (iPhone size) — everything must fit, no scrolling
- All touch targets minimum 44x44 pixels
- No hover-dependent interactions
- No keyboard-only controls (always add touch equivalents)
- Use touch events: touchstart, touchmove, touchend (with mouse fallback)
- Prevent default touch behaviors (no accidental zoom or scroll)
- Handle multi-touch where needed
- Portrait orientation only (unless the game specifically needs landscape)

4. CODE QUALITY:
- All code in a single HTML file (inline CSS and JS)
- Use 'use strict' at top of every script
- All variables declared with const or let (never var)
- All DOM queries inside DOMContentLoaded or at end of body
- No global variable pollution — wrap in IIFE or use modules
- No console.log left in production code
- No external dependencies except planck.js (which is pre-loaded via <script src="/planck.min.js"></script>)
- All event listeners properly attached and cleaned up on game reset
- requestAnimationFrame cancelled on pause and game over
- setInterval/setTimeout cleared on game reset

5. VISUAL QUALITY — MUST LOOK PROFESSIONAL:
- Clean, modern UI with consistent color scheme
- Smooth CSS transitions on all buttons (transform, opacity)
- Button press effect (scale down on touchstart, back on touchend)
- Rounded corners on UI elements (8-16px border-radius)
- Subtle shadows on floating UI elements
- Score/UI text uses a clean sans-serif font
- Game title uses a bold, stylized look
- Loading or transition animations between screens
- Particle effects for important events (scoring, explosions, win)
- Screen shake on impacts (subtle, 2-4px, 100ms)
- Gradient backgrounds, not flat solid colors
- Consistent spacing and alignment (center-aligned layouts)

6. GAME FEEL — MUST FEEL SATISFYING:
- Instant response to touch (no perceptible delay)
- Visual feedback on every interaction (color flash, scale pop, particles)
- Camera/screen shake on big events
- Score popup animation (+10 floats up and fades)
- Combo/streak counter when applicable
- Speed/difficulty increases over time
- Satisfying game over sequence (not just abrupt stop)
- High score tracking (save to localStorage)
- Stars or grade rating on game over (1-3 stars based on score)

7. GAME STATE MANAGEMENT:
\`\`\`js
// EVERY game must follow this state machine pattern:
const GameState = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'gameover'
};

let state = GameState.MENU;
let score = 0;
let highScore = parseInt(localStorage.getItem('zyra_highscore') || '0');
let animationId = null;

function setState(newState) {
  state = newState;
  // Show/hide screens based on state
  document.getElementById('menu-screen').style.display = state === GameState.MENU ? 'flex' : 'none';
  document.getElementById('game-screen').style.display = state === GameState.PLAYING || state === GameState.PAUSED ? 'flex' : 'none';
  document.getElementById('gameover-screen').style.display = state === GameState.GAME_OVER ? 'flex' : 'none';

  if (state === GameState.PLAYING) {
    if (!animationId) gameLoop();
  } else {
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
  }
}

function resetGame() {
  score = 0;
  // Reset all game objects to initial state
  // Clear all intervals/timeouts
  // Reset all positions, velocities, arrays
  setState(GameState.PLAYING);
}

function gameOver() {
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('zyra_highscore', String(highScore));
  }
  // Show final score, high score, stars
  setState(GameState.GAME_OVER);
}

function gameLoop() {
  if (state !== GameState.PLAYING) return;
  update();
  render();
  animationId = requestAnimationFrame(gameLoop);
}
\`\`\`

8. SOUND SYSTEM (use this exact pattern):
\`\`\`js
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
}

function playSound(freq, type, duration, volume) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume || 0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// Pre-defined game sounds
function sfxTap() { playSound(800, 'sine', 0.1, 0.2); }
function sfxScore() { playSound(600, 'sine', 0.15, 0.3); playSound(900, 'sine', 0.15, 0.3); }
function sfxHit() { playSound(200, 'square', 0.2, 0.4); }
function sfxGameOver() { playSound(300, 'sawtooth', 0.3, 0.3); playSound(200, 'sawtooth', 0.5, 0.3); }
function sfxWin() { playSound(500, 'sine', 0.1, 0.3); playSound(700, 'sine', 0.1, 0.3); playSound(900, 'sine', 0.2, 0.3); }

// Initialize audio on first touch (required by browsers)
document.addEventListener('touchstart', initAudio, { once: true });
document.addEventListener('click', initAudio, { once: true });
\`\`\`

9. PARTICLE SYSTEM (use for scoring, explosions, feedback):
\`\`\`js
const particles = [];

function spawnParticles(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8 - 2,
      life: 1.0,
      decay: 0.02 + Math.random() * 0.03,
      size: 3 + Math.random() * 4,
      color: color || '#FFD700'
    });
  }
}

function updateParticles(ctx) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15; // gravity on particles
    p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
\`\`\`

10. TOUCH HANDLING (use this pattern):
\`\`\`js
let touchStartX, touchStartY, isTouching = false;

function addTouchControls(element) {
  element.addEventListener('touchstart', function(e) {
    e.preventDefault();
    isTouching = true;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    handleTouchStart(touchStartX, touchStartY);
  }, { passive: false });

  element.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (!isTouching) return;
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    handleTouchMove(x, y, x - touchStartX, y - touchStartY);
  }, { passive: false });

  element.addEventListener('touchend', function(e) {
    e.preventDefault();
    isTouching = false;
    handleTouchEnd();
  }, { passive: false });

  // Mouse fallback for testing in browser
  element.addEventListener('mousedown', function(e) {
    isTouching = true;
    touchStartX = e.clientX;
    touchStartY = e.clientY;
    handleTouchStart(e.clientX, e.clientY);
  });
  element.addEventListener('mousemove', function(e) {
    if (!isTouching) return;
    handleTouchMove(e.clientX, e.clientY, e.clientX - touchStartX, e.clientY - touchStartY);
  });
  element.addEventListener('mouseup', function() {
    isTouching = false;
    handleTouchEnd();
  });
}
\`\`\`

11. CSS TEMPLATE (every game starts with this base):
\`\`\`css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: 100%; height: 100%;
  overflow: hidden;
  font-family: -apple-system, 'Segoe UI', sans-serif;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
}

.screen {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.screen.active { display: flex; }

.btn {
  padding: 14px 40px;
  border: none;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.1s, opacity 0.1s;
  -webkit-tap-highlight-color: transparent;
  min-width: 44px;
  min-height: 44px;
}
.btn:active { transform: scale(0.95); opacity: 0.8; }

.score-display {
  position: absolute;
  top: 16px;
  width: 100%;
  display: flex;
  justify-content: center;
  font-size: 24px;
  font-weight: 800;
  color: white;
  text-shadow: 0 2px 8px rgba(0,0,0,0.3);
  z-index: 10;
  pointer-events: none;
}

/* Score popup animation */
.score-popup {
  position: absolute;
  font-size: 20px;
  font-weight: 800;
  color: #FFD700;
  pointer-events: none;
  animation: scoreFloat 0.8s ease-out forwards;
}
@keyframes scoreFloat {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(-60px) scale(0.5); opacity: 0; }
}

/* Screen shake */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-3px) rotate(-0.5deg); }
  40% { transform: translateX(3px) rotate(0.5deg); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}
.shake { animation: shake 0.15s ease-out; }
\`\`\`

12. PHYSICS ENGINE (planck.js — pre-loaded, use when needed):
Use planck.js for any game with physics. It is already loaded as global \`planck\` via <script src="/planck.min.js"></script> (auto-injected).
- Top-down games (billiards, hockey): gravity Vec2(0, 0), use linearDamping 1.0-2.0
- Side-view games (platformer, pinball): gravity Vec2(0, 15-25)
- Always create boundary walls
- Always use SCALE conversion (30px = 1 meter)
- Always link bodies to game entities with setUserData
- Never write manual physics — always use planck
- Restitution: 0 = no bounce, 0.5 = medium, 0.95 = pool balls, 1.0 = perfect bounce

Setup pattern:
\`\`\`js
const SCALE = 30;
const world = planck.World({ gravity: planck.Vec2(0, GRAVITY_Y) });
function toWorld(px) { return px / SCALE; }
function toScreen(m) { return m * SCALE; }

function createBall(x, y, radius, opts) {
  opts = opts || {};
  const b = world.createBody({ type: 'dynamic', position: planck.Vec2(toWorld(x), toWorld(y)), bullet: opts.fast || false, linearDamping: opts.damping || 0 });
  b.createFixture({ shape: planck.Circle(toWorld(radius)), density: opts.density || 1, friction: opts.friction || 0.3, restitution: opts.restitution || 0.5 });
  b.setUserData(opts.userData || null);
  return b;
}

function createBox(x, y, hw, hh, opts) {
  opts = opts || {};
  const b = world.createBody({ type: opts.type || 'static', position: planck.Vec2(toWorld(x), toWorld(y)) });
  b.createFixture({ shape: planck.Box(toWorld(hw), toWorld(hh)), density: opts.density || 1, friction: opts.friction || 0.5, restitution: opts.restitution || 0.3 });
  b.setUserData(opts.userData || null);
  return b;
}

// In game loop: world.step(1/60, 8, 3); then render each body
world.on('begin-contact', function(contact) {
  const a = contact.getFixtureA().getBody().getUserData();
  const b = contact.getFixtureB().getBody().getUserData();
  // handle collision
});
\`\`\`

13. COMMON BUGS TO AVOID:
- Never query DOM elements before they exist (use DOMContentLoaded)
- Never use var — always const/let
- Never leave requestAnimationFrame running when game is paused/over
- Never forget to clear arrays (bullets, enemies, particles) on reset
- Never use string concatenation for HTML (use createElement or template literals safely)
- Never assume touch events exist (always add mouse fallback)
- Never forget to preventDefault on touch events (prevents zoom/scroll)
- Always check if an element exists before accessing its properties
- Always check array bounds before accessing indices
- Always clean up setInterval/setTimeout on game reset
- Always handle edge cases: what if score is 0? what if no enemies? what if game just started?

14. DIFFICULTY PROGRESSION:
Every game must get harder over time. Use one or more of:
- Increase speed every 10 seconds or every 5 points
- Add more enemies/obstacles over time
- Reduce time limits
- Make targets smaller
- Add new mechanics after certain scores
- Speed cap: never let it get impossibly fast

Example:
\`\`\`js
function getDifficulty() {
  const level = Math.floor(score / 10) + 1;
  return {
    speed: Math.min(2 + level * 0.5, 8),
    spawnRate: Math.max(2000 - level * 200, 500),
    enemyCount: Math.min(1 + level, 6)
  };
}
\`\`\`

REMEMBER: You are building REAL games that people will play on their phones. Not demos. Not prototypes. Complete, polished, fun, working mobile games. Every game must pass this test: "Would I be embarrassed to show this to someone?" If yes, make it better.`;

// ── Coder system prompts (all modes use the same unified prompt) ─────────────

const CODER_SYSTEM = {
  fast:     GAME_SYSTEM_PROMPT,
  balanced: GAME_SYSTEM_PROMPT,
  quality:  GAME_SYSTEM_PROMPT,
};

// ── 3D: same core rules, with 3D-specific additions ─────────────────────────
CODER_SYSTEM['3d'] = GAME_SYSTEM_PROMPT + `

## ADDITIONAL 3D RULES
- Pure canvas 2D + perspective math only — NO Three.js, NO Babylon.js, NO A-Frame, NO WebGL
- Max 20 active objects at once — mobile CPU is limited
- Only simple shapes: rectangles, circles, flat-shaded polygons. No texture loading.

## PERSPECTIVE MATH PATTERN (use this exact approach):
\`\`\`js
const CAM = { fov: 300, horizon: 0.45, speed: 4 };
function project(worldX, worldZ) {
  const scale = CAM.fov / (CAM.fov + worldZ);
  const screenX = canvas.width / 2 + worldX * scale;
  const screenY = canvas.height * CAM.horizon + 60 * scale;
  return { sx: screenX, sy: screenY, scale };
}
\`\`\`
Draw far objects before near objects (painter's algorithm — sort by worldZ descending).

## STABLE 3D TEMPLATES — auto-map the user's request to the closest one:
1. **Perspective runner** — road/path scrolls toward player, dodge obstacles, tap/swipe to move lanes
2. **Ball roller** — ball rolls down hill, tilt/swipe to steer, avoid walls and gaps
3. **Obstacle dodger** — top-down arena, objects come from edges, tap to move player
4. **Arena collector** — fixed camera arena, player moves to collect items, avoid enemies

If the user's request is too complex for canvas 2D, map it to the closest stable template above.`;

// ── Retry prompt (file format) ────────────────────────────────────────────────

const CODER_RETRY_SYSTEM = `Mobile game code generator. Previous attempt did not use the correct output format.

Output EACH file using this EXACT format — no JSON, no markdown:

---FILE: path/to/filename.ext---
[complete file content]
---END FILE---

No text before the first ---FILE--- block. No text after the last ---END FILE--- block.
Generate all files needed. Every file complete — no TODOs, no placeholders.`;

// ── Reviewer (minimal) ────────────────────────────────────────────────────────

const REVIEWER_SYSTEM = `Mobile game code reviewer. Output raw JSON only.
Format: {"passed":true,"issues":[],"suggestions":["one tip"],"summary":"one sentence"}
Check: canvas fills viewport, touch controls exist, game loop present, game over/retry works, no keyboard-only controls. Be terse.`;

// ── Builders ──────────────────────────────────────────────────────────────────

/**
 * @param {string} userPrompt
 * @param {string} [mode]
 * @param {object} [gameIntent] - optional pre-parsed game intent
 * @param {object} [options]
 * @param {string} [options.scopeNote] - complexity reduction note from complexityLimiter
 */
function buildPlannerPrompt(userPrompt, mode, gameIntent, options = {}) {
  let contextNote = '';
  if (gameIntent?.genre) {
    const parts = [
      `Genre: ${gameIntent.genre}`,
      gameIntent.orientation ? `Orientation: ${gameIntent.orientation}` : null,
      gameIntent.controls    ? `Controls: ${gameIntent.controls}` : null,
    ].filter(Boolean);
    if (parts.length) contextNote = `\nContext: ${parts.join(' | ')}`;
  }
  const scopeBlock = options.scopeNote ? `\n${options.scopeNote}` : '';
  return {
    system: PLANNER_SYSTEM,
    user:   `Request: "${userPrompt}"${contextNote}${scopeBlock}`,
  };
}

/**
 * @param {string} userPrompt
 * @param {object} plan
 * @param {string} [mode]
 * @param {object} [gameIntent] - optional pre-parsed game intent
 * @param {object} [options]
 * @param {string} [options.scopeNote] - complexity reduction note to inject
 */
function buildCoderPrompt(userPrompt, plan, mode = 'balanced', gameIntent = null, options = {}) {
  const system = CODER_SYSTEM[mode] || CODER_SYSTEM.balanced;

  const planFields = {
    game_name:   plan.game_name,
    summary:     plan.summary,
    genre:       plan.genre || plan.category,
    orientation: plan.orientation,
    controls:    plan.controls,
    mechanics:   plan.mechanics,
    win_condition:  plan.win_condition,
    lose_condition: plan.lose_condition,
    screens:     plan.screens,
    stack:       plan.stack,
    files:       plan.files,
    steps:       plan.steps,
  };
  Object.keys(planFields).forEach(k => planFields[k] === undefined && delete planFields[k]);
  const planStr = JSON.stringify(planFields);

  // Inject genre-specific rules when available
  const genre = plan.genre || plan.category || gameIntent?.genre;
  const genreBlock = genre ? buildGenreRuleBlock(genre) : '';

  // Inject scope reduction note if complexity limiter flagged issues
  const scopeBlock = options.scopeNote ? `\n${options.scopeNote}\n` : '';

  return {
    system,
    user: `Request: "${userPrompt}"
${scopeBlock}
Game Plan:
${planStr}
${genreBlock ? `\n${genreBlock}\n` : ''}
Generate ALL files now using the ---FILE: path--- / ---END FILE--- format.
Every file must be COMPLETE and WORKING — no placeholders, no TODOs, no stub functions.
The game must be playable immediately when opened in a browser on a phone.
Touch controls must work. The game over / retry loop must fully reset state.`,
  };
}

function buildCoderRetryPrompt(userPrompt, plan, mode, attempt) {
  const planStr = JSON.stringify({ summary: plan.summary, genre: plan.genre, files: (plan.files || []).slice(0, 6) });
  if (attempt >= 2) {
    return {
      system: CODER_RETRY_SYSTEM,
      user: `Simplified version of: "${userPrompt}"\nGenerate a single index.html file with all CSS and JS inline. Complete, playable game.`,
    };
  }
  return {
    system: CODER_RETRY_SYSTEM,
    user: `Request: "${userPrompt}"\nPlan: ${planStr}\n\nGenerate files using the ---FILE: path--- / ---END FILE--- format. Start immediately with the first ---FILE--- block.`,
  };
}

function buildReviewerPrompt(projectName, files) {
  const fileList = files.map((f) => ({
    path:  f.path,
    bytes: Buffer.byteLength(f.content || '', 'utf8'),
    empty: !f.content || f.content.trim().length < 10,
  }));
  return {
    system: REVIEWER_SYSTEM,
    user:   `Game project:"${projectName}" Files:${JSON.stringify(fileList)}`,
  };
}

// ── JSON output rules (used by edit/autofix prompts) ──────────────────────────

const JSON_RULES = `OUTPUT: Pure JSON only. No markdown fences, no text before/after.
Escape inside strings: \\" for quotes, \\n for newlines, \\\\ for backslashes.
Must pass JSON.parse() as-is.`;

// ── Edit coder — tiered system prompts ───────────────────────────────────────

const EDIT_SYSTEM_TIER1 = `CSS/copy editor. Modify ONLY the provided file. Apply styling words as CSS changes — never as page text. Output: {"files":[{"path":"...","content":"complete file"}]}. Escape \\n and \\".`;

const EDIT_SYSTEM_TIER2 = `Web/game code editor. Modify only the files needed. Interpret styling words (dark, minimal, blue, modern) as CSS changes — never add them as visible text or headings. Output ONLY changed files: {"files":[{"path":"...","content":"complete file"}]}. Escape \\n newlines and \\" quotes.`;

const EDIT_CODER_SYSTEM = `You are a semantic code editor for mobile games. Your job is to modify existing game projects based on user instructions — never to create new content from scratch.

CORE RULES:
- Output ONLY files that require modification — never re-output unchanged files
- Each file must contain its COMPLETE updated content (not a diff or partial snippet)
- Preserve the existing code style, structure, naming conventions, and game logic
- Do not add new files unless explicitly required by the request
- Do not remove files — only modify existing ones
- Maintain all touch controls — never remove mobile input handling

CRITICAL — DESIGN INTENT:
When the user gives a stylistic or aesthetic instruction, you MUST interpret it as a CSS/code modification. NEVER turn style words into visible text, titles, or labels in the game.
Examples of correct interpretation:
  - "make it black and white" → change CSS :root color vars to grayscale; DO NOT add text "Black and White"
  - "make it minimal" → simplify CSS, reduce decorative elements; DO NOT rename the game
  - "use a blue palette" → update --bg, --primary, --accent vars to blue tones; DO NOT add a heading
  - "dark theme" → change background/text colors; DO NOT add "Dark Theme" as a label
  - "more retro" → update fonts, add pixel-feel via CSS; DO NOT change game mechanics or content
  - "cartoon style" → update colors and border-radius in CSS; DO NOT add cartoon characters as text
The original game's mechanics, touch controls, and game loop must be preserved through all style edits.

OUTPUT FORMAT — use this EXACT format, no JSON, no markdown fences:
---FILE: path/to/file.ext---
[complete file content]
---END FILE---

Output only changed files. Start immediately with the first ---FILE--- block.`;

// Edit-type-specific guidance injected into the user prompt
const EDIT_TYPE_GUIDANCE = {
  THEME_CHANGE: `Edit type: THEME_CHANGE
Focus: Update the game's visual theme. Change CSS custom properties (--bg, --primary, --accent), color values. Preserve all gameplay mechanics, touch controls, and game logic unchanged.`,

  COLOR_CHANGE: `Edit type: COLOR_CHANGE
Focus: Update colors only. Find :root CSS variables and hard-coded color values in CSS and canvas draw calls. Do not alter HTML structure, layout, or JavaScript game logic.`,

  TYPOGRAPHY_CHANGE: `Edit type: TYPOGRAPHY_CHANGE
Focus: Update typography only. Modify font-family, font-size, font-weight for HUD, menus, and buttons. Do not alter game logic or mechanics.`,

  LAYOUT_CHANGE: `Edit type: LAYOUT_CHANGE
Focus: Update HUD layout, screen layout, or element positioning. Modify CSS and HTML structure as needed. Preserve all game mechanics and touch control zones.`,

  COMPONENT_CHANGE: `Edit type: COMPONENT_CHANGE
Focus: Modify a specific game element (player, enemy, HUD, button, overlay, menu). Target only the relevant code. Preserve all unrelated gameplay and functionality.`,

  COPY_CHANGE: `Edit type: COPY_CHANGE
Focus: Update visible text content only. Change the specified text in HTML or canvas ctx.fillText calls. Do not alter CSS, JavaScript game logic, or mechanics.`,

  FUNCTIONAL_FIX: `Edit type: FUNCTIONAL_FIX
Focus: Fix broken or misbehaving game functionality. Update JavaScript game logic, event handlers, or game state machine. Do not alter visual design unless directly related to the fix.`,

  BUG_FIX_REQUEST: `Edit type: BUG_FIX_REQUEST
Focus: Find and fix the reported bug. Identify the root cause in the game code and apply a targeted fix. Do not refactor unrelated code or change the visual design.`,

  NEW_FEATURE: `Edit type: NEW_FEATURE
Focus: Add the requested new game feature or mechanic. Integrate it cleanly with the existing game loop and state machine. Ensure touch controls are included for any new interactive elements.`,

  GENERAL_EDIT: `Edit type: GENERAL_EDIT
Focus: Apply the user's requested modification. This is a mobile game — interpret styling words as CSS/canvas changes, not as page content. Preserve the game's original mechanics and existing content.`,
};

/**
 * Builds the edit coder prompt, selecting system prompt and context limits by tier.
 */
function buildEditCoderPrompt(userPrompt, existingFiles, projectSlug, editType = 'GENERAL_EDIT', projectContext = {}, tier = 3, scopeInfo = null) {
  const MAX_TOTAL_CHARS = tier === 1 ? 8_000  : tier === 2 ? 16_000 : 28_000;
  const MAX_FILE_CHARS  = tier === 1 ? 4_000  : tier === 2 ?  6_000 :  8_000;

  let totalChars = 0;
  const included = [];
  const skipped  = [];

  for (const file of existingFiles) {
    if (totalChars >= MAX_TOTAL_CHARS) {
      skipped.push(file.path);
      continue;
    }
    const content = file.content.length > MAX_FILE_CHARS
      ? file.content.slice(0, MAX_FILE_CHARS) + '\n/* …truncated… */'
      : file.content;
    totalChars += content.length;
    included.push({ path: file.path, content });
  }

  const skippedNote = skipped.length
    ? `\nOther unchanged files: ${skipped.join(', ')}`
    : '';

  if (tier === 1) {
    return {
      system: EDIT_SYSTEM_TIER1,
      contextChars: totalChars,
      user: `Project: "${projectSlug}"
Files: ${JSON.stringify(included)}${skippedNote}
Change: "${userPrompt}"${scopeInfo?.isScoped ? `\nSCOPE: Only modify ${scopeInfo.scope}${scopeInfo.target ? ' — ' + scopeInfo.target : ''}.` : ''}
Output ONLY changed files as JSON: {"files":[{"path":"...","content":"..."}]}`,
    };
  }

  if (tier === 2) {
    const typeGuidance = EDIT_TYPE_GUIDANCE[editType] || EDIT_TYPE_GUIDANCE.GENERAL_EDIT;
    return {
      system: EDIT_SYSTEM_TIER2,
      contextChars: totalChars,
      user: `Project: "${projectSlug}"
${typeGuidance}
Files: ${JSON.stringify(included)}${skippedNote}
Change: "${userPrompt}"${scopeInfo?.isScoped ? `\nSCOPE: Only modify ${scopeInfo.scope}${scopeInfo.target ? ' — ' + scopeInfo.target : ''}.` : ''}
Output ONLY changed files: {"files":[{"path":"...","content":"..."}]}`,
    };
  }

  const typeGuidance = EDIT_TYPE_GUIDANCE[editType] || EDIT_TYPE_GUIDANCE.GENERAL_EDIT;
  const contextBlock = [
    projectContext.originalPrompt ? `Original prompt: "${projectContext.originalPrompt}"` : null,
    projectContext.appType        ? `Game type: ${projectContext.appType}` : null,
  ].filter(Boolean).join('\n');

  const filesBlock = included.map(f => `---FILE: ${f.path}---\n${f.content}\n---END FILE---`).join('\n\n');

  let scopeBlock = '';
  if (scopeInfo && scopeInfo.isScoped) {
    const { buildScopeConstraintBlock } = require('../utils/scopeClassifier');
    const allowedPaths   = included.map(f => f.path);
    const forbiddenPaths = skipped;
    scopeBlock = '\n\n' + buildScopeConstraintBlock(scopeInfo, allowedPaths, forbiddenPaths);
  }

  return {
    system: EDIT_CODER_SYSTEM,
    contextChars: totalChars,
    user: `Project: "${projectSlug}"
${contextBlock ? `Context: ${contextBlock}\n` : ''}${typeGuidance}${scopeBlock}

Current files:
${filesBlock}${skippedNote}

Change requested: "${userPrompt}"

Output ONLY the changed files using the ---FILE--- format. Start with the first ---FILE--- block immediately.`,
  };
}

// ── Game-fix prompt ───────────────────────────────────────────────────────────

const GAME_FIX_RULES = `
MANDATORY PATTERNS (add whichever are missing):
GAME LOOP:
  let lastTime=0;
  function gameLoop(ts){const dt=Math.min((ts-lastTime)/1000,0.05);lastTime=ts;if(gameState==='playing'){update(dt);draw();}requestAnimationFrame(gameLoop);}
  requestAnimationFrame(gameLoop);
TOUCH CONTROLS:
  canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();handleTap(e.clientX-r.left,e.clientY-r.top);});
CANVAS SETUP:
  const canvas=document.getElementById('game-canvas'); if(!canvas)return;
  const ctx=canvas.getContext('2d'); if(!ctx)return;
  function resizeCanvas(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
  window.addEventListener('resize',resizeCanvas); resizeCanvas();
GAME STATE: let gameState='menu'; // 'menu'|'playing'|'gameover'
RESTART: function restartGame(){score=0;player.x=canvas.width/2;enemies=[];gameState='playing';}
HTML CANVAS: <canvas id="game-canvas" style="display:block;width:100%;height:100%;"></canvas>`;

// Correctness rules used in fix prompts
const CORRECTNESS_RULES = `
PRIORITY ORDER (strict): 1.playable → 2.controls work → 3.win/lose loop works → 4.mobile layout → 5.visual polish
SCOPE: A smaller fully working game beats a larger broken one.
COMPLETENESS: Every button must do something real. No dead buttons, no TODO logic, no stub functions. Restart must fully reset state.
SELF-REPAIR: Before finalizing output — verify all functions called are defined, all canvas IDs exist in HTML, all game states are handled, touch events are bound.`;

/**
 * Builds a targeted prompt to fix critical game playability issues.
 * Outputs files using ---FILE: path--- delimiters (not JSON) for reliability with large game files.
 *
 * @param {string} userPrompt
 * @param {Array<{path: string, content: string}>} files
 * @param {Array<{type: string, message: string}>} issues - critical issues from validateGamePlayability
 */
function buildGameFixPrompt(userPrompt, files, issues) {
  const issueList = issues.map(i => `- [${i.type}] ${i.message}`).join('\n');

  // Prioritize game logic files
  const priority = ['js/game.js', 'game.js', 'index.html', 'js/input.js', 'js/ui.js', 'css/style.css'];
  const sorted = [...files].sort((a, b) => {
    const ai = priority.findIndex(p => a.path.endsWith(p));
    const bi = priority.findIndex(p => b.path.endsWith(p));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });

  // Cap total file content to ~18000 chars to fit in token budget
  const MAX_TOTAL = 18000;
  let usedChars = 0;
  const included = [];
  for (const f of sorted) {
    if (usedChars >= MAX_TOTAL) break;
    const cap = Math.min(f.content.length, MAX_TOTAL - usedChars);
    included.push({
      path: f.path,
      content: cap < f.content.length ? f.content.slice(0, cap) + '\n// ...truncated' : f.content,
    });
    usedChars += cap;
  }

  const filesBlock = included.map(f => `---FILE: ${f.path}---\n${f.content}\n---END FILE---`).join('\n\n');
  const allPaths   = files.map(f => f.path).join(', ');

  const system = `Mobile game fixer. Fix the critical issues listed. Output ALL game files using this exact format:
---FILE: path/to/file---
[complete corrected content]
---END FILE---
Output every file (fixed and unchanged). Start immediately with the first ---FILE--- block. No text before it.
${GAME_FIX_RULES}
${CORRECTNESS_RULES}`;

  const user = `Game: "${userPrompt}"
All files: ${allPaths}

CRITICAL ISSUES TO FIX:
${issueList}

CURRENT CODE:
${filesBlock}

Fix every listed issue. The result must be a fully playable mobile game with working touch controls and a real game loop. Output complete corrected versions of ALL files.`;

  return { system, user };
}

// ── Auto-fix prompt ───────────────────────────────────────────────────────────

/**
 * Builds a targeted auto-fix prompt for correcting specific code errors.
 */
function buildAutoFixPrompt(userPrompt, files, errors) {
  const errorList = errors
    .slice(0, 8)
    .map((e) => `- ${e.file}: [${e.type}] ${e.message}`)
    .join('\n');

  const errorFiles = new Set(errors.map((e) => e.file));
  const targetFiles = files.filter((f) => errorFiles.has(f.path)).slice(0, 5);
  const otherPaths  = files.filter((f) => !errorFiles.has(f.path)).map((f) => f.path);

  const fileBlock = targetFiles
    .map((f) => `### ${f.path}\n${(f.content || '').slice(0, 3000)}`)
    .join('\n\n');

  const system = `Mobile game code fixer. Fix ONLY the listed errors — do not change anything else.
Return ALL files (fixed + unchanged) as JSON: {"projectName":"slug","files":[{"path":"...","content":"..."}]}
Escape strings: \\n for newlines, \\" for quotes. Output valid JSON only, no markdown.`;

  const user = `Original request: "${userPrompt}"

ERRORS TO FIX:
${errorList}

FILES WITH ERRORS:
${fileBlock}
${otherPaths.length ? `\nUnchanged files (include as-is): ${otherPaths.join(', ')}` : ''}

Fix the errors. Return complete corrected files as JSON.`;

  return { system, user };
}

module.exports = {
  buildPlannerPrompt,
  buildCoderPrompt,
  buildCoderRetryPrompt,
  buildReviewerPrompt,
  buildEditCoderPrompt,
  buildAutoFixPrompt,
  buildGameFixPrompt,
  CODER_SYSTEM,
};
