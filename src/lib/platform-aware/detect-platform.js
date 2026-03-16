'use strict';

/**
 * Platform Detection
 *
 * Classifies a user prompt into a target platform type.
 * Uses priority-ordered keyword patterns with explicit > implicit confidence.
 *
 * Strategy:
 *   1. Check explicit platform signals first (highest priority)
 *   2. Check domain-specific signals (AI tool → web, fitness tracker → mobile)
 *   3. Fall back to 'web' if no clear signal
 */

// ── Explicit platform patterns (checked first, highest confidence) ────────────

const EXPLICIT_PATTERNS = [
  // Mobile — check before web to catch "mobile web" etc.
  {
    platform:  'mobile',
    patterns:  [
      /\b(mobile[_\s-]?app|ios[_\s-]?app|android[_\s-]?app|iphone[_\s-]?app|react[_\s-]?native|expo[_\s-]?app|native[_\s-]?app|flutter|swift[_\s-]?app|kotlin[_\s-]?app)\b/i,
      /\b(build[_\s]+(?:a\s+)?mobile|build[_\s]+(?:an?\s+)?(?:ios|android)|mobile[_\s-]?version)\b/i,
      /\b(push[_\s-]?notification|haptic[_\s-]?feedback|device[_\s-]?camera|biometric[_\s-]?auth|app[_\s-]?store|play[_\s-]?store)\b/i,
    ],
    explicit: true,
  },

  // Desktop
  {
    platform:  'desktop',
    patterns:  [
      /\b(desktop[_\s-]?app|electron[_\s-]?app|tauri[_\s-]?app|native[_\s-]?desktop|cross[_\s-]?platform[_\s-]?desktop|windows[_\s-]?app|macos[_\s-]?app|linux[_\s-]?app)\b/i,
      /\b(build[_\s]+(?:a\s+)?desktop|desktop[_\s-]?tool|desktop[_\s-]?software|system[_\s-]?tray|native[_\s-]?menu|local[_\s-]?app)\b/i,
      /\b(file[_\s-]?system[_\s-]?access|window[_\s-]?management|auto[_\s-]?update[_\s-]?electron|installer[_\s-]?package)\b/i,
    ],
    explicit: true,
  },

  // Backend / API
  {
    platform:  'backend',
    patterns:  [
      /\b(api[_\s-]?service|rest[_\s-]?api|graphql[_\s-]?api|backend[_\s-]?service|microservice|serverless[_\s-]?function|lambda[_\s-]?function|fastify|grpc)\b/i,
      /\b(build[_\s]+(?:a\s+)?(?:rest|graphql|grpc|backend)\s+api|build[_\s]+(?:an?\s+)?api[_\s-]?server|api[_\s-]?only)\b/i,
      /\b(no[_\s-]?ui|headless[_\s-]?backend|data[_\s-]?pipeline|webhook[_\s-]?server|worker[_\s-]?service)\b/i,
    ],
    explicit: true,
  },

  // Web (explicit)
  {
    platform:  'web',
    patterns:  [
      /\b(web[_\s-]?app|website|web[_\s-]?site|next\.?js|nextjs|react[_\s-]?app|vue[_\s-]?app|svelte[_\s-]?app|nuxt|remix[_\s-]?app)\b/i,
      /\b(build[_\s]+(?:a\s+)?(?:web[_\s-]?)?(?:website|web[_\s-]?app|landing[_\s-]?page|saas|dashboard|portal))\b/i,
      /\b(ssr|server[_\s-]?side[_\s-]?render|seo[_\s-]?friendly|static[_\s-]?site|jamstack|vercel[_\s-]?deploy)\b/i,
    ],
    explicit: true,
  },
];

// ── Implicit platform patterns (domain inference) ─────────────────────────────

