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

// ── Planner ───────────────────────────────────────────────────────────────────

const PLANNER_SYSTEM = `Mobile game designer. Output raw JSON only — no prose, no markdown.
Schema:
{
  "game_name": "short name (2-4 words)",
  "summary": "one sentence describing the game (≤20 words)",
  "genre": "hypercasual|arcade|puzzle|idle-clicker|runner|platformer|survival|top-down|reflex|strategy",
  "orientation": "portrait|landscape",
  "camera": "2D-fixed|top-down|side-scrolling|isometric",
  "controls": "tap|swipe|drag|virtual-joystick|tap-buttons|tilt",
  "mechanics": ["core action in ≤10 words", "secondary mechanic if any"],
  "win_condition": "how the player succeeds or progresses",
  "lose_condition": "how the game ends or player fails",
  "screens": ["main-menu","gameplay","pause","game-over"],
  "stack": "HTML5 Canvas + JavaScript",
  "files": ["index.html","css/style.css","js/game.js","js/input.js","js/ui.js","README.md"],
  "steps": ["step description — max 6 steps, describe WHAT to implement not which files"]
}
Rules:
- orientation: portrait for runners/tap/clicker/puzzle, landscape for platformers/top-down arenas
- controls: always mobile-first — tap for simple games, virtual-joystick for movement-based games
- screens: only include screens the game actually needs — never add fake or placeholder screens
- files: 4-8 files max — focused, working game over large skeleton
- steps: describe the actual game loop, not file creation
- Never include multiplayer, auth, backend, database, or cloud features`;

// ── Mobile-first layout rules ────────────────────────────────────────────────

const MOBILE_LAYOUT = `
MOBILE LAYOUT (non-negotiable):
- <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
- body { margin:0; padding:0; overflow:hidden; background:#000; touch-action:none; -webkit-user-select:none; user-select:none; }
- canvas { display:block; width:100%; height:100%; }
- Game must fill the entire phone screen — no centered card, no scroll, no dead whitespace
- For portrait games: canvas height = window.innerHeight, canvas width = window.innerWidth
- For landscape games: same — fill the full viewport
- All HUD elements positioned with position:absolute, inset-safe for notches
- Touch targets (buttons) minimum 44×44px, ideally 56×56px for thumbs
- No hover-only states — everything must work on touch`;

// ── Comprehensive mobile game rules ──────────────────────────────────────────

const MOBILE_GAME_RULES = `
MOBILE GAME RULES (all mandatory):

TOUCH CONTROLS — every game must have working touch controls:
- tap games: addEventListener('pointerdown') on canvas or button
- swipe games: track pointerdown + pointermove + pointerup, compute direction delta
- virtual joystick: fixed circle on screen, thumb drags within it, compute dx/dy for movement
- on-screen buttons: large fixed-position buttons (left/right/jump/shoot), pointer events
- Never require keyboard as the ONLY control — always add touch equivalents
- Never require mouse hover — touch has no hover

GAME LOOP — all games must have a real requestAnimationFrame loop:
\`\`\`js
let lastTime = 0;
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // delta in seconds, cap at 50ms
  lastTime = timestamp;
  if (gameState === 'playing') {
    update(dt);
    draw();
  }
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
\`\`\`

GAME STATE MACHINE — always implement these states:
\`\`\`js
let gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'gameover'
\`\`\`
- menu: show title, Play button — tap Play to start
- playing: run game loop, show HUD
- paused: show pause overlay with Resume and Main Menu buttons
- gameover: show score, best score, Retry button — tap Retry to restart with reset state

RESTART — game state reset must be complete:
- Re-initialize all game objects (player position, enemies array, score, lives)
- Clear any intervals or timeouts from the previous round
- Return to 'playing' state immediately (or 'menu' if preferred)

CANVAS SIZING — fill the screen properly:
\`\`\`js
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
\`\`\`

SCORE & PROGRESSION:
- Always display score during gameplay (top-center or top-right, large readable text)
- Save best score to localStorage
- Show both current score and best score on game over screen

HUD SAFETY — keep HUD away from notches and home bar:
- Top HUD: position from top 44px (accounts for status bar / notch)
- Bottom HUD: position from bottom 44px (accounts for home indicator)
- Side HUD on landscape: 16px+ from edges

PERFORMANCE — mobile CPU/GPU is limited:
- No more than 200 active game objects at once
- Clear canvas each frame with ctx.clearRect(0, 0, canvas.width, canvas.height)
- Pool objects (reuse from array) instead of creating new ones every frame
- No external image loading required — use canvas drawing (shapes, gradients, ctx.fillText)

VISUAL STYLE — games must look designed, not default:
- Choose ONE visual style direction and apply consistently: neon arcade / cartoon casual / minimalist clean / soft pastel
- Background: dark gradient, subtle pattern, or solid color — never plain white
- Player and entities: filled shapes with color — use ctx.fillStyle, ctx.strokeStyle, ctx.arc, ctx.fillRect
- Score/UI text: bold, readable, contrasting color against game background
- Buttons: rounded rectangles, large enough for thumbs, with visual pressed state

AUDIO — optional but encouraged:
- Use Web Audio API for sound effects (beep tones are fine — no external audio files needed)
\`\`\`js
const AudioCtx = window.AudioContext || window.webkitAudioContext;
function playBeep(freq=440, dur=0.1, vol=0.3) {
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.frequency.value = freq; gain.gain.value = vol;
  osc.start(); osc.stop(ctx.currentTime + dur);
}
\`\`\``;

