/**
 * templateSelector.js
 *
 * Step 1 of the game-building pipeline: classify which template best matches
 * the user's prompt. Makes one small Claude API call (~100 tokens) and returns
 * a structured classification with template name, title, theme, and mechanics.
 */

const { callClaude, HAIKU_MODEL } = require('../providers/anthropicProvider');
const { safeJsonParse } = require('../utils/safeJsonParse');
const logger = require('../utils/logger');

const VALID_TEMPLATES = new Set([
  'tap', 'dodge', 'physics', 'shooter', 'puzzle', 'platformer', 'card', 'snake',
]);

const CLASSIFIER_SYSTEM = `You are a game classifier. Given a game description, respond with ONLY a JSON object. Nothing else.

The JSON must have:
{
  "template": one of ["tap", "dodge", "physics", "shooter", "puzzle", "platformer", "card", "snake"],
  "title": "suggested game title (2-4 words, catchy)",
  "theme": "color theme description in 3-5 words",
  "primaryColor": "#hex",
  "secondaryColor": "#hex",
  "backgroundColor": "#hex (dark, e.g. #0a0a1a)",
  "mechanics": ["list of 2-4 specific mechanics needed"],
  "description": "one sentence game summary"
}

Choose the template that is CLOSEST to what the user wants:
- "billiards game" → physics (zero gravity, ball collisions)
- "whack a mole" → tap (tap targets that appear/disappear)
- "flappy bird" → dodge (dodge obstacles by tapping to fly)
- "angry birds" → physics (projectile + structure destruction)
- "fruit ninja" → tap (swipe/tap to slice objects)
- "2048" → puzzle (grid-based tile merging)
- "space invaders" → shooter (shoot enemies from below)
- "mario style" → platformer (jump between platforms)
- "memory card game" → card (flip to match pairs)
- "snake game" → snake (grow by eating, avoid self)
- "breakout/brick breaker" → physics (ball bounces off paddle)
- "pong" → physics (ball + paddles)
- "candy crush" → puzzle (match-3 grid)
- "temple run / endless runner" → dodge (dodge obstacles while running)
- "asteroid shooter" → shooter (360 degree shooting)
- "tetris" → puzzle (falling blocks + clearing rows)
- "pinball" → physics (ball + flippers + bumpers)
- "tapping idle game" → tap (tap to earn, upgrades)
- "bubble pop" → tap (tap bubbles before they escape)
- "racing dodge" → dodge (dodge traffic on a road)
- "tower defense" → shooter (enemies approach, place/tap to shoot)
- "solitaire / card game" → card (card manipulation)
- "word game" → puzzle (grid/letter manipulation)
- "quiz game" → tap (tap correct answer)

Pick the closest match. If unsure, default to "tap" — it's the most flexible.`;

/**
 * Classify the user's game prompt and return the best template + theme.
 * Falls back to 'tap' template with default theme if classification fails.
 *
 * @param {string} userPrompt
 * @returns {Promise<{template: string, title: string, theme: string, primaryColor: string, secondaryColor: string, backgroundColor: string, mechanics: string[], description: string}>}
 */
async function selectTemplate(userPrompt) {
  const fallback = {
    template: 'tap',
    title: 'Tap Game',
    theme: 'neon dark',
    primaryColor: '#00ff88',
    secondaryColor: '#00ccff',
    backgroundColor: '#0a0a1a',
    mechanics: ['tap to score', 'time pressure'],
    description: 'A fast-paced tapping game',
  };

  try {
    const raw = await callClaude(CLASSIFIER_SYSTEM, userPrompt, {
      model: HAIKU_MODEL,
      maxTokens: 300,
    });

    const parseResult = safeJsonParse(raw);
    const parsed = parseResult.success ? parseResult.data : null;
    if (!parsed || typeof parsed !== 'object') {
      logger.warn('[templateSelector] failed to parse classification, using fallback');
      return fallback;
    }

    // Validate template name
    if (!parsed.template || !VALID_TEMPLATES.has(parsed.template)) {
      logger.warn(`[templateSelector] invalid template "${parsed.template}", defaulting to tap`);
      parsed.template = 'tap';
    }

    // Ensure all required fields exist with sane defaults
    return {
      template:        parsed.template,
      title:           parsed.title || fallback.title,
      theme:           parsed.theme || fallback.theme,
      primaryColor:    parsed.primaryColor || fallback.primaryColor,
      secondaryColor:  parsed.secondaryColor || fallback.secondaryColor,
      backgroundColor: parsed.backgroundColor || fallback.backgroundColor,
      mechanics:       Array.isArray(parsed.mechanics) ? parsed.mechanics : fallback.mechanics,
      description:     parsed.description || fallback.description,
    };
  } catch (err) {
    logger.error(`[templateSelector] classification failed: ${err.message}`);
    return fallback;
  }
}

module.exports = { selectTemplate, VALID_TEMPLATES };
