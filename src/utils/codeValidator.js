/**
 * codeValidator.js
 *
 * Static analysis of generated code files to detect common errors
 * before they reach the preview. Conservative by design — only flags
 * high-confidence issues to minimise false positives.
 *
 * Checks:
 *   HTML — unclosed <script> tags, inline JS issues
 *   JS   — const reassignment, severe brace imbalance
 */

const logger = require('./logger');

/**
 * Validates an array of generated file objects.
 * @param {Array<{path: string, content: string}>} files
 * @returns {Array<{type: string, file: string, message: string}>}
 */
function validateGeneratedCode(files) {
  const errors = [];
  for (const file of (files || [])) {
    const filePath = file.path || '';
    const content  = file.content || '';
    const ext      = filePath.split('.').pop().toLowerCase();

    try {
      if (ext === 'html') errors.push(...validateHtml(filePath, content));
      else if (ext === 'js') errors.push(...validateJs(filePath, content));
    } catch (e) {
      logger.debug(`codeValidator: error while validating ${filePath}: ${e.message}`);
    }
  }
  return errors;
}

// ── HTML validation ────────────────────────────────────────────────────────────

function validateHtml(filePath, content) {
  const errors = [];

  // 1. Unclosed <script> tags
  const scriptOpens  = (content.match(/<script(\s[^>]*)?\s*>/gi) || []).length;
  const scriptCloses = (content.match(/<\/script>/gi) || []).length;
  if (scriptOpens > scriptCloses) {
    errors.push({
      type: 'syntax',
      file: filePath,
      message: `Unclosed <script> tag (${scriptOpens} open, ${scriptCloses} close)`,
    });
  }

  // 2. Validate JS inside <script> blocks
  const scriptRe = /<script(?:\s[^>]*)?\s*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(content)) !== null) {
    const jsContent = m[1] || '';
    if (jsContent.trim()) {
      const jsErrors = validateJs(filePath, jsContent);
      errors.push(...jsErrors);
    }
  }

  return errors;
}

// ── JS validation ──────────────────────────────────────────────────────────────

function validateJs(filePath, content) {
  const errors = [];

  // Strip comments and strings to avoid false matches inside them
  const stripped = stripCommentsAndStrings(content);

  // 1. Const reassignment
  // Find all `const varName =` declarations, then check if varName is reassigned
  const constDeclRe = /\bconst\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
  let decl;
  const declared = new Map(); // varName → index of declaration

  while ((decl = constDeclRe.exec(stripped)) !== null) {
    // Don't flag destructuring consts (too many false positives)
    const varName = decl[1];
    if (!declared.has(varName)) {
      declared.set(varName, decl.index);
    }
  }

  for (const [varName, declIdx] of declared) {
    // Look for `varName =` that is NOT `varName ==` / `varName ===` / `varName =>`
    // and NOT the original const declaration itself
    const rePattern = new RegExp(
      `(?<![.?'"\`\\w])${escapeRegex(varName)}\\s*=[^=>]`,
      'g',
    );
    let re;
    while ((re = rePattern.exec(stripped)) !== null) {
      // Allow if it's within 5 chars of the original declaration (same statement)
      if (Math.abs(re.index - declIdx) <= varName.length + 10) continue;
      // Found a reassignment
      errors.push({
        type: 'const_reassignment',
        file: filePath,
        message: `"${varName}" is declared with const but reassigned later — use let instead`,
      });
      break; // only report once per variable
    }
  }

  // 2. Severe brace imbalance (only flag large discrepancies to avoid false positives)
  const opens  = (stripped.match(/\{/g) || []).length;
  const closes = (stripped.match(/\}/g) || []).length;
  const diff   = Math.abs(opens - closes);
  // Only flag if imbalance is > 3 (small imbalances can be template literals or false strips)
  if (diff > 3) {
    errors.push({
      type: 'syntax',
      file: filePath,
      message: `Mismatched braces: ${opens} opening { vs ${closes} closing } (diff ${diff})`,
    });
  }

  return errors;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Removes string literals and comments from JS code.
 * Replaces them with empty equivalents to preserve character positions approximately.
 */
function stripCommentsAndStrings(code) {
  let result = '';
  let i = 0;
  while (i < code.length) {
    // Template literal
    if (code[i] === '`') {
      result += '`';
      i++;
      while (i < code.length && code[i] !== '`') {
        if (code[i] === '\\') { result += '  '; i += 2; continue; }
        result += ' ';
        i++;
      }
      result += '`';
      i++;
      continue;
    }
    // Double-quoted string
    if (code[i] === '"') {
      result += '"';
      i++;
      while (i < code.length && code[i] !== '"') {
        if (code[i] === '\\') { result += '  '; i += 2; continue; }
        result += ' ';
        i++;
      }
      result += '"';
      i++;
      continue;
    }
    // Single-quoted string
    if (code[i] === "'") {
      result += "'";
      i++;
      while (i < code.length && code[i] !== "'") {
        if (code[i] === '\\') { result += '  '; i += 2; continue; }
        result += ' ';
        i++;
      }
      result += "'";
      i++;
      continue;
    }
    // Single-line comment
    if (code[i] === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') { result += ' '; i++; }
      continue;
    }
    // Multi-line comment
    if (code[i] === '/' && code[i + 1] === '*') {
      result += '  ';
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        result += code[i] === '\n' ? '\n' : ' ';
        i++;
      }
      result += '  ';
      i += 2;
      continue;
    }
    result += code[i];
    i++;
  }
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Quick fixes ────────────────────────────────────────────────────────────────

/**
 * Applies regex-based fixes for simple, high-confidence errors without an AI call.
 * Currently handles: const_reassignment → replaces `const varName =` with `let varName =`.
 *
 * @param {Array<{path: string, content: string}>} files
 * @param {Array<{type: string, file: string, message: string}>} errors
 * @returns {Array<{path: string, content: string}>} fixed files (same reference if nothing changed)
 */
function applyQuickFixes(files, errors) {
  // Collect const→let targets grouped by file
  const fixesByFile = new Map();
  for (const e of errors) {
    if (e.type !== 'const_reassignment') continue;
    const match = e.message.match(/"([^"]+)" is declared with const/);
    if (!match) continue;
    if (!fixesByFile.has(e.file)) fixesByFile.set(e.file, new Set());
    fixesByFile.get(e.file).add(match[1]);
  }
  if (fixesByFile.size === 0) return files;

  let anyChanged = false;
  const result = files.map((f) => {
    const vars = fixesByFile.get(f.path);
    if (!vars || vars.size === 0) return f;
    let content = f.content;
    for (const varName of vars) {
      content = content.replace(
        new RegExp(`\\bconst\\s+(${escapeRegex(varName)})\\s*=`, 'g'),
        'let $1 =',
      );
    }
    if (content === f.content) return f;
    anyChanged = true;
    return { ...f, content };
  });

  return anyChanged ? result : files;
}

