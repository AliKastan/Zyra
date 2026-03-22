/**
 * gameBuilder.js
 *
 * Template-based game generation pipeline. Instead of asking the AI to generate
 * an entire game from scratch, this:
 *   1. Selects the closest pre-built template (working, tested code)
 *   2. Customizes it in small, focused steps (theme → mechanics → polish)
 *   3. Tests after each step, falls back if anything breaks
 *
 * This replaces the old one-shot generation approach.
 */

const path = require('path');
const fse = require('fs-extra');
const { callClaude, SONNET_MODEL } = require('../providers/anthropicProvider');
const { selectTemplate } = require('./templateSelector');
const { testCodeStatic } = require('./testEngine');
const { createCostTracker } = require('../utils/costTracker');
const { injectLevelSystem } = require('./levelInjector');
const logger = require('../utils/logger');

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

/**
 * Load a template file from disk and inject the level system.
 * @param {string} templateName - e.g. 'tap', 'dodge', 'physics'
 * @returns {Promise<string>} HTML source code with level system injected
 */
async function loadTemplate(templateName) {
  const filePath = path.join(TEMPLATES_DIR, `${templateName}-game.html`);
  if (!(await fse.pathExists(filePath))) {
    throw new Error(`Template not found: ${filePath}`);
  }
  let html = await fse.readFile(filePath, 'utf8');
  html = injectLevelSystem(html);
  return html;
}

/**
 * Extract clean HTML from a Claude response that might have markdown fences.
 */
function extractHtml(raw) {
  if (!raw) return '';
  // Strip markdown fences
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // If starts with <!DOCTYPE or <html, it's already clean
  const trimmed = raw.trim();
  if (trimmed.startsWith('<!') || trimmed.startsWith('<html')) return trimmed;
  return trimmed;
}

/**
 * Ask Claude to modify existing code. Returns the modified HTML.
 */
async function modifyCode(currentCode, instruction, costTracker) {
  const system = `You are modifying an existing working HTML5 mobile game. You will receive the COMPLETE current code and a specific modification request.

RULES:
- Apply ONLY the requested changes
- Do NOT rewrite the game from scratch
- Do NOT remove any existing screens, buttons, state machine, audio system, particle system, or touch handling
- Return ONLY the complete modified HTML code
- No explanations, no markdown backticks, just the raw HTML starting with <!DOCTYPE html>
- The output must be a single valid HTML file
- Preserve ALL element IDs (screen-menu, btn-play, score-value, etc.)`;

  const user = `CURRENT WORKING CODE:\n${currentCode}\n\nMODIFICATION REQUEST:\n${instruction}`;

  const raw = await callClaude(system, user, {
    model: SONNET_MODEL,
    maxTokens: 16000,
  });

  if (costTracker) {
    costTracker.record('modify', system, user, raw);
  }

  return extractHtml(raw);
}

/**
 * Attempt to fix broken code by sending errors to Claude.
 */
async function fixCode(brokenCode, testResult, fallbackCode, costTracker) {
  const errorList = testResult.errors
    .map((e, i) => `${i + 1}. [${e.check}] ${e.message}`)
    .join('\n');

  const system = `You are a game bug fixer. Fix EVERY error listed. Return ONLY the complete fixed HTML. No explanations.

RULES:
- Fix the root cause, not symptoms
- Do NOT remove features to fix bugs
- Do NOT rewrite from scratch
- Keep all screens, buttons, and UI
- If an element ID is missing, add the element
- If a function is undefined, define it
- Preserve the state machine and screen system`;

  const user = `BROKEN CODE:\n${brokenCode}\n\nERRORS TO FIX:\n${errorList}\n\nReturn the complete corrected HTML.`;

  try {
    const raw = await callClaude(system, user, {
      model: SONNET_MODEL,
      maxTokens: 16000,
    });

    if (costTracker) {
      costTracker.record('fix', system, user, raw);
    }

    const fixed = extractHtml(raw);
    const fixResult = testCodeStatic(fixed);

    if (fixResult.pass) return fixed;

    // If fix has fewer errors, use it
    if (fixResult.errorCount < testResult.errorCount) return fixed;

    // Fix made things worse — use fallback
    logger.warn('[gameBuilder] fix attempt made things worse, using fallback');
    return fallbackCode || brokenCode;
  } catch (err) {
    logger.error(`[gameBuilder] fix call failed: ${err.message}`);
    return fallbackCode || brokenCode;
  }
}

