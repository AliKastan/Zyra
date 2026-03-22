/**
 * engineBuilder.js
 *
 * Engine-based game generation pipeline. Instead of asking the AI to write game code,
 * this asks it to output a JSON config. The pre-built Zyra Engine (zyra-engine.js)
 * reads the config and builds the entire game automatically.
 *
 * This changes the problem from "write 600 lines of bug-free JavaScript" to
 * "output 50 lines of JSON config" — dramatically more reliable.
 */

const path = require('path');
const fse = require('fs-extra');
const { callClaude, HAIKU_MODEL, SONNET_MODEL } = require('../providers/anthropicProvider');
const { safeJsonParse } = require('../utils/safeJsonParse');
const { createCostTracker } = require('../utils/costTracker');
const logger = require('../utils/logger');

const ENGINE_DIR = path.resolve(__dirname, '../../public/engine');

// ── System prompt for JSON config generation ────────────────────────────────

const CONFIG_SYSTEM_PROMPT = `You are Zyra Config Generator. You generate JSON game configurations for the Zyra Game Engine. You NEVER write HTML, CSS, or JavaScript code. You ONLY output valid JSON.

Given a user's game description, output a complete game config JSON object.

Available game types: tap, dodge, shooter, runner, physics, puzzle, platformer, snake, breakout, catcher

Choose the type that best matches the user's description:
- "billiards/pool/8-ball" → type: "physics", physicsMode: "topdown"
- "angry birds/launch/catapult/slingshot" → type: "physics", physicsMode: "launch"
- "bouncing balls/pong" → type: "physics", physicsMode: "bounce"
- "fruit ninja/whack-a-mole/tap targets" → type: "tap"
- "flappy bird/avoid/dodge" → type: "dodge"
- "space invaders/shoot enemies/shooter" → type: "shooter"
- "mario/jump/platforms" → type: "platformer"
- "candy crush/match-3/gem/jewel" → type: "puzzle"
- "snake" → type: "snake"
- "breakout/brick breaker/arkanoid" → type: "breakout"
- "catch falling/basket" → type: "catcher"
- "endless runner/temple run/run" → type: "runner"

REQUIRED JSON SCHEMA:
{
  "id": "kebab-case-id",
  "type": "one of the types above",
  "physicsMode": "topdown|launch|bounce (only for type physics)",
  "title": "CATCHY TITLE IN CAPS",
  "subtitle": "3-5 word description",
  "tutorial": "HTML string with <br> breaks explaining controls",
  "theme": {
    "primary": "#hex (main accent)",
    "secondary": "#hex (secondary accent)",
    "background": "#hex (dark background)",
    "backgroundAlt": "#hex (slightly different dark bg)"
  },
  "settings": {
    "lives": 3,
    ...type-specific settings (playerWidth, playerHeight, playerColor, fireRate, etc.)
  },
  "entityTypes": {
    "basic": { "width": 30, "height": 30, "color": "#hex", "health": 1, "speed": 2, "points": 10, "shape": "rect|circle" },
    ...more types as needed
  },
  "powerUps": {
    "shield": { "color": "#hex", "icon": "S", "duration": 8 },
    "rapid": { "color": "#hex", "icon": "R", "duration": 5 },
    ...optional
  },
  "levels": [
    {
      "name": "Level Name",
      "subtitle": "description",
      "objective": { "type": "score|survive|destroy|collect", "target": number },
      "timeLimit": optional_seconds,
      "background": "#hex",
      "spawnRate": ms_between_spawns,
      "spawnTypes": ["basic", "fast"],
      "maxEnemies": number,
      "speedMultiplier": 1.0,
      "powerUpChance": 0.1,
      "newMechanic": "description_or_null",
      "boss": optional_boss_config
    },
    ...exactly 5 levels with increasing difficulty
  ]
}

RULES:
1. Output ONLY valid JSON. No markdown, no explanations, no backticks.
2. Every config must have exactly 5 levels with increasing difficulty.
3. Level 3 should introduce a new mechanic. Level 5 should be the hardest challenge.
4. Colors must be valid hex codes that look good together.
5. All numerical values must be reasonable (speeds 1-10, sizes 20-100px, spawn rates 500-3000ms).
6. Tutorial text must clearly explain the controls.
7. Title must be catchy and fun. Subtitle describes the game in 3-5 words.
8. The game must be FUN — good difficulty curve, satisfying, not frustrating.
9. entityTypes must define all enemy/target types the levels reference.
10. Each level's spawnTypes must only reference keys that exist in entityTypes.
11. For physics/topdown type: include "settings.gravity": {"x":0,"y":0}, "settings.linearDamping": 1.8, "settings.ballRadius", "settings.pocketRadius", "settings.maxPower", "settings.ballRestitution".
12. For snake type: include "settings.cellSize" and "settings.moveInterval".
13. For breakout type: include "settings.paddleWidth", "settings.ballRadius", "settings.ballSpeed", "settings.brickCols", "settings.brickRows".
14. For puzzle type: include "settings.cols" and "settings.rows".
15. Do NOT use emoji in icon fields — use single letters (S, R, X, +, etc.).
16. Boss config (level 5 for shooter): { "name": "BOSS NAME", "width": 100, "height": 60, "color": "#hex", "health": 15, "patterns": ["spread_shot","charge","spawn_minions"], "patternDuration": 3, "pauseDuration": 1.5 }`;