// ── Correctness-first rules ───────────────────────────────────────────────────

const CORRECTNESS_RULES = `
PRIORITY ORDER (strict): 1.playable → 2.controls work → 3.win/lose loop works → 4.mobile layout → 5.visual polish
SCOPE: A smaller fully working game beats a larger broken one. If the request is too ambitious, reduce scope until the result is coherent and working.
COMPLETENESS: Every button must do something real. No dead buttons, no TODO logic, no stub functions. Restart must fully reset state.
HONESTY: Never fake features. If a feature requires real backend (multiplayer, cloud save, leaderboards), do NOT include it or clearly mark it as a local-only simulation.
SELF-REPAIR: Before finalizing output — verify all functions called are defined, all canvas IDs exist in HTML, all game states are handled, touch events are bound.`;

// ── JS reliability rules ──────────────────────────────────────────────────────

const CODE_RELIABILITY = `
JS RULES (non-negotiable):
- let not const for all mutable game state: let score=0, let lives=3, let enemies=[], let gameState='menu'
- Null-guard every DOM op: const canvas=document.getElementById('game-canvas'); if(!canvas) return;
- All DOM code inside DOMContentLoaded or window.onload — never in <head>
- try/catch around audio/localStorage calls — they may fail silently on some devices
- Optional chaining: obj?.prop — never bare .property on possibly-null
- Every HTML id must exactly match the getElementById call that uses it
- Every function call must be defined somewhere in the output
- Close all brackets {}()[] and template literals
- Canvas context: const ctx = canvas.getContext('2d'); if(!ctx) return;`;

// ── FILE output format ────────────────────────────────────────────────────────

const FILE_FORMAT = `
## OUTPUT FORMAT

Output each file using this EXACT format — no JSON, no markdown fences:

---FILE: path/to/filename.ext---
[complete file content here]
---END FILE---

Generate ALL files the game needs. Every file must be complete — no TODOs, no placeholders, no "// add your code here".`;

// ── Coder system prompts (3 modes) ────────────────────────────────────────────

