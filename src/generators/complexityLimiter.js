/**
 * complexityLimiter.js
 *
 * Before generation, estimates project complexity risk.
 * Strips impossible features and simplifies over-engineered scopes.
 * Returns a scope reduction note to inject into the planner prompt.
 */

// ── Impossible features — never attempt ────────────────────────────────────────
// Require server infrastructure, 3D engines, or multi-device coordination.
const IMPOSSIBLE_PATTERNS = [
  { re: /\breal-?time\s+multiplayer\b|\breal-?time\s+pvp\b|\bonline\s+multiplayer\b/i, label: 'real-time multiplayer' },
  { re: /\bmultiplayer\b|\bmulti-?player\b/i, label: 'multiplayer' },
  { re: /\bmmo\b|\bmassivelymultiplayer\b/i, label: 'MMO' },
  { re: /\bopen[- ]world\b/i, label: 'open world' },
  { re: /\bthree\.?js\b|\bwebgl\b|\bbabylon\.?js\b/i, label: '3D engine (Three.js/Babylon)' },
  { re: /\bfull\s+3d\b|\btrue\s+3d\b|\b3d\s+game\b/i, label: '3D graphics' },
  { re: /\bbox2d\b|\bmatter\.?js\b|\brapier\b|\bbullet\.?js\b/i, label: 'physics engine library' },
  { re: /\blive[-\s]service\b|\bseasonal\s+content\b|\bserver-?side\b/i, label: 'live-service backend' },
  { re: /\bcloud\s+save\b|\bremote\s+save\b|\bonline\s+save\b/i, label: 'cloud save' },
  { re: /\bglobal\s+leaderboard\b|\bonline\s+leaderboard\b|\bserver\s+leaderboard\b/i, label: 'global leaderboard' },
  { re: /\buser\s+auth(?:entication)?\b|\bsign[- ]in\b|\bregister\b|\baccount\s+system\b/i, label: 'user authentication' },
  { re: /\breal-?time\s+chat\b|\bin-?game\s+chat\b/i, label: 'real-time chat' },
];

// ── High-risk features — reduce scope if too many ──────────────────────────────
const HIGH_RISK_PATTERNS = [
  { re: /\bcrafting\b/i, label: 'crafting system' },
  { re: /\binventory\b/i, label: 'inventory system' },
  { re: /\bskill[- ]tree\b/i, label: 'skill tree' },
  { re: /\bquest\b|\bmission\s+system\b/i, label: 'quest system' },
  { re: /\bdialogue?\s+system\b|\bbranching\s+dialogue?\b/i, label: 'dialogue system' },
  { re: /\blevel\s+editor\b|\bmap\s+editor\b/i, label: 'level editor' },
  { re: /\bcustom\s+physics\b|\bphysics\s+simulation\b/i, label: 'custom physics' },
  { re: /\bpathfinding\b|\bnavmesh\b|\ba[-*]\s+algorithm\b/i, label: 'AI pathfinding' },
  { re: /\bprocedural\s+gen(?:eration)?\b|\bprocgen\b/i, label: 'procedural generation' },
  { re: /\bcharacter\s+class(?:es)?\b|\bclass\s+selection\b|\bhero\s+select\b/i, label: 'character selection' },
  { re: /\bcutscene\b|\bstory\s+mode\b|\bnarrative\b/i, label: 'story/cutscene' },
  { re: /\bcomplex\s+save\b|\bprogression\s+save\b|\bworld\s+state\s+save\b/i, label: 'complex save system' },
  { re: /\bdestructible\b/i, label: 'destructible environment' },
  { re: /\bdynamic\s+lighting\b|\bshadow\s+system\b/i, label: 'dynamic lighting/shadows' },
];

const HIGH_RISK_THRESHOLD = 3; // More than N signals → reduce scope

/**
 * Assesses complexity risk of a game prompt.
 *
 * @param {string} prompt
 * @returns {{
 *   risk: 'safe'|'medium'|'high'|'impossible',
 *   impossible: string[],
 *   highRisk: string[],
 *   scopeNote: string
 * }}
 */
function assessComplexity(prompt) {
  const impossible = IMPOSSIBLE_PATTERNS
    .filter(p => p.re.test(prompt))
    .map(p => p.label);

  const highRisk = HIGH_RISK_PATTERNS
    .filter(p => p.re.test(prompt))
    .map(p => p.label);

  let risk = 'safe';
  if (impossible.length > 0)                    risk = 'impossible';
  else if (highRisk.length >= HIGH_RISK_THRESHOLD) risk = 'high';
  else if (highRisk.length > 0)                 risk = 'medium';

  return {
    risk,
    impossible,
    highRisk,
    scopeNote: buildScopeReductionNote(risk, impossible, highRisk),
  };
}

/**
 * Builds a scope-reduction note to inject into the planner or coder prompt.
 * Returns empty string if no reduction is needed.
 *
 * @param {'safe'|'medium'|'high'|'impossible'} risk
 * @param {string[]} impossible
 * @param {string[]} highRisk
 * @returns {string}
 */
function buildScopeReductionNote(risk, impossible, highRisk) {
  if (risk === 'safe') return '';

  const lines = [];

  if (impossible.length > 0) {
    lines.push(
      `SCOPE REDUCTION — these features are impossible in a single-file HTML5 Canvas game and have been REMOVED: ${impossible.join(', ')}.`,
      `Replace with local-only equivalents: multiplayer→AI opponent, global leaderboard→local best score (localStorage), cloud save→localStorage, 3D→top-down 2D.`
    );
  }

  if (highRisk.length >= HIGH_RISK_THRESHOLD) {
    lines.push(
      `COMPLEXITY REDUCTION — too many complex systems requested (${highRisk.join(', ')}). ` +
      `Implement a focused MVP with at most 2 core systems. Drop everything else — a smaller working game beats a larger broken one.`
    );
  } else if (highRisk.length > 0) {
    lines.push(
      `SCOPE NOTE — high-risk systems detected: ${highRisk.join(', ')}. ` +
      `Only include a system if it is the core mechanic. Skip any system that is not essential for the first play session.`
    );
  }

  return lines.join('\n');
}

module.exports = { assessComplexity, buildScopeReductionNote };