// ── Load engine source ──────────────────────────────────────────────────────

let _engineSource = null;

async function getEngineSource() {
  if (!_engineSource) {
    _engineSource = await fse.readFile(path.join(ENGINE_DIR, 'zyra-engine.js'), 'utf8');
  }
  return _engineSource;
}


// ── Config validation & repair ──────────────────────────────────────────────

function validateAndFixConfig(config) {
  if (!config || typeof config !== 'object') {
    config = {};
  }
  if (!config.id) config.id = 'game-' + Date.now();
  if (!config.type) config.type = 'tap';
  if (!config.title) config.title = 'MY GAME';
  if (!config.subtitle) config.subtitle = 'A fun game';
  if (!config.tutorial) config.tutorial = 'Tap to play!';

  // Theme
  if (!config.theme) config.theme = {};
  if (!config.theme.primary) config.theme.primary = '#00D4FF';
  if (!config.theme.secondary) config.theme.secondary = '#7B2FFF';
  if (!config.theme.background) config.theme.background = '#0A0A2E';
  if (!config.theme.backgroundAlt) config.theme.backgroundAlt = '#0D0D3A';

  // Settings
  if (!config.settings) config.settings = {};
  if (!config.settings.lives) config.settings.lives = 3;

  // Entity types
  if (!config.entityTypes) {
    config.entityTypes = {
      basic: { width: 30, height: 30, color: '#FF6B6B', health: 1, speed: 2, points: 10, shape: 'rect' }
    };
  }

  // Levels
  if (!config.levels || !Array.isArray(config.levels) || config.levels.length === 0) {
    config.levels = generateDefaultLevels(config.type);
  }

  // Fix each level
  config.levels.forEach(function (level, i) {
    if (!level.name) level.name = 'Level ' + (i + 1);
    if (!level.subtitle) level.subtitle = '';
    if (!level.objective) level.objective = { type: 'score', target: (i + 1) * 100 };
    if (!level.background) level.background = config.theme.background;
    if (!level.spawnRate) level.spawnRate = Math.max(2000 - i * 300, 600);
    if (!level.speedMultiplier) level.speedMultiplier = 1 + i * 0.25;
    if (!level.spawnTypes) level.spawnTypes = Object.keys(config.entityTypes).slice(0, Math.min(i + 1, Object.keys(config.entityTypes).length));
    if (!level.maxEnemies) level.maxEnemies = 4 + i;
    if (level.powerUpChance === undefined) level.powerUpChance = 0.1 + i * 0.03;
  });

  // Validate spawnTypes reference existing entityTypes
  var entityKeys = Object.keys(config.entityTypes);
  config.levels.forEach(function (level) {
    if (level.spawnTypes) {
      level.spawnTypes = level.spawnTypes.filter(function (t) {
        return entityKeys.indexOf(t) !== -1;
      });
      if (level.spawnTypes.length === 0) {
        level.spawnTypes = [entityKeys[0]];
      }
    }
  });

  return config;
}

