/**
 * Intent & edit-type classifier for Zyra's semantic editor.
 *
 * Exports:
 *   classifyIntent(prompt, activeProjectSlug)
 *     → 'NEW_PROJECT_REQUEST' | 'PROJECT_EDIT_REQUEST' | 'CONTENT_CHANGE_REQUEST' | 'BUG_FIX_REQUEST' | 'QUESTION'
 *
 *   classifyEditType(prompt)
 *     → 'THEME_CHANGE' | 'COLOR_CHANGE' | 'TYPOGRAPHY_CHANGE' | 'LAYOUT_CHANGE'
 *        | 'COMPONENT_CHANGE' | 'COPY_CHANGE' | 'FUNCTIONAL_FIX' | 'NEW_FEATURE' | 'GENERAL_EDIT'
 *
 *   hasStyleOnlyWords(prompt)
 *     → true if the prompt contains styling/aesthetic words that must NOT become page content
 */

// ── New-project signals ────────────────────────────────────────────────────────

const NEW_PROJECT_PATTERNS = [
  // Verb + new-thing: "build a game", "create an app", "make a website"
  /\b(create|build|make|generate|develop|write|code)\b.{0,50}\b(app|application|game|website|site|tool|dashboard|platform|program)\b/i,
  // "new/another/fresh X"
  /\b(new|another|fresh|different|separate)\b.{0,30}\b(app|project|game|website|page|tool|site)\b/i,
  // Well-known game names — always a new project
  /\b(tetris|pacman|pac-man|chess|checkers|snake|pong|flappy|asteroids|minesweeper|sudoku|2048|breakout|space invaders|doom|minecraft)\b/i,
  // Common app-type phrases that imply starting from scratch
  /\b(landing page|portfolio site|todo app|task manager|weather app|quiz app|note.?taking app|expense tracker|recipe app|music player|chat app|blog site|e-?commerce)\b/i,
  // Explicit reset signals
  /\b(start over|from scratch|completely new|brand new|whole new|restart|build from)\b/i,
];

// ── Edit type pattern maps ─────────────────────────────────────────────────────

