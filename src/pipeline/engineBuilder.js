/**
 * engineBuilder.js — Fast engine-based game generation
 *
 * Claude outputs ~50 lines of JSON config (5-10s via Haiku).
 * The pre-built Zyra Engine reads the config and runs the game.
 * Total generation time: under 15 seconds.
 */

const path = require('path');
const fse = require('fs-extra');
const { callClaude, HAIKU_MODEL } = require('../providers/anthropicProvider');
const { safeJsonParse } = require('../utils/safeJsonParse');
const { createCostTracker } = require('../utils/costTracker');
const logger = require('../utils/logger');

const ENGINE_PATH = path.resolve(__dirname, '../../public/engine/zyra-engine.js');

// ── Engine source: loaded ONCE, cached forever ──────────────────────────────

let _engineSource = null;

function getEngineSource() {
  if (!_engineSource) {
    _engineSource = fse.readFileSync(ENGINE_PATH, 'utf8');
    logger.info(`[engineBuilder] engine cached (${(_engineSource.length / 1024).toFixed(0)} KB)`);
  }
  return _engineSource;
}

// Pre-cache on module load
try { getEngineSource(); } catch (e) { logger.error(`[engineBuilder] failed to pre-cache engine: ${e.message}`); }

// ── Compact system prompt — tells Claude to output JSON only ────────────────

const CONFIG_SYSTEM_PROMPT = `Output a JSON game config for the Zyra Engine. NO code, NO markdown, NO explanation — ONLY raw JSON.

Game types: tap, dodge, shooter, runner, physics, puzzle, platformer, snake, breakout, catcher
Mapping: billiards/pool→physics(topdown), angry-birds→physics(launch), fruit-ninja/whack→tap, flappy/avoid→dodge, space-invaders→shooter, mario/jump→platformer, candy-crush/match-3→puzzle, snake→snake, breakout/brick→breakout, catch-falling→catcher, endless-runner→runner

Schema:
{"id":"kebab-id","type":"<type>","physicsMode":"topdown|launch|bounce (physics only)","title":"CAPS TITLE","subtitle":"3-5 words","tutorial":"controls with <br>","theme":{"primary":"#hex","secondary":"#hex","background":"#hex (dark)","backgroundAlt":"#hex"},"settings":{"lives":3,...type-specific},"entityTypes":{"basic":{"width":30,"height":30,"color":"#hex","health":1,"speed":2,"points":10,"shape":"rect|circle"},...},"powerUps":{"shield":{"color":"#hex","icon":"S","duration":8},...},"levels":[5 levels, increasing difficulty, each with: name, subtitle, objective:{type:"score|survive|destroy|collect",target:N}, spawnRate(ms), spawnTypes(array of entityType keys), maxEnemies, speedMultiplier, powerUpChance, newMechanic(null or string), optional timeLimit(s), optional boss:{name,width,height,color,health,patterns}]}

Rules: valid JSON only, 5 levels, level 3 introduces new mechanic, reasonable values (speeds 1-10, sizes 20-100, spawns 500-3000ms), fun difficulty curve, spawnTypes must reference entityTypes keys, no emoji in icons.`;

// ── Complete default configs per game type ───────────────────────────────────