function generateDefaultLevels(type) {
  return [
    { name: 'Level 1', subtitle: 'Getting started', objective: { type: 'score', target: 80 }, spawnRate: 2000, speedMultiplier: 1.0, maxEnemies: 4, powerUpChance: 0.1 },
    { name: 'Level 2', subtitle: 'Picking up pace', objective: { type: 'score', target: 200 }, spawnRate: 1600, speedMultiplier: 1.2, maxEnemies: 5, powerUpChance: 0.12 },
    { name: 'Level 3', subtitle: 'New challenge', objective: { type: 'destroy', target: 15 }, spawnRate: 1200, speedMultiplier: 1.5, maxEnemies: 6, powerUpChance: 0.15, newMechanic: 'harder_enemies' },
    { name: 'Level 4', subtitle: 'The gauntlet', objective: { type: 'score', target: 500 }, spawnRate: 900, speedMultiplier: 1.7, maxEnemies: 7, powerUpChance: 0.18, timeLimit: 60 },
    { name: 'Level 5', subtitle: 'The finale', objective: { type: 'score', target: 800 }, spawnRate: 700, speedMultiplier: 2.0, maxEnemies: 8, powerUpChance: 0.2 }
  ];
}


// ── Build HTML from engine + config ─────────────────────────────────────────