// ── Game playability validation ────────────────────────────────────────────────

/**
 * Extracts all JavaScript source from a file set (inline <script> blocks + .js files).
 */
function extractAllJs(files) {
  const parts = [];
  for (const f of files) {
    const content = f.content || '';
    if (f.path.endsWith('.js')) {
      parts.push(content);
    } else if (f.path.endsWith('.html')) {
      const re = /<script(?:\s[^>]*)?\s*>([\s\S]*?)<\/script>/gi;
      let m;
      while ((m = re.exec(content)) !== null) {
        if (m[1]?.trim()) parts.push(m[1]);
      }
    }
  }
  return parts.join('\n');
}

/**
 * Validates that a generated game is actually playable.
 * Checks for the five most common critical failure modes.
 *
 * @param {Array<{path: string, content: string}>} files
 * @returns {{ critical: Array<{type: string, message: string}>, warnings: Array<{type: string, message: string}> }}
 */
function validateGamePlayability(files) {
  const critical = [];
  const warnings = [];

  const allJs   = extractAllJs(files);
  const allHtml = (files.filter(f => f.path.endsWith('.html')).map(f => f.content || '').join('\n'));

  if (!allJs.trim()) {
    critical.push({ type: 'no_js', message: 'No JavaScript found — game cannot run' });
    return { critical, warnings };
  }

  // 1. Game loop — requestAnimationFrame is mandatory
  if (!/requestAnimationFrame/i.test(allJs)) {
    critical.push({
      type: 'no_game_loop',
      message: 'No requestAnimationFrame found — add a rAF game loop: function gameLoop(ts){...} requestAnimationFrame(gameLoop)',
    });
  }

  // 2. Touch / pointer controls
  if (!/pointerdown|touchstart/i.test(allJs)) {
    critical.push({
      type: 'no_touch_controls',
      message: 'No pointerdown/touchstart event — add: canvas.addEventListener("pointerdown", e => { handleTap(e); })',
    });
  }

  // 3. Canvas rendering context
  if (!/getContext/i.test(allJs)) {
    critical.push({
      type: 'no_canvas_context',
      message: 'No getContext() call found — add: const ctx = canvas.getContext("2d")',
    });
  }

  // 4. Canvas element in HTML
  if (allHtml && !/<canvas/i.test(allHtml)) {
    critical.push({
      type: 'no_canvas_element',
      message: 'No <canvas> element in HTML — add: <canvas id="game-canvas"></canvas>',
    });
  }

  // 5. Empty stub functions (3+ empty bodies = incomplete game)
  const emptyFuncMatches = allJs.match(/function\s+\w+\s*\([^)]*\)\s*\{\s*\}/g) || [];
  if (emptyFuncMatches.length >= 3) {
    critical.push({
      type: 'stub_functions',
      message: `${emptyFuncMatches.length} empty stub functions — implement core game logic (update, draw, collision, etc.)`,
    });
  }

  // 6. TODO comments signal unimplemented features
  const todoCount = (allJs.match(/\/\/\s*TODO/gi) || []).length;
  if (todoCount > 0) {
    critical.push({
      type: 'todo_comments',
      message: `${todoCount} TODO comment(s) — replace all TODO stubs with real implementations`,
    });
  }

  // 7. alert() / confirm() — disruptive on mobile, block touch events
  if (/\balert\s*\(|\bconfirm\s*\(/i.test(allJs)) {
    critical.push({
      type: 'disruptive_dialog',
      message: 'alert() or confirm() found — these block touch input on mobile; replace with canvas-drawn overlays',
    });
  }

  // 8. Score variable exists but never drawn — invisible progress
  const hasScore = /\bscore\b/i.test(allJs);
  const drawsScore = /fillText.*score|score.*fillText|innerHTML.*score|score.*innerHTML|textContent.*score|score.*textContent/i.test(allJs);
  if (hasScore && !drawsScore) {
    warnings.push({ type: 'score_not_displayed', message: 'score variable exists but never drawn to canvas or HUD — add a fillText(score, ...) call' });
  }

  // 9. Missing game state machine — critical for screen management
  if (!/gameState|game_state|currentState|State\s*=\s*\{/i.test(allJs)) {
    critical.push({
      type: 'no_state_machine',
      message: 'No game state machine found — add: const State = { MENU:0, PLAYING:1, PAUSED:2, GAMEOVER:3 }; let currentState = State.MENU;',
    });
  }

  // 10. Missing restart/reset — player stuck after game over
  if (!/restart|resetGame|initGame|startGame|resetGameSpecificState/i.test(allJs)) {
    critical.push({
      type: 'no_restart',
      message: 'No restart/reset function — add a function that resets score, enemies, and game state so player can retry',
    });
  }

  // 11. Missing menu screen — game has no entry point
  const hasMenuScreen = /screen-menu|menu-screen|menuScreen|showMenu|State\.MENU|MENU/i.test(allJs) ||
    /id=["']screen-menu|id=["']menu/i.test(allHtml);
  if (!hasMenuScreen) {
    critical.push({
      type: 'no_menu_screen',
      message: 'No menu/title screen found — add a MENU screen with Play button, title, and high score display',
    });
  }

  // 12. Missing game over screen — no feedback when player loses
  const hasGameOver = /game.?over|gameover|screen-gameover|GAMEOVER|State\.GAMEOVER/i.test(allJs) ||
    /id=["']screen-gameover|id=["']gameover/i.test(allHtml);
  if (!hasGameOver) {
    critical.push({
      type: 'no_gameover_screen',
      message: 'No game over screen found — add a GAME OVER overlay with final score, high score, star rating, and Play Again button',
    });
  }

  // 13. Missing pause functionality — mandatory for mobile games
  const hasPause = /pause|PAUSED|State\.PAUSED|isPaused/i.test(allJs);
  if (!hasPause) {
    warnings.push({
      type: 'no_pause',
      message: 'No pause functionality found — add a pause button that freezes all game logic, physics, and timers',
    });
  }

  // 14. Missing audio/sound system — games feel lifeless without sound
  const hasAudio = /AudioContext|webkitAudioContext|playTone|sfx|createOscillator/i.test(allJs);
  if (!hasAudio) {
    warnings.push({
      type: 'no_audio',
      message: 'No Web Audio API sound system — add sfxTap(), sfxScore(), sfxHit(), sfxGameOver() using oscillators',
    });
  }

  // 15. Missing high score persistence
  if (!/localStorage/i.test(allJs)) {
    warnings.push({ type: 'no_persistence', message: 'No localStorage usage — best score will not persist between sessions' });
  }

  return { critical, warnings };
}

module.exports = { validateGeneratedCode, applyQuickFixes, validateGamePlayability };