const DEFAULT_CONFIGS = {
  tap: {
    id: 'tap-game', type: 'tap', title: 'TAP MASTER', subtitle: 'Tap fast, score big',
    tutorial: 'Tap targets before they disappear<br>Miss 3 and it is game over',
    theme: { primary: '#FF6B6B', secondary: '#FF8E53', background: '#1A0A2E', backgroundAlt: '#2D1B4E' },
    settings: { lives: 3 },
    entityTypes: {
      basic: { width: 50, color: '#FF6B6B', points: 10, lifetime: 2.5, shape: 'circle' },
      small: { width: 36, color: '#FBBF24', points: 25, lifetime: 1.8, shape: 'circle' },
      big: { width: 70, color: '#4ECDC4', points: 5, lifetime: 3.0, shape: 'circle' }
    },
    levels: [
      { name: 'Warm Up', subtitle: 'Big targets', objective: { type: 'score', target: 50 }, spawnRate: 2000, spawnTypes: ['basic', 'big'], maxEnemies: 3, speedMultiplier: 1, powerUpChance: 0.05 },
      { name: 'Faster', subtitle: 'Pick up the pace', objective: { type: 'score', target: 120 }, spawnRate: 1500, spawnTypes: ['basic', 'small'], maxEnemies: 4, speedMultiplier: 1.2, powerUpChance: 0.08 },
      { name: 'Bonus Round', subtitle: 'All target types', objective: { type: 'score', target: 250 }, spawnRate: 1200, spawnTypes: ['basic', 'small', 'big'], maxEnemies: 5, speedMultiplier: 1.4, powerUpChance: 0.1, newMechanic: 'bonus_targets' },
      { name: 'Frenzy', subtitle: 'Time pressure', objective: { type: 'score', target: 400 }, timeLimit: 45, spawnRate: 900, spawnTypes: ['basic', 'small', 'big'], maxEnemies: 6, speedMultiplier: 1.7, powerUpChance: 0.12 },
      { name: 'ULTIMATE', subtitle: 'The final test', objective: { type: 'score', target: 600 }, timeLimit: 60, spawnRate: 700, spawnTypes: ['basic', 'small', 'big'], maxEnemies: 8, speedMultiplier: 2, powerUpChance: 0.15 }
    ]
  },

  dodge: {
    id: 'dodge-game', type: 'dodge', title: 'SKY DODGE', subtitle: 'Dodge and survive',
    tutorial: 'Drag to move<br>Dodge falling objects<br>Collect gold coins',
    theme: { primary: '#4ECDC4', secondary: '#45B7D1', background: '#0A1628', backgroundAlt: '#0D1F3C' },
    settings: { lives: 3, playerWidth: 40, playerHeight: 40, playerColor: '#4ECDC4' },
    entityTypes: {
      rock: { width: 30, height: 30, color: '#FF6B6B', speed: 3, points: 0, shape: 'rect' },
      fast_rock: { width: 24, height: 24, color: '#FF4757', speed: 5, points: 0, shape: 'circle' }
    },
    levels: [
      { name: 'Clear Skies', subtitle: 'Ease into it', objective: { type: 'survive', target: 15 }, spawnRate: 1800, spawnTypes: ['rock'], maxEnemies: 5, speedMultiplier: 1, powerUpChance: 0.1 },
      { name: 'Storm Coming', subtitle: 'More obstacles', objective: { type: 'survive', target: 25 }, spawnRate: 1400, spawnTypes: ['rock'], maxEnemies: 6, speedMultiplier: 1.3, powerUpChance: 0.12 },
      { name: 'Lightning', subtitle: 'Fast rocks', objective: { type: 'survive', target: 30 }, spawnRate: 1100, spawnTypes: ['rock', 'fast_rock'], maxEnemies: 7, speedMultiplier: 1.5, powerUpChance: 0.15, newMechanic: 'fast_rocks' },
      { name: 'Tornado', subtitle: 'Time pressure', objective: { type: 'survive', target: 40 }, spawnRate: 800, spawnTypes: ['rock', 'fast_rock'], maxEnemies: 8, speedMultiplier: 1.8, powerUpChance: 0.18 },
      { name: 'HURRICANE', subtitle: 'Survive the storm', objective: { type: 'survive', target: 60 }, spawnRate: 600, spawnTypes: ['rock', 'fast_rock'], maxEnemies: 10, speedMultiplier: 2.2, powerUpChance: 0.2 }
    ]
  },

  shooter: {
    id: 'shooter-game', type: 'shooter', title: 'SPACE BLAST', subtitle: 'Defend the galaxy',
    tutorial: 'Drag to move your ship<br>Auto-fires at enemies<br>Collect power-ups',
    theme: { primary: '#00D4FF', secondary: '#7B2FFF', background: '#0A0A2E', backgroundAlt: '#0F0F3A' },
    settings: { lives: 3, playerWidth: 36, playerHeight: 36, playerColor: '#00D4FF', fireRate: 400, projectileSpeed: 10, projectileColor: '#FFD700' },
    entityTypes: {
      basic: { width: 30, height: 30, color: '#FF6B6B', health: 1, speed: 2, points: 10, shape: 'rect' },
      fast: { width: 24, height: 24, color: '#FBBF24', health: 1, speed: 4, points: 20, shape: 'circle' },
      tank: { width: 40, height: 40, color: '#A78BFA', health: 3, speed: 1.2, points: 50, shape: 'rect' },
      shooter: { width: 34, height: 34, color: '#FF4757', health: 2, speed: 1.5, points: 30, shape: 'rect', shoots: true, fireRate: 2000 }
    },
    powerUps: { rapid: { color: '#FFD700', icon: 'R', duration: 5 }, shield: { color: '#00D4FF', icon: 'S', duration: 8 }, spread: { color: '#FF6B6B', icon: 'X', duration: 5 }, extra_life: { color: '#34D399', icon: '+', duration: 0 } },
    levels: [
      { name: 'Patrol', subtitle: 'Easy targets', objective: { type: 'score', target: 100 }, spawnRate: 2000, spawnTypes: ['basic'], maxEnemies: 4, speedMultiplier: 1, powerUpChance: 0.1 },
      { name: 'Skirmish', subtitle: 'Faster enemies', objective: { type: 'score', target: 250 }, spawnRate: 1500, spawnTypes: ['basic', 'fast'], maxEnemies: 6, speedMultiplier: 1.3, powerUpChance: 0.12 },
      { name: 'Heavy Fire', subtitle: 'Armored foes', objective: { type: 'destroy', target: 20 }, spawnRate: 1200, spawnTypes: ['basic', 'fast', 'tank'], maxEnemies: 7, speedMultiplier: 1.5, powerUpChance: 0.15, newMechanic: 'tank_enemies' },
      { name: 'Crossfire', subtitle: 'They shoot back', objective: { type: 'score', target: 500 }, timeLimit: 60, spawnRate: 1000, spawnTypes: ['basic', 'fast', 'tank', 'shooter'], maxEnemies: 8, speedMultiplier: 1.7, powerUpChance: 0.2, newMechanic: 'shooting_enemies' },
      { name: 'MOTHERSHIP', subtitle: 'Final battle', objective: { type: 'destroy', target: 1 }, timeLimit: 90, spawnRate: 1500, spawnTypes: ['basic', 'fast'], maxEnemies: 4, speedMultiplier: 2, powerUpChance: 0.25, boss: { name: 'MOTHERSHIP', width: 100, height: 60, color: '#FF4757', health: 15, patterns: ['spread_shot', 'charge', 'spawn_minions'], patternDuration: 3, pauseDuration: 1.5 }, newMechanic: 'boss' }
    ]
  },

  runner: {
    id: 'runner-game', type: 'runner', title: 'DASH RUN', subtitle: 'Run and jump',
    tutorial: 'Tap to jump<br>Collect coins<br>Dodge obstacles',
    theme: { primary: '#FF8E53', secondary: '#FF6B6B', background: '#0A1628', backgroundAlt: '#0D1F3C' },
    settings: { lives: 3, playerWidth: 30, playerHeight: 40, playerColor: '#FF8E53', playerSpeed: 4 },
    entityTypes: { basic: { width: 30, height: 40, color: '#FF6B6B', speed: 1, points: 0, shape: 'rect' } },
    levels: [
      { name: 'Jog', subtitle: 'Easy pace', objective: { type: 'score', target: 100 }, spawnRate: 2000, spawnTypes: ['basic'], maxEnemies: 3, speedMultiplier: 1, powerUpChance: 0.1 },
      { name: 'Run', subtitle: 'Faster now', objective: { type: 'score', target: 250 }, spawnRate: 1600, spawnTypes: ['basic'], maxEnemies: 4, speedMultiplier: 1.3, powerUpChance: 0.12 },
      { name: 'Sprint', subtitle: 'Double obstacles', objective: { type: 'score', target: 400 }, spawnRate: 1200, spawnTypes: ['basic'], maxEnemies: 5, speedMultiplier: 1.6, powerUpChance: 0.15, newMechanic: 'faster' },
      { name: 'Dash', subtitle: 'Time trial', objective: { type: 'survive', target: 45 }, spawnRate: 900, spawnTypes: ['basic'], maxEnemies: 6, speedMultiplier: 2, powerUpChance: 0.18 },
      { name: 'ULTRA', subtitle: 'Maximum speed', objective: { type: 'survive', target: 60 }, spawnRate: 700, spawnTypes: ['basic'], maxEnemies: 7, speedMultiplier: 2.5, powerUpChance: 0.2 }
    ]
  },

  puzzle: {
    id: 'puzzle-game', type: 'puzzle', title: 'GEM MATCH', subtitle: 'Match 3 to clear',
    tutorial: 'Tap two adjacent gems to swap<br>Match 3 or more in a row<br>Chain combos for bonus',
    theme: { primary: '#A78BFA', secondary: '#7C3AED', background: '#1A0A2E', backgroundAlt: '#2D1B4E' },
    settings: { lives: 99, cols: 7, rows: 9 },
    entityTypes: {
      red: { color: '#FF6B6B' }, blue: { color: '#4ECDC4' }, yellow: { color: '#FFD93D' },
      purple: { color: '#6C5CE7' }, green: { color: '#A8E6CF' }, pink: { color: '#FF8B94' }
    },
    levels: [
      { name: 'Tutorial', subtitle: 'Learn to match', objective: { type: 'score', target: 100 }, spawnRate: 9999, spawnTypes: ['red'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0 },
      { name: 'Warming Up', subtitle: 'Score 300', objective: { type: 'score', target: 300 }, spawnRate: 9999, spawnTypes: ['red'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0 },
      { name: 'Combo Master', subtitle: 'Destroy 30 gems', objective: { type: 'destroy', target: 30 }, spawnRate: 9999, spawnTypes: ['red'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0, newMechanic: 'combos' },
      { name: 'Time Attack', subtitle: '60 second rush', objective: { type: 'score', target: 600 }, timeLimit: 60, spawnRate: 9999, spawnTypes: ['red'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0 },
      { name: 'Grand Master', subtitle: 'Ultimate challenge', objective: { type: 'score', target: 1000 }, timeLimit: 90, spawnRate: 9999, spawnTypes: ['red'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0 }
    ]
  },

  platformer: {
    id: 'platformer-game', type: 'platformer', title: 'SKY JUMPER', subtitle: 'Jump to the top',
    tutorial: 'Touch left/right to move<br>Swipe up to jump<br>Collect coins',
    theme: { primary: '#45B7D1', secondary: '#2C8EAD', background: '#0A1628', backgroundAlt: '#0D1F3C' },
    settings: { lives: 3, playerWidth: 28, playerHeight: 36, playerColor: '#45B7D1' },
    entityTypes: { basic: { width: 20, height: 20, color: '#FF6B6B', speed: 1, points: 0, shape: 'rect' } },
    levels: [
      { name: 'Ground Floor', subtitle: 'Learn to jump', objective: { type: 'collect', target: 5 }, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0 },
      { name: 'Higher Up', subtitle: 'Longer gaps', objective: { type: 'collect', target: 8 }, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1.2, powerUpChance: 0 },
      { name: 'Hazards', subtitle: 'Watch for spikes', objective: { type: 'collect', target: 10 }, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1.4, powerUpChance: 0, newMechanic: 'hazards' },
      { name: 'Speed Run', subtitle: 'Beat the clock', objective: { type: 'collect', target: 12 }, timeLimit: 60, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1.6, powerUpChance: 0 },
      { name: 'SUMMIT', subtitle: 'The final climb', objective: { type: 'collect', target: 15 }, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1.8, powerUpChance: 0 }
    ]
  },

  snake: {
    id: 'snake-game', type: 'snake', title: 'NEON SNAKE', subtitle: 'Eat and grow',
    tutorial: 'Swipe to change direction<br>Eat red dots to grow<br>Do not hit walls or yourself',
    theme: { primary: '#34D399', secondary: '#059669', background: '#0A0A1A', backgroundAlt: '#0F0F2A' },
    settings: { lives: 1, cellSize: 18, moveInterval: 0.14 },
    entityTypes: { basic: { color: '#FF6B6B' } },
    levels: [
      { name: 'Garden', subtitle: 'Open field', objective: { type: 'collect', target: 5 }, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0 },
      { name: 'Park', subtitle: 'Getting longer', objective: { type: 'collect', target: 10 }, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1.2, powerUpChance: 0 },
      { name: 'Highway', subtitle: 'Speed up', objective: { type: 'collect', target: 15 }, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1.5, powerUpChance: 0, newMechanic: 'speed_boost' },
      { name: 'Autobahn', subtitle: 'No speed limit', objective: { type: 'collect', target: 20 }, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1.8, powerUpChance: 0 },
      { name: 'Warp Zone', subtitle: 'Ludicrous speed', objective: { type: 'collect', target: 30 }, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 2.2, powerUpChance: 0 }
    ]
  },

  breakout: {
    id: 'breakout-game', type: 'breakout', title: 'BRICK SMASH', subtitle: 'Break them all',
    tutorial: 'Drag paddle left and right<br>Bounce the ball to break bricks<br>Do not let the ball fall',
    theme: { primary: '#FF6B6B', secondary: '#FBBF24', background: '#0A0A2E', backgroundAlt: '#15153E' },
    settings: { lives: 3, paddleWidth: 80, paddleHeight: 14, paddleColor: '#FF6B6B', ballRadius: 8, ballColor: '#FFD700', ballSpeed: 5, brickCols: 8, brickRows: 4 },
    entityTypes: { red: { color: '#FF6B6B' }, yellow: { color: '#FBBF24' }, teal: { color: '#4ECDC4' }, purple: { color: '#6C5CE7' }, green: { color: '#A8E6CF' } },
    powerUps: { extra_life: { color: '#34D399', icon: '+', duration: 0 } },
    levels: [
      { name: 'Warm Up', subtitle: '4 rows', objective: { type: 'destroy', target: 32 }, spawnRate: 9999, spawnTypes: ['red'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0.1 },
      { name: 'Double Up', subtitle: '5 rows', objective: { type: 'destroy', target: 40 }, spawnRate: 9999, spawnTypes: ['red'], maxEnemies: 1, speedMultiplier: 1.15, powerUpChance: 0.1 },
      { name: 'Tough Bricks', subtitle: 'Multi-hit bricks', objective: { type: 'destroy', target: 48 }, spawnRate: 9999, spawnTypes: ['red'], maxEnemies: 1, speedMultiplier: 1.3, powerUpChance: 0.15, newMechanic: 'tough_bricks' },
      { name: 'Speed Run', subtitle: 'Faster ball', objective: { type: 'destroy', target: 56 }, spawnRate: 9999, spawnTypes: ['red'], maxEnemies: 1, speedMultiplier: 1.5, powerUpChance: 0.15, timeLimit: 90 },
      { name: 'Brick Wall', subtitle: 'Ultimate wall', objective: { type: 'destroy', target: 64 }, spawnRate: 9999, spawnTypes: ['red'], maxEnemies: 1, speedMultiplier: 1.7, powerUpChance: 0.2 }
    ]
  },

  catcher: {
    id: 'catcher-game', type: 'catcher', title: 'CATCH IT', subtitle: 'Catch the good stuff',
    tutorial: 'Drag basket left and right<br>Catch good items for points<br>Avoid bad items',
    theme: { primary: '#FFD93D', secondary: '#FF8E53', background: '#1A0A28', backgroundAlt: '#2D1540' },
    settings: { lives: 3, playerWidth: 60, playerHeight: 30, playerColor: '#FFD93D' },
    entityTypes: {
      good: { width: 24, height: 24, color: '#4ECDC4', speed: 3, points: 10, isGood: true, shape: 'circle' },
      great: { width: 28, height: 28, color: '#FFD700', speed: 2.5, points: 25, isGood: true, shape: 'circle' },
      bad: { width: 26, height: 26, color: '#FF4757', speed: 3.5, points: 0, isGood: false, shape: 'rect' }
    },
    levels: [
      { name: 'Easy', subtitle: 'Slow drops', objective: { type: 'score', target: 80 }, spawnRate: 1800, spawnTypes: ['good'], maxEnemies: 5, speedMultiplier: 1, powerUpChance: 0.05 },
      { name: 'Mix', subtitle: 'Watch for skulls', objective: { type: 'score', target: 180 }, spawnRate: 1400, spawnTypes: ['good', 'bad'], maxEnemies: 6, speedMultiplier: 1.2, powerUpChance: 0.08 },
      { name: 'Gems', subtitle: 'Bonus gems appear', objective: { type: 'score', target: 300 }, spawnRate: 1200, spawnTypes: ['good', 'great', 'bad'], maxEnemies: 7, speedMultiplier: 1.4, powerUpChance: 0.1, newMechanic: 'gems' },
      { name: 'Rush', subtitle: 'Time limit', objective: { type: 'score', target: 450 }, timeLimit: 45, spawnRate: 900, spawnTypes: ['good', 'great', 'bad'], maxEnemies: 8, speedMultiplier: 1.7, powerUpChance: 0.12 },
      { name: 'CHAOS', subtitle: 'Everything at once', objective: { type: 'score', target: 600 }, timeLimit: 60, spawnRate: 600, spawnTypes: ['good', 'great', 'bad'], maxEnemies: 10, speedMultiplier: 2.2, powerUpChance: 0.15 }
    ]
  },

  physics: {
    id: 'physics-game', type: 'physics', physicsMode: 'topdown', title: 'POOL MASTER', subtitle: '8-Ball Pool',
    tutorial: 'Drag from cue ball to aim<br>Pull further for more power<br>Pocket all balls to win',
    theme: { primary: '#34D399', secondary: '#059669', background: '#0A2E1A', backgroundAlt: '#0D3A20' },
    settings: { lives: 99, gravity: { x: 0, y: 0 }, linearDamping: 1.8, tableColor: '#0B6623', cushionColor: '#8B4513', cushionRestitution: 0.8, ballRadius: 10, ballDensity: 1, ballFriction: 0.4, ballRestitution: 0.95, maxPower: 8, pocketRadius: 18 },
    entityTypes: { basic: { color: '#FFD700' } },
    levels: [
      { name: 'Easy Break', subtitle: '3 balls', objective: { type: 'collect', target: 3 }, ballCount: 3, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0 },
      { name: 'Standard', subtitle: '6 balls', objective: { type: 'collect', target: 6 }, ballCount: 6, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0 },
      { name: 'Full Rack', subtitle: '10 balls', objective: { type: 'collect', target: 10 }, ballCount: 10, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0, newMechanic: 'more_balls' },
      { name: 'Time Attack', subtitle: 'Beat the clock', objective: { type: 'collect', target: 10 }, ballCount: 10, timeLimit: 120, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0 },
      { name: 'Championship', subtitle: '15 balls', objective: { type: 'collect', target: 15 }, ballCount: 15, spawnRate: 9999, spawnTypes: ['basic'], maxEnemies: 1, speedMultiplier: 1, powerUpChance: 0 }
    ]
  }
};

// ── Type detection from prompt ──────────────────────────────────────────────

function detectType(prompt) {
  const p = prompt.toLowerCase();
  if (/billiard|pool|8.?ball|snooker/.test(p)) return 'physics';
  if (/shoot|space|invader|blast|galaga|alien/.test(p)) return 'shooter';
  if (/platform|mario|jump.*over|side.?scroll/.test(p)) return 'platformer';
  if (/puzzle|match|candy|gem|jewel|bejewel/.test(p)) return 'puzzle';
  if (/snake/.test(p)) return 'snake';
  if (/dodge|flappy|avoid|evade/.test(p)) return 'dodge';
  if (/break|brick|arkanoid|pong|paddle/.test(p)) return 'breakout';
  if (/catch|collect|basket|fall.*item/.test(p)) return 'catcher';
  if (/run|runner|temple|dash|endless/.test(p)) return 'runner';
  if (/tap|click|fruit|whack|smash|pop/.test(p)) return 'tap';
  if (/angry|launch|catapult|sling/.test(p)) return 'physics';
  if (/bounc|pinball/.test(p)) return 'physics';
  return 'tap'; // safe default
}

function getDefaultConfig(typeOrPrompt) {
  let type = typeOrPrompt;
  // If it's not an exact type name, treat it as a prompt and detect the type
  if (type && !DEFAULT_CONFIGS[type]) type = detectType(type);
  const base = DEFAULT_CONFIGS[type] || DEFAULT_CONFIGS.tap;
  return JSON.parse(JSON.stringify(base)); // deep clone
}

// ── Config validation ───────────────────────────────────────────────────────

function validateAndFixConfig(config) {
  if (!config || typeof config !== 'object') return getDefaultConfig('tap');

  const validTypes = ['tap', 'dodge', 'shooter', 'runner', 'physics', 'puzzle', 'platformer', 'snake', 'breakout', 'catcher'];
  if (!validTypes.includes(config.type)) config.type = 'tap';

  // Merge missing top-level fields from defaults
  const defaults = DEFAULT_CONFIGS[config.type] || DEFAULT_CONFIGS.tap;
  if (!config.id) config.id = 'game-' + Date.now();
  if (!config.title) config.title = defaults.title;
  if (!config.subtitle) config.subtitle = defaults.subtitle;
  if (!config.tutorial) config.tutorial = defaults.tutorial;

  // Theme
  if (!config.theme || typeof config.theme !== 'object') config.theme = { ...defaults.theme };
  else {
    if (!config.theme.primary) config.theme.primary = defaults.theme.primary;
    if (!config.theme.secondary) config.theme.secondary = defaults.theme.secondary;
    if (!config.theme.background) config.theme.background = defaults.theme.background;
    if (!config.theme.backgroundAlt) config.theme.backgroundAlt = defaults.theme.backgroundAlt;
  }

  // Settings — merge with defaults
  if (!config.settings || typeof config.settings !== 'object') config.settings = { ...defaults.settings };
  else config.settings = { ...defaults.settings, ...config.settings };

  // Entity types — use from config if present, otherwise defaults
  if (!config.entityTypes || typeof config.entityTypes !== 'object' || Object.keys(config.entityTypes).length === 0) {
    config.entityTypes = defaults.entityTypes ? JSON.parse(JSON.stringify(defaults.entityTypes)) : { basic: { width: 30, height: 30, color: '#FF6B6B', health: 1, speed: 2, points: 10, shape: 'rect' } };
  }

  // PowerUps
  if (defaults.powerUps && !config.powerUps) config.powerUps = JSON.parse(JSON.stringify(defaults.powerUps));

  // Levels — use from config if present and valid, otherwise defaults
  if (!config.levels || !Array.isArray(config.levels) || config.levels.length === 0) {
    config.levels = JSON.parse(JSON.stringify(defaults.levels));
  }

  // Fix each level
  const entityKeys = Object.keys(config.entityTypes);
  config.levels.forEach((level, i) => {
    if (!level.name) level.name = 'Level ' + (i + 1);
    if (!level.subtitle) level.subtitle = '';
    if (!level.objective) level.objective = { type: 'score', target: (i + 1) * 100 };
    if (!level.background) level.background = config.theme.background;
    if (!level.spawnRate) level.spawnRate = Math.max(2000 - i * 300, 600);
    if (level.speedMultiplier === undefined) level.speedMultiplier = 1 + i * 0.25;
    if (!level.spawnTypes) level.spawnTypes = entityKeys.slice(0, Math.min(i + 1, entityKeys.length));
    if (!level.maxEnemies) level.maxEnemies = 4 + i;
    if (level.powerUpChance === undefined) level.powerUpChance = 0.1 + i * 0.03;

    // Validate spawnTypes reference existing entityTypes
    level.spawnTypes = (level.spawnTypes || []).filter(t => entityKeys.includes(t));
    if (level.spawnTypes.length === 0) level.spawnTypes = [entityKeys[0]];
  });

  return config;
}

// ── Build HTML ──────────────────────────────────────────────────────────────

function buildGameHTML(config) {
  const engineSource = getEngineSource();
  const title = String(config.title || 'Zyra Game').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${title}</title>
</head>
<body>
<script>
${engineSource}
</script>
<script>
ZyraEngine.init(${JSON.stringify(config)});
</script>
</body>
</html>`;
}

// ── Main entry point ────────────────────────────────────────────────────────

async function buildGame(userPrompt, options = {}) {
  const { onProgress, costTracker: externalCost } = options;
  const cost = externalCost || createCostTracker();
  const completedSteps = [];
  const t0 = Date.now();

  async function progress(step, message) {
    logger.info(`[engineBuilder] step=${step} — ${message}`);
    if (onProgress) await onProgress({ step, message });
  }

  // ── STEP 1: Get JSON config from Claude API (Haiku = fast + cheap) ─────
  await progress(0, 'Designing game...');

  let config;
  try {
    const configJSON = await callClaude(CONFIG_SYSTEM_PROMPT, userPrompt, {
      model: HAIKU_MODEL,
      maxTokens: 2000,
    });
    if (cost) cost.record('config-gen', CONFIG_SYSTEM_PROMPT, userPrompt, configJSON);

    // Parse JSON — clean markdown fences if present
    const cleaned = (configJSON || '').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const parseResult = safeJsonParse(cleaned);
    if (parseResult.success && parseResult.data && typeof parseResult.data === 'object') {
      config = parseResult.data;
      completedSteps.push('Config generated');
    } else {
      logger.warn(`[engineBuilder] JSON parse failed, using fallback config`);
      config = getDefaultConfig(userPrompt);
      completedSteps.push('Fallback config (parse error)');
    }
  } catch (err) {
    logger.error(`[engineBuilder] API call failed (${err.message}), using fallback config`);
    config = getDefaultConfig(userPrompt);
    completedSteps.push('Fallback config (API error)');
  }

  // ── STEP 2: Validate + fix (instant, no API call) ─────────────────────
  config = validateAndFixConfig(config);
  completedSteps.push('Config validated');

  // ── STEP 3: Assemble HTML (instant — string concat) ───────────────────
  await progress(1, 'Building game...');
  const html = buildGameHTML(config);
  completedSteps.push('HTML assembled');

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  logger.info(`[engineBuilder] done in ${elapsed}s — type=${config.type} title="${config.title}" levels=${config.levels.length}`);

  return {
    html,
    classification: {
      title: config.title,
      template: config.type,
      primaryColor: config.theme.primary,
      secondaryColor: config.theme.secondary,
      backgroundColor: config.theme.background,
      description: config.subtitle,
    },
    steps: completedSteps,
  };
}

module.exports = { buildGame, buildGameHTML, validateAndFixConfig, getDefaultConfig, DEFAULT_CONFIGS, CONFIG_SYSTEM_PROMPT };
