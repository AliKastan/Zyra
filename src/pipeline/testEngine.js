/**
 * testEngine.js
 *
 * Server-side test runner for generated game HTML. Validates structure by
 * checking for required DOM elements, script patterns, and common errors.
 *
 * Note: Full runtime testing (iframe sandbox) happens client-side in the
 * quality pipeline (frontend/app.js). This module does static/structural
 * analysis that can run on the server without a browser.
 */

const logger = require('../utils/logger');

// Required element IDs — each entry is an array of acceptable alternatives.
// A test passes if ANY id in the group is found.
const REQUIRED_ID_GROUPS = [
  ['screen-menu'],
  ['screen-game', 'game-area', 'game-canvas', 'gameCanvas'],
  ['screen-pause'],
  ['screen-gameover', 'screen-game-over'],
  ['btn-play', 'btn-start', 'startBtn'],
  ['btn-pause', 'pauseBtn'],
  ['btn-resume', 'resumeBtn'],
  ['btn-restart', 'btn-retry', 'btn-gameover-restart', 'btn-play-again', 'restartBtn'],
  ['btn-menu', 'btn-gameover-menu', 'btn-quit', 'menuBtn'],
  ['score-value', 'score', 'scoreValue', 'score-display'],
];

// Patterns that should exist in valid game code
const REQUIRED_PATTERNS = [
  { pattern: /State\s*[=:]\s*\{|gameState|currentState|state\s*===/, name: 'State machine' },
  { pattern: /changeState|setState|showScreen|setScreen/, name: 'State transition function' },
  { pattern: /requestAnimationFrame/, name: 'Animation frame loop' },
  { pattern: /cancelAnimationFrame|animFrameId|animationId|cancelAnimationFrame|rafId/, name: 'Animation frame cleanup' },
  { pattern: /localStorage/, name: 'High score persistence' },
  { pattern: /touchstart|pointerdown|touchmove/, name: 'Touch event handling' },
  { pattern: /mousedown|click|mousemove/, name: 'Mouse fallback' },
  { pattern: /AudioContext|webkitAudioContext/, name: 'Audio system' },
];

// Patterns that indicate bugs or bad practices
const BAD_PATTERNS = [
  { pattern: /\bvar\s+/, name: 'Uses var instead of const/let', severity: 'warning' },
  { pattern: /console\.log\(/, name: 'Contains console.log', severity: 'warning' },
  { pattern: /document\.write\(/, name: 'Uses document.write', severity: 'error' },
  { pattern: /alert\(/, name: 'Uses alert()', severity: 'error' },
  { pattern: /eval\(/, name: 'Uses eval()', severity: 'error' },
];

/**
 * Run static analysis on game HTML code.
 * Returns { pass, errors, warnings }.
 *
 * @param {string} htmlCode - Complete HTML source
 * @returns {{ pass: boolean, errors: Array<{check: string, message: string}>, warnings: Array<{check: string, message: string}>, errorCount: number }}
 */
function testCodeStatic(htmlCode) {
  const errors = [];
  const warnings = [];

  if (!htmlCode || typeof htmlCode !== 'string' || htmlCode.length < 100) {
    errors.push({ check: 'empty', message: 'HTML code is empty or too short' });
    return { pass: false, errors, warnings, errorCount: errors.length };
  }

  // Check for basic HTML structure
  if (!/<html/i.test(htmlCode)) {
    errors.push({ check: 'no_html', message: 'Missing <html> tag' });
  }
  if (!/<head/i.test(htmlCode)) {
    errors.push({ check: 'no_head', message: 'Missing <head> tag' });
  }
  if (!/<body/i.test(htmlCode)) {
    errors.push({ check: 'no_body', message: 'Missing <body> tag' });
  }
  if (!/<script/i.test(htmlCode)) {
    errors.push({ check: 'no_script', message: 'No <script> tags found' });
  }

  // Check viewport meta
  if (!/viewport/.test(htmlCode)) {
    warnings.push({ check: 'no_viewport', message: 'Missing viewport meta tag' });
  }

  // Check required DOM element IDs (any alternative in each group satisfies the requirement)
  for (const group of REQUIRED_ID_GROUPS) {
    const found = group.some(id => {
      const idRegex = new RegExp(`id=["']${id}["']`, 'i');
      return idRegex.test(htmlCode);
    });
    if (!found) {
      errors.push({ check: 'missing_element', message: `Required element missing — need one of: ${group.join(', ')}` });
    }
  }

  // Check required code patterns (missing patterns are warnings, not errors —
  // different game types legitimately skip some, e.g. puzzle games don't need rAF cleanup)
  for (const { pattern, name } of REQUIRED_PATTERNS) {
    if (!pattern.test(htmlCode)) {
      warnings.push({ check: 'missing_pattern', message: `Missing: ${name}` });
    }
  }

  // Check for bad patterns
  for (const { pattern, name, severity } of BAD_PATTERNS) {
    if (pattern.test(htmlCode)) {
      if (severity === 'error') {
        errors.push({ check: 'bad_pattern', message: name });
      } else {
        warnings.push({ check: 'bad_pattern', message: name });
      }
    }
  }

  // Check for unclosed script tags
  const scriptOpens = (htmlCode.match(/<script/gi) || []).length;
  const scriptCloses = (htmlCode.match(/<\/script>/gi) || []).length;
  if (scriptOpens !== scriptCloses) {
    errors.push({ check: 'unclosed_script', message: `Mismatched script tags: ${scriptOpens} opens, ${scriptCloses} closes` });
  }

  // Check for touch-action:none (prevents accidental zoom/scroll)
  if (!/touch-action\s*:\s*none/.test(htmlCode)) {
    warnings.push({ check: 'no_touch_action', message: 'Missing touch-action:none CSS rule' });
  }

  // Check for user-select:none
  if (!/user-select\s*:\s*none/.test(htmlCode)) {
    warnings.push({ check: 'no_user_select', message: 'Missing user-select:none CSS rule' });
  }

  // Check for overflow:hidden on body
  if (!/overflow\s*:\s*hidden/.test(htmlCode)) {
    warnings.push({ check: 'no_overflow_hidden', message: 'Missing overflow:hidden on body' });
  }

  // Check for DOMContentLoaded
  if (!/DOMContentLoaded/.test(htmlCode)) {
    warnings.push({ check: 'no_dom_ready', message: 'No DOMContentLoaded handler found — DOM queries may fail' });
  }

  const pass = errors.length === 0;

  if (!pass) {
    logger.debug(`[testEngine] static test FAILED: ${errors.length} error(s), ${warnings.length} warning(s)`);
  }

  return {
    pass,
    errors,
    warnings,
    errorCount: errors.length,
    criticalCount: errors.filter(e => e.check === 'missing_element' || e.check === 'no_script' || e.check === 'empty').length,
  };
}

module.exports = { testCodeStatic, REQUIRED_ID_GROUPS };
