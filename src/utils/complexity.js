/**
 * Prompt complexity classifier for mobile game generation.
 * Returns level (simple/medium/complex), estimate, score, and detected gameType.
 * gameType is used by the inline planner to select a template without an API call.
 */

// Signals that indicate an over-ambitious or technically risky game request
const COMPLEX_SIGNALS = [
  // Multiplayer / online
  'multiplayer', 'multi-player', 'online multiplayer', 'mmo', 'mmorpg', 'pvp', 'co-op', 'co op',
  'matchmaking', 'lobby', 'server', 'backend', 'real-time multiplayer', 'live opponents',
  'leaderboard server', 'cloud save', 'remote save',
  // Massive scope
  'open world', 'sandbox', 'gta', 'minecraft-like', 'procedurally generated world',
  'rpg', 'mmorpg', 'massively multiplayer', '100 players',
  // Complex physics / engine
  '3d game', '3d engine', 'unity', 'unreal', 'godot', 'three.js', 'babylon',
  'physics engine', 'rigidbody', 'collision mesh',
  // Complex backend
  'authentication', 'user accounts', 'login system', 'supabase', 'firebase backend',
  'database', 'sql', 'api server', 'payments', 'stripe', 'in-app purchase',
  // AI / procedural
  'ai enemies', 'pathfinding', 'navmesh', 'procedural generation', 'procedural levels',
];

// Signals that indicate a straightforward, simple game
const SIMPLE_SIGNALS = [
  'tap', 'tap to', 'click to', 'clicker', 'idle', 'hypercasual', 'hyper casual',
  'simple', 'basic', 'minimal', 'casual', 'one-tap', 'one tap',
  'endless tap', 'reaction', 'reflex', 'avoid obstacles', 'dodge',
  'collect coins', 'collect items', 'score as high', 'survive as long',
];

// Game genre detection patterns — ordered most-specific to least-specific
const GAME_TYPE_PATTERNS = [
  // Idle / clicker
  { type: 'idle-clicker',  keywords: ['idle', 'clicker', 'tycoon', 'incremental', 'idle game', 'clicker game', 'tap tycoon', 'resource management game', 'cookie clicker', 'idle clicker'] },
  // Runner
  { type: 'runner',        keywords: ['runner', 'endless runner', 'infinite runner', 'dodge traffic', 'lane dodge', 'subway surfers', 'temple run', 'running game'] },
  // Platformer
  { type: 'platformer',    keywords: ['platformer', 'platform game', 'side scroller', 'side-scroller', 'jump and run', 'mario-like', 'mario style', 'jump over', 'parkour'] },
  // Survival
  { type: 'survival',      keywords: ['survival', 'wave survival', 'survive', 'waves of enemies', 'tower defense', 'defend', 'last stand', 'zombie survival', 'horde'] },
  // Top-down action
  { type: 'top-down',      keywords: ['top-down', 'top down', 'overhead', 'twin-stick', 'twin stick', 'shoot enemies', 'space shooter', 'shoot em up', 'shmup', 'bullet hell', 'asteroids'] },
  // Puzzle
  { type: 'puzzle',        keywords: ['puzzle', 'match 3', 'match-3', 'grid puzzle', 'connect', 'merge', 'slide puzzle', 'logic puzzle', 'sudoku', 'word puzzle', 'color match', 'tetris', 'block puzzle'] },
  // Arcade
  { type: 'arcade',        keywords: ['arcade', 'score attack', 'retro game', 'classic game', 'pong', 'breakout', 'snake game', 'flappy', 'whack', 'brick breaker'] },
  // Reflex / timing
  { type: 'reflex',        keywords: ['reflex', 'reaction', 'timing', 'tap at the right time', 'rhythm', 'beat', 'music game', 'timing game', 'tap when'] },
  // Strategy
  { type: 'strategy',      keywords: ['strategy', 'tower defense', 'base building', 'city builder', 'resource', 'management game', 'build and defend'] },
  // Hypercasual (catch-all for simple tap/dodge/collect)
  { type: 'hypercasual',   keywords: ['hypercasual', 'hyper casual', 'tap game', 'dodge game', 'avoid', 'catch', 'stack', 'balance', 'falling objects', 'junk falls', 'objects fall'] },
];

// Non-game signals that indicate the user may be requesting a SaaS/website instead
const NON_GAME_SIGNALS = [
  'landing page', 'landing', 'homepage', 'website', 'web site', 'saas', 'crm', 'erp',
  'admin panel', 'dashboard', 'booking system', 'e-commerce', 'ecommerce', 'online store',
  'blog', 'portfolio site', 'marketing site', 'app for business', 'business app',
  'stripe', 'supabase', 'auth system', 'login system', 'user management',
];

function detectGameType(text) {
  for (const { type, keywords } of GAME_TYPE_PATTERNS) {
    if (keywords.some((kw) => text.includes(kw))) return type;
  }
  return 'generic-game';
}

function isNonGameRequest(prompt) {
  const text = prompt.toLowerCase();
  // If non-game signals appear without any game signals, it's likely not a game
  const hasNonGame = NON_GAME_SIGNALS.some((kw) => text.includes(kw));
  const hasGame = [
    ...GAME_TYPE_PATTERNS.flatMap((p) => p.keywords),
    'game', 'play', 'player', 'level', 'score', 'lives', 'enemies', 'coins',
  ].some((kw) => text.includes(kw));
  return hasNonGame && !hasGame;
}

function classifyComplexity(prompt) {
  const text  = prompt.toLowerCase().trim();
  const chars = prompt.length;
  const words = text.split(/\s+/).length;

  let score = 0;

  // Length signals
  if (chars > 300)  score += 1;
  if (chars > 800)  score += 1;
  if (chars > 1500) score += 2;
  if (words > 50)   score += 1;
  if (words > 150)  score += 2;

  // Keyword signals
  COMPLEX_SIGNALS.forEach((kw) => { if (text.includes(kw)) score += 2; });
  SIMPLE_SIGNALS.forEach((kw)  => { if (text.includes(kw)) score -= 2; });

  score = Math.max(0, score);

  const gameType = detectGameType(text);

  // Complex game types always need real generation (no inline template sufficient)
  const complexGameTypes = new Set(['survival', 'top-down', 'strategy', 'platformer']);
  if (complexGameTypes.has(gameType) && score <= 1) score = 2; // force medium minimum

  if (score <= 1) return { level: 'simple',  score, estimate: '20–60 seconds', appType: gameType };
  if (score <= 5) return { level: 'medium',  score, estimate: '1–3 minutes',   appType: gameType };
  return              { level: 'complex', score, estimate: '3–8 minutes',   appType: gameType };
}

module.exports = { classifyComplexity, detectAppType: detectGameType, detectGameType, isNonGameRequest };
