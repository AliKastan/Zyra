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
const { callClaude, HAIKU_MODEL } = require('../providers/anthropicProvider');
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

  let html = raw.trim();

  // Strip markdown fences — use greedy match to grab the LAST closing ```
  const fenced = html.match(/```(?:html)?\s*([\s\S]*)```\s*$/);
  if (fenced) {
    html = fenced[1].trim();
  } else {
    // Strip leading explanation text before the actual HTML
    const htmlStart = html.search(/<!DOCTYPE\s|<html/i);
    if (htmlStart > 0) html = html.slice(htmlStart);
    // Strip trailing text/fences after </html>
    const htmlEnd = html.lastIndexOf('</html>');
    if (htmlEnd !== -1) html = html.slice(0, htmlEnd + '</html>'.length);
  }

  return repairTruncatedHtml(html);
}

/**
 * Repair HTML that was truncated mid-output (e.g. unclosed script/style tags).
 * This is a deterministic fix — no API call needed.
 */
function repairTruncatedHtml(html) {
  if (!html) return html;

  // Count open vs close for critical tags
  const tags = ['script', 'style'];
  for (const tag of tags) {
    const opens  = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closes = (html.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    if (opens > closes) {
      // Truncated inside a tag — close it
      // Remove any partial/broken code at the end (after last complete statement)
      const lastCloseIdx = html.lastIndexOf(`</${tag}>`);
      const lastOpenIdx  = html.lastIndexOf(`<${tag}`);
      if (lastOpenIdx > lastCloseIdx) {
        // The last opened tag is unclosed — try to close it cleanly
        // Find a safe cut point: last semicolon or closing brace inside the tag
        const afterOpen = html.slice(lastOpenIdx);
        const tagBodyStart = afterOpen.indexOf('>');
        if (tagBodyStart !== -1) {
          const bodyStart = lastOpenIdx + tagBodyStart + 1;
          const body = html.slice(bodyStart);
          // Find last safe cut point (semicolon, closing brace, or newline after a statement)
          const safeCut = Math.max(
            body.lastIndexOf(';\n'),
            body.lastIndexOf('}\n'),
            body.lastIndexOf(';')
          );
          if (safeCut > 0) {
            html = html.slice(0, bodyStart + safeCut + 1) + `\n</${tag}>` + (html.slice(bodyStart + body.length) || '');
          } else {
            html += `\n</${tag}>`;
          }
        } else {
          html += `>`;
          html += `\n</${tag}>`;
        }
      }
    }
  }

  // Ensure closing </body> and </html> exist
  if (/<body/i.test(html) && !/<\/body>/i.test(html)) {
    html += '\n</body>';
  }
  if (/<html/i.test(html) && !/<\/html>/i.test(html)) {
    html += '\n</html>';
  }

  return html;
}

/**
 * Ask Claude to modify existing code. Returns the modified HTML.
 */
async function modifyCode(currentCode, instruction, costTracker, { model = HAIKU_MODEL, maxTokens = 12000 } = {}) {
  const system = `You are modifying an existing working HTML5 mobile game for a 375x812 mobile screen with touch controls.

RULES:
- Apply ONLY the requested changes
- Do NOT rewrite the game from scratch
- Do NOT remove any existing screens, buttons, state machine, audio system, particle system, or touch handling
- Return ONLY the complete modified HTML code — no explanations, no markdown backticks, just raw HTML starting with <!DOCTYPE html>
- The output must be a single valid HTML file with inline <style> and <script>
- Preserve ALL element IDs (screen-menu, btn-play, score-value, etc.)
- Use canvas for ALL game rendering (not DOM elements for game objects)
- All game objects drawn with ctx.fillRect, ctx.arc, ctx.fillText etc.
- NEVER use external images, fonts, or sound files — draw everything with canvas shapes and use emoji for icons
- ALWAYS preventDefault on touch events
- ALWAYS cancel requestAnimationFrame when game is not playing
- ALWAYS provide mouse fallback for touch events

GOOD GAME FEEL:
- Smooth 60fps animation
- Particles on score events (small colored circles that float up and fade)
- Score popup text that floats up when you earn points
- Screen shake on big hits (shift canvas position briefly)
- Sound effects: tap (high beep), score (rising tone), hit (low thud), game over (descending tone)
- Bright colors on dark background
- Difficulty increases every 15 seconds (things get faster or more numerous)
- Test your code mentally before outputting — would clicking Play actually start the game? Would the game loop actually run? Would game over actually trigger?`;

  const user = `CURRENT WORKING CODE:\n${currentCode}\n\nMODIFICATION REQUEST:\n${instruction}`;

  const raw = await callClaude(system, user, {
    model,
    maxTokens,
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

  const system = `You are a game bug fixer. Fix EVERY error listed. Return ONLY the complete fixed HTML starting with <!DOCTYPE html>. No explanations, no markdown.

RULES:
- Fix the root cause, not symptoms
- Do NOT remove features to fix bugs
- Use canvas for rendering, not DOM elements for game objects
- Do NOT rewrite from scratch
- Keep all screens, buttons, and UI
- If an element ID is missing, add the element
- If a function is undefined, define it
- Preserve the state machine and screen system`;

  const user = `BROKEN CODE:\n${brokenCode}\n\nERRORS TO FIX:\n${errorList}\n\nReturn the complete corrected HTML.`;

  try {
    const raw = await callClaude(system, user, {
      model: HAIKU_MODEL,
      maxTokens: 12000,
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

  async function progress(step, message) {
    logger.info(`[gameBuilder] step=${step} — ${message}`);
    if (onProgress) {
      try { await onProgress({ step, message }); } catch (_) {}
    }
  }

  // ── STEP 1: Select template ─────────────────────────────────────────────────
  await progress(0, 'Choosing game type...');
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
      maxTokens: 8000,
      prompt: `Modify this working game's visual theme. Change:
- Game title to "${classification.title}"
- Primary accent color to ${classification.primaryColor}
- Secondary accent color to ${classification.secondaryColor}
- Background gradient to use ${classification.backgroundColor}
- Update the subtitle text to: "${classification.description}"
- Update the tutorial text to match the new game concept
- Update any CSS color variables to match the new theme
- Update the <title> tag to "${classification.title}"
- Ensure text is readable against all backgrounds
- Ensure colors look good together

DO NOT change any game logic, state machine, audio system, or touch handling.
ONLY change: title text, colors, subtitle, tutorial text, CSS color values, and <title>.

Return the COMPLETE modified HTML.`,
    },
    {
      name: 'Game Mechanics',
      step: 2,
      message: 'Building gameplay...',
      maxTokens: 14000,
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
8. Ensure every interaction has visual + audio feedback (particles + sound on score, hit feedback, etc.)
9. Add null checks for edge cases (score=0, no game objects, game just started)

Return the COMPLETE modified HTML.`,
    },
    {
      name: 'Level Design',
      step: 3,
      message: 'Designing levels...',
      maxTokens: 14000,
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
- Starting difficulty is fair — a new player can survive 10-15 seconds
- Game over displays final score correctly, play again fully resets everything

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
  ];

  for (const step of steps) {
    await progress(step.step, step.message);

    try {
      const modified = await modifyCode(currentCode, step.prompt, cost, { maxTokens: step.maxTokens });

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
  await progress(4, 'Final checks...');
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