const CODER_SYSTEM = {

// ── FAST: quick playable game, 3-5 files ─────────────────────────────────────
fast: `You are Zyra, a mobile game generator. Build a complete, playable HTML5 Canvas game. 3-5 files max.
${FILE_FORMAT}

## WHAT TO BUILD
A simple but fully playable mobile game that:
- Starts immediately when loaded (tap Play or auto-starts)
- Has working touch controls
- Has a score counter and a game over / retry loop
- Fills the entire phone screen

## FILE STRUCTURE
index.html   — game shell: canvas element, HUD overlay divs, mobile meta tags
css/style.css — mobile reset, canvas fill, HUD positioning, button styles
js/game.js   — complete game: loop, entities, collision, score, input, states

## DESIGN TOKENS (use these CSS variables)
:root {
  --bg: #0d0d1a;
  --surface: rgba(255,255,255,0.08);
  --primary: #6c63ff;
  --accent: #ff6b6b;
  --text: #f0f0f0;
  --text-dim: rgba(240,240,240,0.6);
  --radius: 12px;
  --font: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
${MOBILE_GAME_RULES}${CORRECTNESS_RULES}${MOBILE_LAYOUT}${CODE_RELIABILITY}`,

// ── BALANCED: full mobile game with all screens and polish ────────────────────
balanced: `You are Zyra, a mobile game engineer. Build a complete, polished HTML5 Canvas mobile game. Every mechanic must actually work — not a demo, not a skeleton.
${FILE_FORMAT}

## WHAT "WORKING" MEANS
The game boots, shows a main menu, starts when Play is tapped, has working touch controls, a functional game loop, score tracking, game over state, and retry. A user can pick up their phone and play without any setup.

## BANNED (these make the game broken):
- Empty function bodies or \`// TODO\` comments in game logic
- Keyboard-only controls with no touch equivalent
- Game over state that doesn't reset state on retry
- Canvas that doesn't fill the phone screen
- HUD text that overlaps with the game content unreadably
- Fake buttons that do nothing
- Missing game states (always implement: menu, playing, paused, gameover)

## FILE STRUCTURE (5-8 files)
index.html      — game shell: canvas, HUD divs, meta viewport, font loading
css/style.css   — mobile reset, canvas fill, HUD layers, button/overlay styles, animations
js/game.js      — main game: init, game loop (update+draw), entities, collision, spawn, difficulty ramp
js/input.js     — input handler: pointer events for tap/swipe/joystick, keyboard fallback
js/ui.js        — UI screens: renderMenu(), renderPause(), renderGameOver(), renderHUD(), updateScore()
README.md       — how to run locally, controls guide, game description

## DESIGN TOKENS
:root {
  --bg: #0d0d1a;
  --bg2: #1a1a2e;
  --surface: rgba(255,255,255,0.07);
  --primary: #6c63ff;
  --primary-glow: rgba(108,99,255,0.35);
  --accent: #ff6b6b;
  --success: #51cf66;
  --warning: #ffd43b;
  --text: #f0f0f0;
  --text-dim: rgba(240,240,240,0.55);
  --radius: 14px;
  --font: system-ui, -apple-system, 'Segoe UI', sans-serif;
}

## VIRTUAL JOYSTICK PATTERN (for movement-based games):
\`\`\`js
const joystick = {
  active: false, startX: 0, startY: 0, dx: 0, dy: 0, radius: 60,
  x: 80, y: 0, // positioned bottom-left; set y in resizeCanvas
};
canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  const tx = e.clientX - r.left, ty = e.clientY - r.top;
  // Left half of screen = joystick
  if (tx < canvas.width / 2) {
    joystick.active = true; joystick.startX = tx; joystick.startY = ty;
    joystick.x = tx; joystick.y = ty;
  }
});
canvas.addEventListener('pointermove', e => {
  if (!joystick.active) return;
  const r = canvas.getBoundingClientRect();
  const tx = e.clientX - r.left, ty = e.clientY - r.top;
  const ddx = tx - joystick.startX, ddy = ty - joystick.startY;
  const dist = Math.sqrt(ddx*ddx + ddy*ddy);
  const maxDist = joystick.radius;
  joystick.dx = (dist > 1 ? ddx / Math.max(dist, maxDist) : 0);
  joystick.dy = (dist > 1 ? ddy / Math.max(dist, maxDist) : 0);
});
canvas.addEventListener('pointerup', () => { joystick.active = false; joystick.dx = 0; joystick.dy = 0; });
\`\`\`

## TAP/SWIPE PATTERN (for tap and runner games):
\`\`\`js
let swipeStartX = 0, swipeStartY = 0;
canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  swipeStartX = e.clientX - r.left;
  swipeStartY = e.clientY - r.top;
});
canvas.addEventListener('pointerup', e => {
  const r = canvas.getBoundingClientRect();
  const dx = (e.clientX - r.left) - swipeStartX;
  const dy = (e.clientY - r.top) - swipeStartY;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { handleTap(); return; }
  if (Math.abs(dx) > Math.abs(dy)) handleSwipe(dx > 0 ? 'right' : 'left');
  else handleSwipe(dy > 0 ? 'down' : 'up');
});
\`\`\`
${MOBILE_GAME_RULES}${CORRECTNESS_RULES}${MOBILE_LAYOUT}${CODE_RELIABILITY}`,

// ── QUALITY: polished mobile game with full progression and juice ──────────────
quality: `You are Zyra, a senior mobile game developer producing a polished, shippable HTML5 mobile game prototype. Every mechanic fully implemented. Every screen connected. Every transition smooth.
${FILE_FORMAT}

## NON-NEGOTIABLE QUALITY STANDARDS
The game boots, the menu works, controls feel responsive, the game loop runs, difficulty scales, game over shows real score, retry fully resets. Touch controls are first-class. Visual style is consistent. Audio feedback exists (even if just beep tones).

## BANNED:
\`// TODO\`, empty function bodies, keyboard-only controls, broken retry (state not reset), canvas that doesn't fill screen, HUD overlapping unreadably, fake buttons, missing game states.

## FILE STRUCTURE (8-12 files)
index.html       — game shell: canvas, HUD layers, meta tags, preload font
css/style.css    — mobile reset, canvas fill, HUD, overlay screens, animations, button styles
css/hud.css      — HUD-specific: score display, health bar, wave counter, pause button
js/game.js       — core game: init, game loop, state machine, spawn manager, difficulty curve
js/player.js     — player entity: position, velocity, health, draw(), update(), reset()
js/enemies.js    — enemy types: spawn(), update(), draw(), collision(), pool management
js/input.js      — input manager: pointer events, joystick, swipe detection, keyboard fallback
js/ui.js         — UI: renderMenu(), renderPause(), renderGameOver(), renderHUD(), showToast()
js/audio.js      — audio: Web Audio API, playSound(type), sounds for hit/score/death/powerup
js/storage.js    — persistence: saveBestScore(), loadBestScore(), saveSettings(), loadSettings()
README.md        — game description, controls, how to run, customization notes

## JUICE EFFECTS (add at least 3 of these):
- Screen shake on player damage: \`shakeAmount = 8; shakeDecay = 0.85;\`
- Score pop: float "+N" text up from score position with fade
- Death particles: spawn 8-12 small squares at entity position, scatter outward
- Enemy hit flash: set entity.flashTimer = 0.1, draw with white tint while > 0
- Button scale: CSS transform scale(1.05) on :active, scale(0.95) on click
- Transition fade: fade canvas opacity when switching between states

## PROGRESSION (implement at least one of these):
- Difficulty ramp: increase enemy speed / spawn rate every 10 seconds
- Wave system: enemies-per-wave increases, show "Wave N" between waves
- Unlock: after reaching score milestone, unlock a new power or game speed

## DESIGN TOKENS
:root {
  --bg: #0d0d1a;
  --bg2: #1a1a2e;
  --bg3: #16213e;
  --surface: rgba(255,255,255,0.07);
  --surface2: rgba(255,255,255,0.12);
  --primary: #6c63ff;
  --primary-glow: rgba(108,99,255,0.4);
  --accent: #ff6b6b;
  --accent2: #ffd43b;
  --success: #51cf66;
  --danger: #ff4757;
  --text: #f0f0f0;
  --text-dim: rgba(240,240,240,0.55);
  --text-muted: rgba(240,240,240,0.3);
  --radius: 14px;
  --radius-sm: 8px;
  --font: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
@keyframes scaleIn { from{opacity:0;transform:scale(.9)} to{opacity:1;transform:scale(1)} }
@keyframes floatUp { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(-40px)} }
${MOBILE_GAME_RULES}${CORRECTNESS_RULES}${MOBILE_LAYOUT}${CODE_RELIABILITY}`,

};

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
 */
