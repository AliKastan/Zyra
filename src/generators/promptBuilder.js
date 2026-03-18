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

// ── Visual identity guidance ──────────────────────────────────────────────────

const VISUAL_IDENTITY = `
VISUAL IDENTITY — design for this specific game, not a generic template:

Derive ONE visual style from the game's concept and theme. Apply it to everything consistently.
Do NOT default to dark-bg + purple primary + red accent — that is the generic AI game look.

Style directions by game mood (choose the one that fits, then commit to it):
  action/gritty   → near-black bg, muted red or orange primary, lean sparse UI
  casual/cheerful → warm off-white bg, bold warm primary, friendly round UI
  retro arcade    → very dark bg, ONE neon accent color, crisp sharp text
  cozy/chill      → earthy muted bg, soft warm highlights, relaxed feel
  candy/playful   → vivid saturated bg, high contrast accent, energetic
  ocean/calm      → deep blue bg, cool teal or cyan accent, clean minimal HUD
  minimal/sharp   → near-white or near-black bg, single strong accent, nothing extra

Implementation rules:
- Define :root { --bg; --primary; --accent; --text; --radius:10px; --font:system-ui,sans-serif; }
  Use these variables everywhere — never scatter raw hex values through the code
- 2-3 core colors max — a neutral bg, one primary, one accent. More = visual noise
- No glow or drop-shadow unless it directly serves the chosen style (not on every element)
- No random gradients — use flat or very subtle gradients only when the style genuinely calls for it
- Every screen (menu, HUD, gameplay, game-over) must use the SAME palette. No mid-game style shifts
- Buttons: solid fill + consistent border-radius. Tappable, not a Dribbble shot
- Menus must feel like they belong to THIS game, not a generic game template
- Taste check: would a human indie developer look at this and think it looks coherent and intentional?`;

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
- body { margin:0; padding:0; overflow:hidden; background:var(--bg,#111); touch-action:none; -webkit-user-select:none; user-select:none; }
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

VISUAL STYLE — derive from this game's theme, stay consistent:
- Use the visual identity defined in the system prompt — same palette for all screens
- Player and entities: canvas shapes using --primary / --accent — ctx.fillStyle, ctx.arc, ctx.fillRect
- Score/UI text: bold, readable, high contrast — consistent weight hierarchy throughout
- Buttons: solid fill using --primary, consistent --radius, 44px+ touch targets — same style everywhere
- Do NOT add glow, gradient, or shadow to every element — use effects only where they serve the style

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

${VISUAL_IDENTITY}
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
${VISUAL_IDENTITY}
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

## GAME FEEL (choose 1-2 that serve this game's style — do not add all of them):
- Input feedback: button scale on :active (scale 0.96), subtle bg color shift on press
- Score feedback: brief "+N" float text (small, quick, fades in 0.4s — not distracting)
- Hit feedback: entity flash for 0.1s on damage (simple fillStyle override)
- Screen shake: only for significant impacts — shakeAmount = 6; shakeDecay = 0.8;
- State transition: brief canvas opacity fade when switching states (0.15s)
Rule: effects must serve feedback, not decorate. If an effect doesn't tell the player something useful, leave it out.

## PROGRESSION (implement at least one of these):
- Difficulty ramp: increase enemy speed / spawn rate every 10 seconds
- Wave system: enemies-per-wave increases, show "Wave N" between waves
- Unlock: after reaching score milestone, unlock a new power or game speed

${VISUAL_IDENTITY}
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
};
