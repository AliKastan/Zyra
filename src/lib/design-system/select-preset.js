'use strict';

/**
 * Design Preset Selector
 *
 * Chooses the best-fitting design preset based on the app spec, intent signals,
 * complexity, and platform. Uses a multi-signal scoring algorithm.
 *
 * Scoring:
 *   +30  — app type exact match
 *   +5   — each matched keyword in the combined text
 *   -4   — each matched anti-keyword
 *   +20  — mobile platform exact match (for MOBILE_CONSUMER)
 *   +12  — platform match (web/mobile)
 *   +10  — complexity tier match
 *   +8   — intent tone match
 *   +baseScore — preset's natural affinity bonus (0-8)
 */

const { ALL_PRESETS, PRESET_NAMES } = require('./presets');

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Select the best design preset and its fallback.
 *
 * @param {import('./types').DesignSelectionContext} ctx
 * @returns {{ primary: import('./types').DesignPresetName, fallback: import('./types').DesignPresetName, scores: Record<string, number>, reason: string }}
 */
function selectDesignPreset(ctx) {
  const { intent = {}, complexityReport = null, overrides = {} } = ctx;

  // Honor a forced preset override
  if (overrides.forcePreset && ALL_PRESETS[overrides.forcePreset]) {
    const forced = overrides.forcePreset;
    const fallback = _pickFallback(forced);
    return {
      primary:  forced,
      fallback,
      scores:   { [forced]: 999 },
      reason:   `Preset forced by user override: ${forced}`,
    };
  }

  const allText  = _buildAllText(ctx);
  const hasMobile = _detectMobile(ctx);
  const tier     = complexityReport?.complexityTier || 'medium';
  const tone     = intent.tone || 'professional';

  const scores = {};

  for (const name of PRESET_NAMES) {
    scores[name] = _scorePreset(name, allText, hasMobile, tier, tone, intent);
  }

  // Sort descending
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const primary  = sorted[0][0];
  const fallback = sorted[1][0];
  const reason   = _buildReason(primary, scores[primary], allText, hasMobile, tier, tone);

  return { primary, fallback, scores, reason };
}

// ── Scoring ────────────────────────────────────────────────────────────────────

/**
 * @param {string} presetName
 * @param {string} allText      - lowercased combined text from all spec fields
 * @param {boolean} hasMobile
 * @param {string} tier         - complexity tier
 * @param {string} tone         - intent tone
 * @param {Object} intent
 * @returns {number}
 */
function _scorePreset(presetName, allText, hasMobile, tier, tone, intent) {
  const preset  = ALL_PRESETS[presetName];
  const signals = preset.selectionSignals;
  let score     = signals.baseScore || 0;

  // ── App type match ──────────────────────────────────────────────────────────
  const appType = (intent.appType || '').toLowerCase();
  if (signals.appTypes.some(t => appType.includes(t) || t.includes(appType))) {
    score += 30;
  }

  // ── Keyword matches ─────────────────────────────────────────────────────────
  for (const kw of signals.keywords) {
    if (allText.includes(kw.toLowerCase())) score += 5;
  }

  // ── Anti-keyword penalties ──────────────────────────────────────────────────
  for (const ak of (signals.antiKeywords || [])) {
    if (allText.includes(ak.toLowerCase())) score -= 4;
  }

  // ── Platform match ──────────────────────────────────────────────────────────
  if (hasMobile) {
    if (signals.platforms.includes('mobile')) {
      // MOBILE_CONSUMER gets an extra boost for explicitly mobile apps
      score += presetName === 'MOBILE_CONSUMER' ? 20 : 8;
    }
  } else {
    if (signals.platforms.includes('web') && !signals.platforms.includes('mobile')) score += 12;
    else if (signals.platforms.includes('web')) score += 6;
  }

  // ── Complexity tier match ───────────────────────────────────────────────────
  if (signals.complexity.includes(tier)) score += 10;

  // ── Tone match ──────────────────────────────────────────────────────────────
  if (signals.tone && signals.tone.includes(tone)) score += 8;

  // ── Intent signal bonuses ───────────────────────────────────────────────────
  if (presetName === 'ENTERPRISE_DASHBOARD' && intent.isMultiUser && (complexitySignals(intent).hasAdmin)) score += 8;
  if (presetName === 'AI_NATIVE'            && _hasAI(allText))  score += 15;
  if (presetName === 'FINANCE_ANALYTICS'    && _hasFinance(allText, intent)) score += 12;
  if (presetName === 'BOOKING_SERVICE'      && _hasBooking(allText)) score += 12;
  if (presetName === 'MARKETPLACE_MODERN'   && _hasMarketplace(allText)) score += 12;
  if (presetName === 'LOCAL_BUSINESS'       && _hasLocalBusiness(allText)) score += 15;
  if (presetName === 'LUXURY_DARK'          && _hasLuxury(allText)) score += 18;
  if (presetName === 'CREATOR_CONTENT'      && _hasCreator(allText)) score += 12;
  if (presetName === 'PLAYFUL_CONSUMER'     && tone === 'playful') score += 10;
  if (presetName === 'PREMIUM_STARTUP'      && _isLandingPageType(intent)) score += 12;

  return Math.max(0, score);
}

// ── All-text builder ───────────────────────────────────────────────────────────

