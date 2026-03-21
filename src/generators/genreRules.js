/**
 * genreRules.js
 *
 * Per-genre required systems and forbidden patterns.
 * Injected into coder prompts based on the genre detected in the game plan.
 * Keeps each rule block concise to minimise token cost.
 */

const GENRE_RULES = {

  hypercasual: {
    required: [
      'Single one-finger mechanic — tap, hold, or swipe',
      'Score visible from frame 1, large and centred',
      'Game starts immediately (auto-start or 1-tap from load)',
      'Instant retry on game over — no elaborate menu needed',
      'Difficulty auto-ramps (speed / frequency every ~10s)',
    ],
    forbidden: [
      'Multi-button control schemes',
      'Story, dialogue, or character backstory',
      'Inventory, upgrades, or unlock systems',
      'Loading screens or complex menus',
      'More than 1 core mechanic',
    ],
  },

  arcade: {
    required: [
      'Score displayed prominently at top of screen',
      'Clear lose condition with distinct game over screen',
      'Retry button on game over — tap to restart fully',
      'Difficulty increases over time (speed, spawn rate, or obstacle density)',
      'Best score saved to localStorage and shown on game over',
    ],
    forbidden: [
      'Online or real-time multiplayer',
      'Complex inventory or equipment',
      'Story-driven content',
      'External image assets — use canvas shapes and gradients',
    ],
  },

  puzzle: {
    required: [
      'Clear win condition per level — visual success feedback',
      'Level counter shown in HUD',
      'Reset button to restart current level',
      'At least 3 distinct playable levels or puzzle states',
      'Visual feedback on invalid or illegal moves',
    ],
    forbidden: [
      'Timed pressure unless timing IS the core mechanic',
      'Action sequences that interrupt puzzle solving',
      'Procedural board generation — use hand-crafted levels or seeds',
      'Real-time physics simulations',
    ],
  },

  'idle-clicker': {
    required: [
      'Tap/click to earn the core resource',
      'At least 2 buyable upgrade tiers with escalating cost',
      'Auto-save to localStorage every 10 seconds',
      'Offline earnings: calculate time away on load and credit resources',
      'Large-number formatting: 1K, 1M, 1B suffixes',
    ],
    forbidden: [
      'Real-time action elements that conflict with idle loop',
      'Heavy particle effects on every tap (frame-rate killer)',
      'External API or server calls',
      'Complex combat requiring constant input',
    ],
  },

  runner: {
    required: [
      'Auto-scrolling environment — player moves right automatically',
      'Tap or swipe up to jump, double-tap for double-jump if needed',
      'Obstacle spawn system with increasing spawn rate',
      'Distance-based score counter',
      'Speed increases progressively throughout the run',
    ],
    forbidden: [
      'Manual left/right movement controls — runner auto-advances',
      'Complex multi-lane branching requiring precise swipes',
      'Scrolling background image files — use canvas-drawn parallax layers',
      'Physics engine libraries',
    ],
  },

  platformer: {
    required: [
      'On-screen left/right buttons + jump button (tap-area or rendered buttons)',
      'Gravity simulation: player.vy += gravity * dt',
      'Platform collision — player lands on top of platforms',
      'Player death on fall off screen or enemy contact',
      'At least 1 collectible goal (coin, gem, flag, exit)',
    ],
    forbidden: [
      'Keyboard-only controls with no touch equivalent',
      'Complex tilemap editors',
      'Box2D or any physics library — implement gravity manually',
      'More than 2 simultaneous enemies in the initial build',
    ],
  },

  survival: {
    required: [
      'Health bar or lives counter visible in HUD',
      'Enemy wave spawner — each wave more numerous than the last',
      'Player death and clear game over screen with time or score survived',
      'At least 1 defensive mechanic: dodge, parry, shoot, or area clear',
      'Wave number displayed in HUD',
    ],
    forbidden: [
      'Crafting or resource-gathering trees',
      'Open world or explorable map',
      'More than 2 enemy types in the first build',
      'Procedural terrain generation',
    ],
  },

  'top-down': {
    required: [
      'Drag-to-move controls: player follows touch position (or use left/right tap zones)',
      'Shoot or action button (bottom-right of screen, or auto-fire toward nearest enemy)',
      'Enemy AI — minimum: enemies chase player (dx = target.x - self.x)',
      'Player health bar',
      'Game over screen with retry on player death',
    ],
    forbidden: [
      'Virtual joystick overlays — use drag-to-move or tap-zone controls instead',
      'WASD keyboard-only controls — always provide touch equivalents',
      'Complex navmesh pathfinding — use simple direct-chase vectors',
      'Destructible terrain in the initial build',
      'More than 3 distinct enemy types in initial build',
    ],
  },

  reflex: {
    required: [
      'Precise timing mechanic — hit a shrinking window or react to a cue',
      'Immediate visual + audio feedback on hit and miss',
      'Streak counter or combo multiplier',
      'Speed or window size changes to increase difficulty over time',
      'Instant restart on fail — no delay between game over and retry',
    ],
    forbidden: [
      'Complex narrative or progression between reflex rounds',
      'Unlock systems or long menus',
      'Multiple simultaneous unrelated mechanics',
    ],
  },

  strategy: {
    required: [
      'Tap to select units or place buildings/actions',
      'At least 2 distinct unit or action types',
      'Clear win condition (destroy base, collect N, survive N waves)',
      'Resource counter visible in HUD at all times',
      'Turn-based OR real-time — pick one, implement it fully',
    ],
    forbidden: [
      'Online multiplayer',
      'Tech trees deeper than 2 tiers in the initial build',
      'Procedural map generation',
      '3D perspective or isometric illusion requiring complex transforms',
    ],
  },
};

/**
 * Returns a concise genre rule block for injection into coder prompts.
 * Returns empty string for unrecognized genres.
 *
 * @param {string} genre
 * @returns {string}
 */
function buildGenreRuleBlock(genre) {
  const key   = (genre || '').toLowerCase().replace(/\s+/g, '-');
  const rules = GENRE_RULES[key];
  if (!rules) return '';

  const req  = rules.required.map(r => `  + ${r}`).join('\n');
  const forb = rules.forbidden.map(f => `  - ${f}`).join('\n');

  return `GENRE RULES — ${genre.toUpperCase()}
REQUIRED (implement all):
${req}
FORBIDDEN (never add):
${forb}`;
}

module.exports = { GENRE_RULES, buildGenreRuleBlock };