async function buildGameHTML(config) {
  const engineSource = await getEngineSource();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${escapeHtml(config.title || 'Zyra Game')}</title>
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

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ── Default configs for fallback ────────────────────────────────────────────

function getDefaultConfig(typeOrPrompt) {
  var type = typeOrPrompt;
  if (type && type.length > 20) {
    // It's a prompt, guess the type
    var p = type.toLowerCase();
    if (/shoot|space|invader|blast/.test(p)) type = 'shooter';
    else if (/dodge|flappy|avoid/.test(p)) type = 'dodge';
    else if (/tap|whack|fruit|smash/.test(p)) type = 'tap';
    else if (/match|puzzle|gem|candy/.test(p)) type = 'puzzle';
    else if (/snake/.test(p)) type = 'snake';
    else if (/break|brick|arkanoid/.test(p)) type = 'breakout';
    else if (/catch|basket|fall/.test(p)) type = 'catcher';
    else if (/run|runner|temple/.test(p)) type = 'runner';
    else if (/jump|platform|mario/.test(p)) type = 'platformer';
    else if (/pool|billiard|physics/.test(p)) type = 'physics';
    else type = 'tap'; // safe default
  }

  return {
    id: 'default-' + type,
    type: type || 'tap',
    title: 'QUICK GAME',
    subtitle: 'A fun ' + (type || 'tap') + ' game',
    tutorial: 'Tap or drag to play!',
    theme: { primary: '#00D4FF', secondary: '#7B2FFF', background: '#0A0A2E', backgroundAlt: '#0D0D3A' },
    settings: { lives: 3 },
    entityTypes: {
      basic: { width: 30, height: 30, color: '#FF6B6B', health: 1, speed: 2, points: 10, shape: 'rect' },
      fast: { width: 24, height: 24, color: '#FBBF24', health: 1, speed: 4, points: 20, shape: 'circle' }
    },
    levels: generateDefaultLevels(type)
  };
}


// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Build a game using the Zyra Engine + JSON config approach.
 *
 * @param {string} userPrompt - The user's game description
 * @param {object} [options]
 * @param {Function} [options.onProgress] - Called with { step, message }
 * @param {object} [options.costTracker] - Cost tracking instance
 * @returns {Promise<{ html: string, classification: { title: string, template: string }, steps: string[] }>}
 */
async function buildGame(userPrompt, options = {}) {
  const { onProgress, costTracker: externalCost } = options;
  const cost = externalCost || createCostTracker();
  const completedSteps = [];

  function progress(step, message) {
    logger.info(`[engineBuilder] step=${step} — ${message}`);
    if (onProgress) onProgress({ step, message });
  }

  // ── STEP 1: Get JSON config from Claude API ──────────────────────────────
  progress(0, 'Designing game...');

  let configJSON;
  try {
    configJSON = await callClaude(CONFIG_SYSTEM_PROMPT, userPrompt, {
      model: SONNET_MODEL,
      maxTokens: 4000,
    });
    if (cost) cost.record('config-gen', CONFIG_SYSTEM_PROMPT, userPrompt, configJSON);
  } catch (err) {
    logger.error(`[engineBuilder] config generation failed: ${err.message}`);
    // Use default config
    const config = getDefaultConfig(userPrompt);
    config.title = extractTitle(userPrompt);
    const html = await buildGameHTML(config);
    completedSteps.push('Default config (API error)');
    return {
      html,
      classification: { title: config.title, template: config.type, primaryColor: config.theme.primary, secondaryColor: config.theme.secondary, backgroundColor: config.theme.background, description: config.subtitle },
      steps: completedSteps,
    };
  }

  completedSteps.push('Config generated');

  // ── STEP 2: Parse JSON ─────────────────────────────────────────────────
  progress(1, 'Building game...');

  let config;
  // Try to clean and parse
  let cleaned = (configJSON || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  const parseResult = safeJsonParse(cleaned);
  if (parseResult.success && parseResult.data) {
    config = parseResult.data;
  } else {
    // Try a repair call
    logger.warn(`[engineBuilder] JSON parse failed, attempting repair...`);
    try {
      const fixedJSON = await callClaude(
        'Fix this broken JSON and return ONLY valid JSON. No explanations.',
        'Broken JSON:\n' + cleaned.substring(0, 3000) + '\n\nError: ' + (parseResult.error || 'invalid JSON'),
        { model: HAIKU_MODEL, maxTokens: 4000 }
      );
      if (cost) cost.record('config-repair', 'fix json', cleaned.substring(0, 500), fixedJSON);

      const repairResult = safeJsonParse(fixedJSON.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
      if (repairResult.success && repairResult.data) {
        config = repairResult.data;
        completedSteps.push('Config repaired');
      }
    } catch (repairErr) {
      logger.warn(`[engineBuilder] repair also failed: ${repairErr.message}`);
    }

    if (!config) {
      // Use default
      config = getDefaultConfig(userPrompt);
      config.title = extractTitle(userPrompt);
      completedSteps.push('Default config (parse failure)');
    }
  }

  // ── STEP 3: Validate and fix config ───────────────────────────────────
  config = validateAndFixConfig(config);
  completedSteps.push('Config validated');

  // ── STEP 4: Build HTML ─────────────────────────────────────────────────
  progress(2, 'Assembling game...');
  const html = await buildGameHTML(config);
  completedSteps.push('HTML assembled');

  logger.info(`[engineBuilder] complete — type=${config.type} title="${config.title}" levels=${config.levels.length}`);

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

function extractTitle(prompt) {
  // Try to extract a game-like title from the prompt
  var words = prompt.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).slice(0, 4);
  return words.map(function (w) { return w.toUpperCase(); }).join(' ');
}

module.exports = { buildGame, buildGameHTML, validateAndFixConfig, getDefaultConfig, CONFIG_SYSTEM_PROMPT };