function buildPlannerPrompt(userPrompt, mode, gameIntent) {
  let contextNote = '';
  if (gameIntent?.genre) {
    const parts = [
      `Genre: ${gameIntent.genre}`,
      gameIntent.orientation ? `Orientation: ${gameIntent.orientation}` : null,
      gameIntent.controls    ? `Controls: ${gameIntent.controls}` : null,
    ].filter(Boolean);
    if (parts.length) contextNote = `\nContext: ${parts.join(' | ')}`;
  }
  return {
    system: PLANNER_SYSTEM,
    user:   `Request: "${userPrompt}"${contextNote}`,
  };
}

/**
 * @param {string} userPrompt
 * @param {object} plan
 * @param {string} [mode]
 * @param {object} [gameIntent] - optional pre-parsed game intent
 */
function buildCoderPrompt(userPrompt, plan, mode = 'balanced', gameIntent = null) {
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

  return {
    system,
    user: `Request: "${userPrompt}"

Game Plan:
${planStr}

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
      user: `Simplified version of: "${userPrompt}"\nGenerate 2-3 core files only: index.html + css/style.css + js/game.js. Complete, playable game.`,
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
When the user gives a stylistic or aesthetic instruction, you MUST interpret it as a CSS/code modification. NEVER turn style words into visible page content, headlines, titles, or section names.
Examples of correct interpretation:
  - "make it black and white" → change CSS color variables to grayscale values; DO NOT add text like "Black and White Design"
  - "make it minimal" → simplify CSS, reduce decorative elements; DO NOT rename the game
  - "use a blue palette" → update CSS color variables to blue tones; DO NOT add a "Blue Palette" heading
  - "dark mode" → change background/text colors to dark values; DO NOT add "Dark Mode" as a title
  - "more modern" → update typography, spacing, border-radius; DO NOT change game content
The original game's purpose, mechanics, and content must be preserved through all style edits.

OUTPUT FORMAT — use this EXACT format, no JSON, no markdown fences:
---FILE: path/to/file.ext---
[complete file content]
---END FILE---

Output only changed files. Start immediately with the first ---FILE--- block.`;

// Edit-type-specific guidance injected into the user prompt
const EDIT_TYPE_GUIDANCE = {
  THEME_CHANGE: `Edit type: THEME_CHANGE
Focus: Update the visual theme. Change CSS custom properties, color values, background gradients. Preserve all game mechanics and functionality unchanged.`,

  COLOR_CHANGE: `Edit type: COLOR_CHANGE
Focus: Update colors only. Find CSS variables and hard-coded color values. Do not alter HTML content, layout, or JavaScript game logic.`,

  TYPOGRAPHY_CHANGE: `Edit type: TYPOGRAPHY_CHANGE
Focus: Update typography only. Modify font-family, font-size, font-weight, line-height. Do not alter HTML content or JavaScript.`,

  LAYOUT_CHANGE: `Edit type: LAYOUT_CHANGE
Focus: Update layout, spacing, or structure. Modify CSS properties and HTML structure as needed. Preserve all game content and mechanics.`,

  COMPONENT_CHANGE: `Edit type: COMPONENT_CHANGE
Focus: Add, remove, or style a specific UI component or game element. Target only the relevant code. Preserve all unrelated content and functionality.`,

  COPY_CHANGE: `Edit type: COPY_CHANGE
Focus: Update visible text content only. Change the specified text in HTML or canvas draw calls. Do not alter CSS, JavaScript logic, or game mechanics.`,

  FUNCTIONAL_FIX: `Edit type: FUNCTIONAL_FIX
Focus: Fix broken or misbehaving functionality. Update JavaScript logic, event handlers, or game state. Do not alter visual design or content unless directly related to the fix.`,

  BUG_FIX_REQUEST: `Edit type: BUG_FIX_REQUEST
Focus: Find and fix the reported bug. Identify the root cause in the code and apply a targeted fix. Do not refactor unrelated code or change the design.`,

  NEW_FEATURE: `Edit type: NEW_FEATURE
Focus: Add the requested new feature or functionality. Integrate it cleanly with the existing code, matching the project's current style and conventions. Ensure touch controls are included for any new interactive elements.`,

  GENERAL_EDIT: `Edit type: GENERAL_EDIT
Focus: Apply the user's requested modification. Interpret styling words as CSS changes, not as page content. Preserve the game's original mechanics and existing content.`,
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
};