function _buildAllText(ctx) {
  const { intent = {}, product = {}, blueprint = {} } = ctx;

  const parts = [
    intent.appType        || '',
    intent.category       || '',
    intent.target         || '',
    (intent.features || []).map(f => f.name + ' ' + (f.description || '')).join(' '),
    (intent.userFlows || []).map(f => f.name).join(' '),
    intent.realContent?.appName || '',
    product.appName       || '',
    product.summary       || '',
    (product.pages || []).map(p => p.name).join(' '),
    blueprint.projectName || '',
    blueprint.designNotes || '',
  ];

  return parts.join(' ').toLowerCase().replace(/\s+/g, ' ');
}

// ── Platform detection ─────────────────────────────────────────────────────────

function _detectMobile(ctx) {
  const { intent = {}, complexityReport = null } = ctx;
  const signals = complexityReport?.signals || {};
  if (signals.hasMobile) return true;

  const text = _buildAllText(ctx);
  return /\b(mobile|ios|android|expo|react.native|flutter|native app|app store)\b/.test(text);
}

// ── Domain-specific detectors ──────────────────────────────────────────────────

function _hasAI(text) {
  return /\b(ai|gpt|llm|claude|openai|anthropic|gemini|chatbot|assistant|generate|neural|machine.learning|copilot|completion|embedding)\b/.test(text);
}

function _hasFinance(text, intent) {
  return /\b(finance|financial|accounting|budget|revenue|expense|trading|investment|portfolio|transaction|balance|profit|loss|forecast|analytics|metrics|kpi|chart|graph|report)\b/.test(text);
}

function _hasBooking(text) {
  return /\b(book|booking|appointment|schedule|reservation|calendar|slot|availability|barber|salon|clinic|doctor|trainer|class|session)\b/.test(text);
}

function _hasMarketplace(text) {
  return /\b(marketplace|listing|buy|sell|shop|browse|discover|vendor|seller|inventory|cart|checkout|ecommerce|e-commerce)\b/.test(text);
}

function _hasLocalBusiness(text) {
  return /\b(restaurant|cafe|coffee|food|barber|salon|hair|beauty|spa|local|plumber|electrician|contractor|delivery|menu|small.business)\b/.test(text);
}

function _hasLuxury(text) {
  return /\b(luxury|premium|elite|exclusive|high.end|dark.mode|prestige|sophisticated|minimalist.dark|fashion|portfolio.premium)\b/.test(text);
}

function _hasCreator(text) {
  return /\b(creator|content|blog|article|post|media|video|photo|gallery|newsletter|subscribe|follow|audience|publish)\b/.test(text);
}

function _isLandingPageType(intent) {
  const type = (intent.appType || '').toLowerCase();
  return type === 'landing-page' || type === 'marketing' || type === 'generic';
}

function complexitySignals(intent) {
  return {
    hasAdmin: (intent.features || []).some(f => /admin/i.test(f.name + ' ' + (f.description || ''))),
  };
}

// ── Fallback selection ─────────────────────────────────────────────────────────

/**
 * Pick a semantically related fallback preset for a given primary.
 */
function _pickFallback(primary) {
  const fallbackMap = {
    MINIMAL_SAAS:         'ENTERPRISE_DASHBOARD',
    PREMIUM_STARTUP:      'MINIMAL_SAAS',
    ENTERPRISE_DASHBOARD: 'MINIMAL_SAAS',
    MOBILE_CONSUMER:      'PLAYFUL_CONSUMER',
    MARKETPLACE_MODERN:   'MINIMAL_SAAS',
    BOOKING_SERVICE:      'LOCAL_BUSINESS',
    AI_NATIVE:            'MINIMAL_SAAS',
    CREATOR_CONTENT:      'PREMIUM_STARTUP',
    FINANCE_ANALYTICS:    'ENTERPRISE_DASHBOARD',
    PLAYFUL_CONSUMER:     'MOBILE_CONSUMER',
    LUXURY_DARK:          'PREMIUM_STARTUP',
    LOCAL_BUSINESS:       'BOOKING_SERVICE',
  };
  return fallbackMap[primary] || 'MINIMAL_SAAS';
}

// ── Selection reason ───────────────────────────────────────────────────────────

function _buildReason(preset, score, allText, hasMobile, tier, tone) {
  const parts = [`Selected ${preset} (score: ${score})`];

  if (hasMobile) parts.push('mobile platform detected');
  if (tier !== 'medium') parts.push(`complexity: ${tier}`);

  // Check which high-signal keywords matched
  const keySignals = {
    AI_NATIVE:            _hasAI(allText),
    BOOKING_SERVICE:      _hasBooking(allText),
    MARKETPLACE_MODERN:   _hasMarketplace(allText),
    LOCAL_BUSINESS:       _hasLocalBusiness(allText),
    LUXURY_DARK:          _hasLuxury(allText),
    CREATOR_CONTENT:      _hasCreator(allText),
  };
  const matchedSignal = Object.entries(keySignals).find(([name, matched]) => name === preset && matched);
  if (matchedSignal) parts.push(`domain keyword match`);
  if (tone && tone !== 'professional') parts.push(`tone: ${tone}`);

  return parts.join(' — ');
}

module.exports = { selectDesignPreset };