const EDIT_TYPE_PATTERNS = [
  {
    type: 'THEME_CHANGE',
    patterns: [
      /\b(theme|mode|scheme|dark mode|light mode|color scheme|design system)\b/i,
      /\b(make it|switch to|change to|go)\b.{0,20}\b(dark|light|minimal|modern|clean|flat|material|glassmorphism|neumorphism)\b/i,
      /\b(dark|light)\s+(theme|mode|version)\b/i,
    ],
  },
  {
    type: 'COLOR_CHANGE',
    patterns: [
      /\b(color|colour|palette|hue|tint|shade|tone)\b/i,
      /\b(make|change|switch|turn)\b.{0,30}\b(red|blue|green|yellow|orange|purple|pink|teal|indigo|gray|grey|black|white|navy|gold|silver|brown|cyan|magenta|violet)\b/i,
      /\b(black and white|monochrome|grayscale|greyscale|single color|one color)\b/i,
      /\b(primary|secondary|accent|background|foreground|text)\s+color\b/i,
      /#[0-9a-fA-F]{3,6}\b/,
    ],
  },
  {
    type: 'TYPOGRAPHY_CHANGE',
    patterns: [
      /\b(font|typeface|typography|text size|font size|heading|body text|serif|sans-serif|monospace)\b/i,
      /\b(bold|italic|uppercase|lowercase|tracking|leading|letter-spacing|line-height)\b/i,
      /\b(bigger|smaller|larger)\s+(font|text|type)\b/i,
      /\b(font.?(family|weight|style))\b/i,
    ],
  },
  {
    type: 'LAYOUT_CHANGE',
    patterns: [
      /\b(layout|grid|columns|rows|spacing|padding|margin|alignment|flex|flexbox|sidebar|header|footer|section|centering)\b/i,
      /\b(wider|narrower|taller|shorter|bigger|smaller|more|less)\s+(padding|margin|spacing|gap)\b/i,
      /\b(move|shift|reorder|rearrange|reorganize)\b.{0,30}\b(section|element|block|component|panel|widget)\b/i,
      /\b(full.?width|full.?screen|responsive|mobile.?first|two.?column|three.?column|single.?column)\b/i,
    ],
  },
  {
    type: 'COPY_CHANGE',
    patterns: [
      /\b(text|copy|wording|headline|title|subtitle|description|tagline|label|placeholder|caption|paragraph|content)\b.{0,30}\b(change|update|edit|rewrite|replace|fix|improve)\b/i,
      /\b(change|update|edit|rewrite|replace|fix)\b.{0,30}\b(text|copy|wording|headline|title|subtitle|description|tagline|label|placeholder|caption|paragraph)\b/i,
      /\b(say|read|show|display)\b.{0,30}"[^"]{2,}"/i,
      /\b(rename|relabel)\b/i,
      /change .{0,20} to ["']?.{0,60}["']?/i,
    ],
  },
  {
    type: 'COMPONENT_CHANGE',
    patterns: [
      /\b(add|remove|delete|show|hide|toggle|include|exclude)\b.{0,30}\b(button|card|modal|navbar|nav|menu|hero|footer|form|input|image|icon|badge|tab|dropdown|tooltip|toast|sidebar|banner|accordion|carousel|slider|table|list)\b/i,
      /\b(button|card|modal|navbar|form|input|image|icon)\b.{0,20}\b(style|design|look|appearance|shape|size|color)\b/i,
      /\b(rounded|pill|square|bordered|outlined|filled|ghost|solid|shadow|flat)\b.{0,20}\b(button|card|input|badge)\b/i,
    ],
  },
  {
    type: 'BUG_FIX_REQUEST',
    patterns: [
      /\b(bug|broken|error|crash|doesn't work|not working|fails|failure|fix|repair|wrong|incorrect|glitch|issue|problem)\b/i,
      /\b(console\.error|undefined is not|cannot read|null reference|uncaught|exception|stack trace)\b/i,
    ],
  },
  {
    type: 'FUNCTIONAL_FIX',
    patterns: [
      /\b(click|button|submit|form|input|validation|event|handler|toggle|switch|open|close|show|hide|navigate|route|fetch|api|request|response|state|update|refresh)\b.{0,20}\b(not working|broken|wrong|fix|doesn't|won't|isn't)\b/i,
      /\b(doesn't|don't|won't|isn't|can't)\b.{0,30}\b(work|function|respond|update|save|load|submit|open|close|toggle)\b/i,
    ],
  },
  {
    type: 'NEW_FEATURE',
    patterns: [
      /\b(add|implement|create|build|integrate|include)\b.{0,40}\b(feature|functionality|ability|support|section|page|view|screen|mode|option|setting|filter|search|sort|export|import|upload|download|login|auth|map|chart|graph|animation)\b/i,
      /\b(I want|I need|please add|also add|add a new|can you add)\b/i,
    ],
  },
];

// Style/aesthetic words that must NEVER become page content/headlines
const STYLE_ONLY_WORDS = [
  // Color palettes
  'black and white', 'monochrome', 'grayscale', 'greyscale', 'colorful', 'vibrant', 'muted', 'pastel',
  'bold colors', 'bright', 'neon', 'earthy tones', 'warm tones', 'cool tones', 'neutral',
  // Design styles
  'minimal', 'minimalist', 'minimalism', 'clean', 'modern', 'sleek', 'elegant', 'luxurious',
  'professional', 'corporate', 'playful', 'fun', 'friendly', 'serious', 'edgy', 'retro',
  'vintage', 'classic', 'contemporary', 'futuristic', 'brutalist', 'organic', 'geometric',
  // UI modes
  'dark mode', 'light mode', 'dark theme', 'light theme', 'high contrast',
  // Typography styles
  'bold typography', 'large text', 'small text', 'serif', 'sans-serif',
];

const STYLE_WORD_REGEX = new RegExp(
  '\\b(' + STYLE_ONLY_WORDS.map(w => w.replace(/\s+/g, '\\s+')).join('|') + ')\\b',
  'i'
);

/**
 * Returns true if the prompt contains aesthetic/style words that should
 * be applied as CSS modifications, not turned into page content.
 */
function hasStyleOnlyWords(prompt) {
  return STYLE_WORD_REGEX.test(prompt);
}

/**
 * Classify the edit sub-type of a modification request.
 * Used to give the AI editor specific guidance about what to change.
 *
 * @param {string} prompt
 * @returns {string} One of the EDIT_TYPE values
 */
function classifyEditType(prompt) {
  for (const { type, patterns } of EDIT_TYPE_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(prompt)) return type;
    }
  }
  return 'GENERAL_EDIT';
}

/**
 * Classify the user's top-level intent.
 *
 * Categories:
 *   NEW_PROJECT_REQUEST    — create a new, unrelated project
 *   PROJECT_EDIT_REQUEST   — modify design/layout/components of existing project
 *   CONTENT_CHANGE_REQUEST — update text/copy only
 *   BUG_FIX_REQUEST        — fix something broken
 *   QUESTION               — informational question, no code change
 *
 * @param {string} prompt
 * @param {string|null} activeProjectSlug
 * @returns {string}
 */
function classifyIntent(prompt, activeProjectSlug) {
  if (!activeProjectSlug) return 'NEW_PROJECT_REQUEST';

  const text = prompt.trim();

  // Unambiguous new-project signals take priority
  for (const pattern of NEW_PROJECT_PATTERNS) {
    if (pattern.test(text)) return 'NEW_PROJECT_REQUEST';
  }

  // Short informational question
  const looksLikeQuestion =
    /^(why|what|how|when|where|which|who|is |are |can |could |should |would |will )/i.test(text) &&
    text.length < 120 &&
    !text.includes('\n');
  if (looksLikeQuestion) return 'QUESTION';

  // Bug fix?
  if (EDIT_TYPE_PATTERNS.find(e => e.type === 'BUG_FIX_REQUEST')
    .patterns.some(p => p.test(text))) return 'BUG_FIX_REQUEST';

  // Copy-only change?
  const editType = classifyEditType(text);
  if (editType === 'COPY_CHANGE') return 'CONTENT_CHANGE_REQUEST';

  // Everything else when a project is active → modify it
  return 'PROJECT_EDIT_REQUEST';
}

module.exports = { classifyIntent, classifyEditType, hasStyleOnlyWords };