const IMPLICIT_PATTERNS = [
  {
    platform: 'mobile',
    patterns: [
      /\b(fitness[_\s-]?tracker|step[_\s-]?counter|workout[_\s-]?app|running[_\s-]?app|health[_\s-]?tracker|sleep[_\s-]?tracker)\b/i,
      /\b(offline[_\s-]?first|touch[_\s-]?gestur|swipe[_\s-]?navigation|bottom[_\s-]?tab|tab[_\s-]?bar[_\s-]?navigation)\b/i,
      /\b(gps[_\s-]?tracking|location[_\s-]?based|nearby[_\s-]?search|map[_\s-]?view|augmented[_\s-]?reality)\b/i,
    ],
    explicit: false,
  },
  {
    platform: 'desktop',
    patterns: [
      /\b(text[_\s-]?editor|code[_\s-]?editor|ide|file[_\s-]?manager|photo[_\s-]?editor|video[_\s-]?editor|note[_\s-]?taking[_\s-]?app|markdown[_\s-]?editor)\b/i,
      /\b(keyboard[_\s-]?shortcut|menu[_\s-]?bar|taskbar|clipboard|drag[_\s-]?and[_\s-]?drop[_\s-]?file)\b/i,
    ],
    explicit: false,
  },
  {
    platform: 'backend',
    patterns: [
      /\b(data[_\s-]?processing|etl[_\s-]?pipeline|batch[_\s-]?job|cron[_\s-]?job|queue[_\s-]?processor|worker|scraper)\b/i,
      /\b(authentication[_\s-]?service|payment[_\s-]?processor|email[_\s-]?service|notification[_\s-]?service)\b/i,
    ],
    explicit: false,
  },
  // Web is the default — no explicit implicit patterns needed
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect the target platform from a user prompt.
 *
 * @param {string} prompt
 * @param {Object} [intentMemory] - Optional intent memory for context
 * @returns {import('./types').PlatformDetectionResult}
 */
function detectPlatform(prompt, intentMemory) {
  if (!prompt || typeof prompt !== 'string') {
    return _defaultDetection();
  }

  const p = prompt.trim();

  // 1. Check explicit patterns (highest confidence)
  for (const entry of EXPLICIT_PATTERNS) {
    const matched = entry.patterns.filter(rx => rx.test(p));
    if (matched.length > 0) {
      const indicators = _extractIndicators(p, matched);
      return {
        platform:          entry.platform,
        confidence:        indicators.length >= 2 ? 'high' : 'medium',
        indicators,
        isExplicit:        true,
        secondaryPlatforms: _findSecondaryPlatforms(p, entry.platform),
        rationale:         `Explicit ${entry.platform} platform keywords detected: ${indicators.slice(0, 3).join(', ')}`,
      };
    }
  }

  // 2. Check implicit patterns (medium confidence)
  for (const entry of IMPLICIT_PATTERNS) {
    const matched = entry.patterns.filter(rx => rx.test(p));
    if (matched.length > 0) {
      const indicators = _extractIndicators(p, matched);
      return {
        platform:          entry.platform,
        confidence:        'medium',
        indicators,
        isExplicit:        false,
        secondaryPlatforms: _findSecondaryPlatforms(p, entry.platform),
        rationale:         `Inferred ${entry.platform} from domain context: ${indicators.slice(0, 2).join(', ')}`,
      };
    }
  }

  // 3. Check intent memory for platform hint
  if (intentMemory?.platform) {
    return {
      platform:          intentMemory.platform,
      confidence:        'low',
      indicators:        [],
      isExplicit:        false,
      secondaryPlatforms: [],
      rationale:         'Platform carried over from intent memory',
    };
  }

  // 4. Default to web
  return _defaultDetection();
}

/**
 * Check if a prompt explicitly requests multiple platforms.
 * @param {string} prompt
 * @returns {PlatformType[]}
 */
function detectAllPlatforms(prompt) {
  if (!prompt) return ['web'];
  const found = new Set();

  for (const entry of EXPLICIT_PATTERNS) {
    if (entry.patterns.some(rx => rx.test(prompt))) found.add(entry.platform);
  }
  for (const entry of IMPLICIT_PATTERNS) {
    if (entry.patterns.some(rx => rx.test(prompt))) found.add(entry.platform);
  }

  return found.size > 0 ? [...found] : ['web'];
}

/**
 * Quick check: is this a platform switch request?
 * e.g. "also generate a mobile version"
 * @param {string} prompt
 * @returns {{ isSwitchRequest: boolean, targetPlatform: string|null }}
 */
function detectPlatformSwitch(prompt) {
  if (!prompt) return { isSwitchRequest: false, targetPlatform: null };

  const SWITCH_PATTERNS = [
    /\b(also[_\s]+(?:generate|build|create)|generate[_\s]+(?:a[_\s]+)?(?:mobile|desktop|web|backend)[_\s]+version|add[_\s]+(?:mobile|desktop|web|backend)[_\s]+support|port[_\s]+to[_\s]+(?:mobile|desktop|web|backend))\b/i,
    /\b((?:mobile|desktop|web|backend)[_\s]+version[_\s]+(?:of|as well|too))\b/i,
  ];

  if (!SWITCH_PATTERNS.some(rx => rx.test(prompt))) {
    return { isSwitchRequest: false, targetPlatform: null };
  }

  const detection = detectPlatform(prompt);
  return { isSwitchRequest: true, targetPlatform: detection.platform };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _defaultDetection() {
  return {
    platform:          'web',
    confidence:        'low',
    indicators:        [],
    isExplicit:        false,
    secondaryPlatforms: [],
    rationale:         'No platform signal detected — defaulting to web',
  };
}

function _extractIndicators(prompt, patterns) {
  const indicators = [];
  for (const rx of patterns) {
    const match = prompt.match(rx);
    if (match) indicators.push(match[0].toLowerCase().trim());
  }
  return [...new Set(indicators)];
}

function _findSecondaryPlatforms(prompt, primary) {
  const all = detectAllPlatforms(prompt);
  return all.filter(p => p !== primary);
}

module.exports = { detectPlatform, detectAllPlatforms, detectPlatformSwitch };