/**
 * Build a game from a template using step-by-step AI customization.
 *
 * @param {string} userPrompt - The user's game description
 * @param {object} [options]
 * @param {Function} [options.onProgress] - Called with { step, message } for each pipeline stage
 * @param {object} [options.costTracker] - Optional cost tracking instance
 * @returns {Promise<{ html: string, classification: object, steps: string[] }>}
 */
async function buildGame(userPrompt, options = {}) {
  const { onProgress, costTracker: externalCost } = options;
  const cost = externalCost || createCostTracker();
  const completedSteps = [];

  function progress(step, message) {
    logger.info(`[gameBuilder] step=${step} — ${message}`);
    if (onProgress) onProgress({ step, message });
  }

  // ── STEP 1: Select template ─────────────────────────────────────────────────
  progress(0, 'Choosing game type...');
  const classification = await selectTemplate(userPrompt);
  logger.info(`[gameBuilder] classified as "${classification.template}" — "${classification.title}"`);

  // ── STEP 2: Load the working template ───────────────────────────────────────
  let currentCode = await loadTemplate(classification.template);
  const templateCode = currentCode; // keep pristine copy as fallback
  completedSteps.push('Template loaded');

  // Verify template passes static tests
  const templateTest = testCodeStatic(currentCode);
  if (!templateTest.pass) {
    logger.warn(`[gameBuilder] template "${classification.template}" has ${templateTest.errorCount} static errors — proceeding anyway`);
  }

  // ── STEP 3: Apply customizations in focused steps ───────────────────────────
  const steps = [
    {
      name: 'Theme & Visuals',
      step: 1,
      message: 'Designing the look...',
      prompt: `Modify this working game's visual theme. Change:
- Game title to "${classification.title}"
- Primary accent color to ${classification.primaryColor}
- Secondary accent color to ${classification.secondaryColor}
- Background gradient to use ${classification.backgroundColor}
- Update the subtitle text to: "${classification.description}"
- Update the tutorial text to match the new game concept
- Update any CSS color variables to match the new theme
- Update the <title> tag to "${classification.title}"

DO NOT change any game logic, state machine, audio system, or touch handling.
ONLY change: title text, colors, subtitle, tutorial text, CSS color values, and <title>.

Return the COMPLETE modified HTML.`,
    },
    {
      name: 'Game Mechanics',
      step: 2,
      message: 'Building gameplay...',
      prompt: `Now modify the game mechanics to match this description: "${userPrompt}"

The current code is a working ${classification.template} game. Modify the game-specific functions to match what the user wants:
- initGame() — change game initialization
- resetGameSpecificState() — change what gets reset each round
- update(dt) — change game update logic (movement, spawning, collision)
- render() — change what gets drawn to the canvas/screen
- handleInputStart/Move/End — change controls if needed
- getDifficulty() — adjust difficulty curve
- getStarRating() — adjust star thresholds
- getGameStats() — update stats tracked

RULES:
1. Keep the ENTIRE state machine, screen system, audio system, particle system, touch system EXACTLY as they are
2. ONLY modify the game-specific functions listed above
3. ONLY modify the #game-area HTML content (canvas or game elements)
4. ONLY modify game-specific CSS (add new rules, don't remove framework CSS)
5. Make sure the game accurately represents what the user described
6. Keep all button wiring (btn-play, btn-pause, etc.) and screen transitions working
7. ${classification.template === 'physics' || classification.template === 'platformer' ? 'Use planck.js for physics (it is pre-loaded as global `planck`). SCALE=30, create boundary walls, use setUserData.' : 'Do not add physics unless the game concept requires it.'}

Return the COMPLETE modified HTML.`,
    },
    {
      name: 'Level Design',
      step: 3,
      message: 'Designing levels...',
      prompt: `Now customize the 5 level configurations for this specific game: "${userPrompt}"

The game has a level system with a levelConfigs array of 5 levels. Each level has: name, subtitle, objective, objectiveType, objectiveTarget, timeLimit, background color, and settings (spawnRate, enemySpeed, maxEnemies, etc.).

Customize the levelConfigs array so:
- Level names and subtitles match the game theme
- Objectives make sense for this game type (score, collect, survive, destroy)
- Settings create a fair difficulty curve (level 1 easy, level 5 hard)
- Level 3 introduces a new mechanic (set newMechanic in settings)
- Level 4 adds time pressure (set timeLimit to 45-60 seconds)
- Level 5 is a boss fight or special finale (set bossLevel:true, objectiveType:'destroy')
- Each level has a slightly different background color

Also customize:
- The applyLevelSettings() function to use the level settings properly
- The resetLevelState() function to clear level-specific state
- Add boss rendering and logic if this is an action/shooter/physics game
- Update the tutorial text to mention levels

IMPORTANT:
- Do NOT change the level system framework functions (checkLevelObjective, completeLevel, beginLevel, etc.)
- Do NOT change screen IDs, button IDs, or the state machine
- ONLY modify: levelConfigs array, applyLevelSettings, resetLevelState, and add boss code if needed
- Use addLevelScore(pts, x, y) instead of directly changing score
- Use addObjectiveProgress() for non-score objectives
- Call updateLevelProgress() and updateTimeLimit(dt) in the game loop

Return the COMPLETE modified HTML.`,
    },
    {
      name: 'Polish & Balance',
      step: 4,
      message: 'Adding polish...',
      prompt: `Review this game and make targeted improvements:

1. BALANCE: Is the starting difficulty fair? Can a new player survive 10-15 seconds? Adjust speeds and spawn rates if too hard/easy at the start.
2. FEEDBACK: Does every interaction have visual + audio feedback? Make sure scoring triggers particles + sound + score popup. Make sure hits/misses have feedback too.
3. EDGE CASES: What happens when score is 0? When no game objects exist? When game just started? Add null checks where needed.
4. COLORS: Is text readable against backgrounds? Do colors look good together?
5. GAME OVER: Does the final score display correctly? Does play again fully reset everything?

Make TARGETED improvements — do not rewrite the game.
Return the COMPLETE modified HTML.`,
    },
  ];

  for (const step of steps) {
    progress(step.step, step.message);

    try {
      const modified = await modifyCode(currentCode, step.prompt, cost);

      // Validate the modification
      const testResult = testCodeStatic(modified);

      if (testResult.pass) {
        currentCode = modified;
        completedSteps.push(step.name);
        logger.info(`[gameBuilder] step "${step.name}" passed static test`);
      } else {
        logger.warn(`[gameBuilder] step "${step.name}" has ${testResult.errorCount} errors, attempting fix`);
        // Try to fix
        const fixed = await fixCode(modified, testResult, currentCode, cost);
        const fixResult = testCodeStatic(fixed);

        if (fixResult.pass || fixResult.errorCount < testResult.errorCount) {
          currentCode = fixed;
          completedSteps.push(`${step.name} (fixed)`);
        } else {
          // Keep previous working version
          logger.warn(`[gameBuilder] step "${step.name}" fix failed, keeping previous version`);
          completedSteps.push(`${step.name} (skipped)`);
        }
      }
    } catch (err) {
      logger.error(`[gameBuilder] step "${step.name}" threw: ${err.message}`);
      completedSteps.push(`${step.name} (error: ${err.message})`);
      // Continue with current code
    }
  }

  // ── STEP 5: Final validation ────────────────────────────────────────────────
  progress(5, 'Final checks...');
  const finalTest = testCodeStatic(currentCode);

  if (!finalTest.pass) {
    logger.warn(`[gameBuilder] final code has ${finalTest.errorCount} errors, attempting last fix`);
    const lastFix = await fixCode(currentCode, finalTest, templateCode, cost);
    const lastResult = testCodeStatic(lastFix);
    if (lastResult.errorCount <= finalTest.errorCount) {
      currentCode = lastFix;
    }
  }

  completedSteps.push('Complete');

  return {
    html: currentCode,
    classification,
    steps: completedSteps,
    cost: cost.summary(),
  };
}

module.exports = { buildGame, loadTemplate };
