/**
 * inlinePlanner — zero-latency plan generation for simple game requests.
 *
 * Two functions:
 *   getInlinePlan(gameType, prompt)   — template-based plan, returns instantly (<1ms)
 *   getFallbackPlan(prompt, gameType) — used when the API planner times out or fails
 *
 * These plans are intentionally minimal. The coder model does the real work.
 * All plans target HTML5 Canvas / JavaScript mobile-first games.
 */

const TEMPLATES = {

  // ── Hypercasual ─────────────────────────────────────────────────────────────
  'hypercasual': {
    summary: 'A simple one-tap hypercasual mobile game with instant play, a score counter, and quick retry.',
    stack: 'HTML5 Canvas + JavaScript',
    orientation: 'portrait',
    controls: 'tap',
    files: ['index.html', 'css/style.css', 'js/game.js'],
    steps: [
      'Set up mobile-first canvas that fills the screen (portrait, no scroll)',
      'Implement core one-tap mechanic (tap to act, release/timer determines outcome)',
      'Add falling/moving objects or hazards the player reacts to',
      'Track and display score — increment on success, end on miss/collision',
      'Implement game over screen with score and tap-to-restart',
      'Add touch event handler mapped to the same action as click',
    ],
  },

  // ── Arcade ──────────────────────────────────────────────────────────────────
  'arcade': {
    summary: 'A classic arcade mobile game with a score attack loop, increasing difficulty, and leaderboard-ready structure.',
    stack: 'HTML5 Canvas + JavaScript',
    orientation: 'portrait',
    controls: 'tap-buttons',
    files: ['index.html', 'css/style.css', 'js/game.js', 'js/input.js'],
    steps: [
      'Build mobile canvas game shell with viewport lock and touch-action:none',
      'Implement the core arcade mechanic (brick break, snake, avoid, shoot)',
      'Add score counter, lives/health display, and difficulty ramp over time',
      'Build touch controls: on-screen buttons or swipe gestures matching the mechanic',
      'Implement main menu (title + Play button) and game over screen (score + Retry)',
      'Persist best score to localStorage',
    ],
  },

  // ── Puzzle ──────────────────────────────────────────────────────────────────
  'puzzle': {
    summary: 'A satisfying mobile puzzle game with grid-based mechanics, a level structure, and clear win/fail states.',
    stack: 'HTML5 Canvas + JavaScript',
    orientation: 'portrait',
    controls: 'tap',
    files: ['index.html', 'css/style.css', 'js/game.js', 'js/ui.js'],
    steps: [
      'Build touch-friendly game board sized for phone screens (portrait)',
      'Implement core puzzle mechanic (match, merge, slide, connect, or match-3)',
      'Add win condition detection and score/move counter',
      'Build level progression (5–10 built-in levels with increasing difficulty)',
      'Build touch drag/tap handlers for selecting and moving pieces',
      'Add level complete overlay (score + Next Level button) and game over overlay',
    ],
  },

  // ── Idle / Clicker ──────────────────────────────────────────────────────────
  'idle-clicker': {
    summary: 'An idle clicker mobile game with a core tap loop, upgrades, and satisfying number progression.',
    stack: 'HTML5 Canvas + JavaScript',
    orientation: 'portrait',
    controls: 'tap',
    files: ['index.html', 'css/style.css', 'js/game.js'],
    steps: [
      'Build portrait mobile layout with large tap button in center',
      'Implement core tap mechanic: tap to earn currency, display large counter',
      'Add 3–5 upgrade tiers that increase earnings per tap or add auto-income',
      'Implement auto-income tick (idle income that accumulates over time)',
      'Persist game state to localStorage (currency, upgrades purchased)',
      'Add satisfying visual feedback on tap (scale pulse, +N float animation)',
    ],
  },

  // ── Runner ──────────────────────────────────────────────────────────────────
  'runner': {
    summary: 'An endless runner mobile game with lane-switching or swipe controls, increasing speed, and score tracking.',
    stack: 'HTML5 Canvas + JavaScript',
    orientation: 'portrait',
    controls: 'swipe',
    files: ['index.html', 'css/style.css', 'js/game.js', 'js/input.js'],
    steps: [
      'Build portrait canvas with scrolling background (parallax lanes or ground)',
      'Implement player character that runs automatically; swipe left/right to change lanes or tap to jump',
      'Spawn obstacles and collectibles that scroll toward the player',
      'Increase game speed over time for difficulty ramp',
      'Detect collision with obstacles (game over) and coins (score increment)',
      'Show game over screen with distance/score and tap-to-restart',
    ],
  },

  // ── Platformer ──────────────────────────────────────────────────────────────
  'platformer': {
    summary: 'A mobile platformer game with on-screen left/right/jump controls, platforms, and a goal to reach.',
    stack: 'HTML5 Canvas + JavaScript',
    orientation: 'landscape',
    controls: 'virtual-joystick',
    files: ['index.html', 'css/style.css', 'js/game.js', 'js/input.js', 'js/ui.js'],
    steps: [
      'Build landscape canvas with tile-based or freeform platform layout',
      'Implement player physics: gravity, jump, left/right movement',
      'Add on-screen control buttons (left arrow, right arrow, jump button)',
      'Build level with platforms, a start point, and a goal/end flag',
      'Add hazards (spikes, gaps, enemies) that reset the player on contact',
      'Show level complete screen and game over screen with retry',
    ],
  },

  // ── Survival ────────────────────────────────────────────────────────────────
  'survival': {
    summary: 'A wave-survival mobile game where the player fights off escalating enemy waves with a virtual joystick.',
    stack: 'HTML5 Canvas + JavaScript',
    orientation: 'portrait',
    controls: 'virtual-joystick',
    files: ['index.html', 'css/style.css', 'js/game.js', 'js/input.js', 'js/ui.js'],
    steps: [
      'Build portrait canvas arena with player at center',
      'Implement virtual joystick for player movement (touch drag from fixed origin)',
      'Spawn enemies that move toward the player each wave',
      'Implement player attack (auto-fire toward nearest enemy, or tap to shoot)',
      'Track health bar, wave number, and score (enemies killed)',
      'Show wave complete message and game over screen when health reaches zero',
    ],
  },

  // ── Top-down ─────────────────────────────────────────────────────────────────
  'top-down': {
    summary: 'A top-down action mobile game with virtual joystick movement and touch-to-shoot controls.',
    stack: 'HTML5 Canvas + JavaScript',
    orientation: 'portrait',
    controls: 'virtual-joystick',
    files: ['index.html', 'css/style.css', 'js/game.js', 'js/input.js', 'js/ui.js'],
    steps: [
      'Build top-down canvas view, player centered on screen',
      'Implement virtual left joystick for movement + auto-fire or right-side tap to shoot',
      'Spawn enemies from screen edges that move toward player',
      'Implement bullets/projectiles, collision detection for hits and player damage',
      'Display health bar, score, and wave number as HUD overlay',
      'Game over when health reaches 0 — show score and Retry button',
    ],
  },

  // ── Reflex ──────────────────────────────────────────────────────────────────
  'reflex': {
    summary: 'A reflex/timing mobile game where the player taps at precisely the right moment to score.',
    stack: 'HTML5 Canvas + JavaScript',
    orientation: 'portrait',
    controls: 'tap',
    files: ['index.html', 'css/style.css', 'js/game.js'],
    steps: [
      'Build portrait mobile layout with a large central tap zone',
      'Implement the timing mechanic (moving target zone, shrinking circle, or beat indicator)',
      'Score points for perfect/good/miss timing within the zone',
      'Increase speed or complexity with each successful tap',
      'End the game after N misses and show score + best score + Retry',
      'Add visual feedback: color flash, shake on miss, grow on perfect hit',
    ],
  },

  // ── Strategy ────────────────────────────────────────────────────────────────
  'strategy': {
    summary: 'A simple mobile strategy or tower defense game with tap-to-place mechanics and wave progression.',
    stack: 'HTML5 Canvas + JavaScript',
    orientation: 'portrait',
    controls: 'tap',
    files: ['index.html', 'css/style.css', 'js/game.js', 'js/ui.js'],
    steps: [
      'Build portrait grid or path-based game board',
      'Implement tap-to-place mechanic for towers or units',
      'Spawn enemy waves that follow a path or move toward the player base',
      'Implement tower attack range, damage, and enemy health bars',
      'Track currency (earned by defeating enemies), used to place/upgrade towers',
      'End game when base health reaches zero — show wave reached + Retry',
    ],
  },

  // ── Generic game (catch-all) ─────────────────────────────────────────────────
  'generic-game': {
    summary: 'A clean, playable mobile game with core gameplay loop, score tracking, and restart flow.',
    stack: 'HTML5 Canvas + JavaScript',
    orientation: 'portrait',
    controls: 'tap',
    files: ['index.html', 'css/style.css', 'js/game.js', 'js/input.js'],
    steps: [
      'Build mobile-first canvas game shell (portrait, fill viewport, no scroll)',
      'Implement the core requested game mechanic fully',
      'Add score/lives/timer display as HUD',
      'Build touch input: tap, swipe, or on-screen buttons as needed',
      'Implement clear win/lose/game-over state with score display',
      'Add Retry button and persist best score to localStorage',
    ],
  },

};

/**
 * Returns an instant, template-based plan for simple game requests.
 * Zero API calls. < 1ms.
 *
 * @param {string} gameType - from complexity.detectGameType()
 * @param {string} prompt   - original user prompt
 * @returns {object} plan
 */
function getInlinePlan(gameType, prompt) {
  const template = TEMPLATES[gameType] || TEMPLATES['generic-game'];
  return {
    game_name:   gameType.replace(/-/g, ' '),
    summary:     template.summary,
    stack:       template.stack,
    orientation: template.orientation,
    controls:    template.controls,
    files:       [...template.files],
    steps:       [...template.steps],
    _source:     'inline',
    _appType:    gameType,
  };
}

/**
 * Returns a fallback plan when the API planner times out or returns bad output.
 * Uses the detected game type to give a sensible default; still instant.
 *
 * @param {string} prompt
 * @param {string} gameType
 * @returns {object} plan
 */
function getFallbackPlan(prompt, gameType = 'generic-game') {
  const plan = getInlinePlan(gameType, prompt);
  return { ...plan, _source: 'fallback' };
}

module.exports = { getInlinePlan, getFallbackPlan };
