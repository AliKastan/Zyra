'use strict';

/**
 * Change Type Detection
 *
 * Classifies a follow-up user prompt into a ChangeDetection result that
 * downstream modules use to determine section impact and regeneration scope.
 *
 * Strategy:
 *   1. Detect action verb (add/remove/fix/improve/restyle/change)
 *   2. Detect domain/section keywords (billing, auth, admin, UI, etc.)
 *   3. Map (action, domain) → primary ChangeType
 *   4. Collect secondary types that also match
 *   5. Detect full-regen signals (platform switch, "rebuild from scratch")
 */

// ── Domain keyword patterns ───────────────────────────────────────────────────
// Ordered by specificity — checked first. First match wins for domain classification.

const DOMAIN_PATTERNS = [
  {
    domain:     'billing',
    section:    'billing',
    changeType: 'change_billing',
    pattern:    /\b(stripe|billing|payment(?:s)?|checkout|subscription|pricing|invoice|charge|plan(?:\s+tier)?|webhook.*pay|recurring)\b/i,
  },
  {
    domain:     'deployment',
    section:    'deployment',
    changeType: 'improve_deployment',
    pattern:    /\b(railway|heroku|vercel|netlify|aws|docker|health[_\s-]?check|health[_\s-]?route|procfile|start(?:up)?[_\s-]?script|server[_\s-]?config|env[_\s-]?setup|port[_\s-]?config)\b/i,
  },
  {
    domain:     'admin',
    section:    'admin',
    changeType: 'improve_admin_tools',
    pattern:    /\b(admin|moderat(?:ion|e)|backoffice|back[_\s-]?office|internal[_\s-]?tool|operator[_\s-]?panel|staff[_\s-]?panel)\b/i,
  },
  {
    domain:     'navigation',
    section:    'mobile-shell',
    changeType: 'change_navigation',
    pattern:    /\b(tab[_\s-]?bar|tab[_\s-]?navigation|stack[_\s-]?navigation|drawer[_\s-]?navigation|mobile[_\s-]?nav|bottom[_\s-]?nav|app[_\s-]?shell|expo[_\s-]?nav)\b/i,
  },
  {
    domain:     'platform',
    section:    'mobile-shell',
    changeType: 'change_platform',
    pattern:    /\b(mobile[_\s-]?app|ios[_\s-]?app|android[_\s-]?app|expo|react[_\s-]?native|native[_\s-]?app|cross[_\s-]?platform|web[_\s-]?only|mobile[_\s-]?only|desktop[_\s-]?app)\b/i,
  },
  {
    domain:     'auth',
    section:    'auth',
    changeType: 'change_auth_behavior',
    pattern:    /\b(auth(?:entication|orization)?|login|sign[_\s-]?(?:up|in)|register|session(?:s)?|jwt|oauth|sso|passw(?:ord|ords)|role[_\s-]?guard|permission(?:s)?|protected[_\s-]?route|middleware[_\s-]?auth)\b/i,
  },
  {
    domain:     'integration',
    section:    'integrations',
    changeType: 'add_integration',
    pattern:    /\b(openai|anthropic|claude|gpt[_\s-]?\d?|supabase|firebase|resend|sendgrid|mailgun|postmark|smtp|twilio|vonage|pusher|cloudinary|s3[_\s\-]?bucket|google[_\s-]?analytics|posthog|sentry|mixpanel|intercom|hubspot|mapbox|google[_\s-]?maps)\b/i,
  },
  {
    domain:     'database',
    section:    'database',
    changeType: 'change_database',
    pattern:    /\b(schema|(?:data[_\s-]?)?model(?:s)?|entit(?:y|ies)|migration(?:s)?|(?:data)?base[_\s-]?table|prisma|mongoose|sequelize|knex|typeorm|drizzle|relation(?:ship)?|foreign[_\s-]?key)\b/i,
  },
  {
    domain:     'ux-states',
    section:    'ux-states',
    changeType: 'fix_ux_states',
    pattern:    /\b(loading[_\s-]?state(?:s)?|spinner(?:s)?|skeleton(?:s)?|error[_\s-]?state(?:s)?|empty[_\s-]?state(?:s)?|no[_\s-]?results?|placeholder[_\s-]?ui|disabled[_\s-]?state)\b/i,
  },
  {
    domain:     'design-system',
    section:    'design-system',
    changeType: 'restyle_ui',
    pattern:    /\b(dark(?:er)?[_\s-]?(?:mode|theme)?|light(?:er)?[_\s-]?(?:mode|theme)?|color[_\s-]?(?:scheme|palette|system)?|theme(?:ing)?|typography|font(?:s)?[_\s-]?(?:size|style)?|design[_\s-]?system|token(?:s)?|visual[_\s-]?style|aesthetic|brand(?:ing)?)\b/i,
  },
];

// ── Action patterns ───────────────────────────────────────────────────────────

const ACTION_PATTERNS = [
  { action: 'remove', pattern: /\b(remove|delete|disable|strip|eliminate|get[_\s-]?rid[_\s-]?of|drop|turn[_\s-]?off|delet[_\s-]?|uninstall|deactivate)\b/i },
  { action: 'add',    pattern: /\b(add|implement|include|build|create|set[_\s-]?up|integrate|introduce|enable|install|support|scaffold)\b/i },
  { action: 'fix',    pattern: /\b(fix|repair|broken|not[_\s-]?working|bug|issue|problem|crash(?:ing)?|error(?:ing)?|failing|wrong|incorrect)\b/i },
  { action: 'restyle',pattern: /\b(restyle|redesign|make.*dark(?:er)?|make.*light(?:er)?|change.*look|change.*feel|update.*ui|visual.*update)\b/i },
  { action: 'improve',pattern: /\b(improve|enhance|refine|better|optimize|upgrade|polish|clean[_\s-]?up|revamp)\b/i },
  { action: 'change', pattern: /\b(change|modify|adjust|tweak|update|switch|convert|transform|replace|move)\b/i },
];

// ── Full-regeneration trigger signals ─────────────────────────────────────────

const FULL_REGEN_SIGNALS = [
  /\b(rebuild[_\s-]?from[_\s-]?scratch|start[_\s-]?over|completely[_\s-]?different|full[_\s-]?rebuild|rewrite[_\s-]?everything|from[_\s-]?scratch)\b/i,
  /\b(switch[_\s-]?to[_\s-]?(?:react|vue|angular|svelte|next|nuxt)|migrate[_\s-]?to[_\s-]?(?:supabase|firebase|mongodb|postgres))\b/i,
  /\b(convert[_\s-]?(?:to|into)[_\s-]?(?:mobile|ios|android|native)|(?:ios|android)[_\s-]?and[_\s-]?(?:android|ios))\b/i,
  /\b(marketplace|multi[_\s-]?tenant|complete[_\s-]?overhaul|major[_\s-]?redesign|architectural[_\s-]?change)\b/i,
];

// ── Action→Domain→ChangeType mapping ─────────────────────────────────────────
// When domain is detected, action refines the change type.

function _mapActionDomainToChangeType(action, domain, baseChangeType) {
  if (action === 'remove') {
    // Removal overrides the base changeType
    return 'remove_feature';
  }
  if (action === 'fix') {
    if (domain === 'deployment') return 'improve_deployment';
    return 'targeted_repair';
  }
  // All other actions → keep the domain's default changeType
  return baseChangeType;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify a follow-up user prompt into a ChangeDetection result.
 *
 * @param {string}  prompt        - The user's follow-up request
 * @param {Object}  [intentMemory] - Current session intent memory (optional)
 * @returns {import('./types').ChangeDetection}
 */
function detectChangeType(prompt, intentMemory) {
  if (!prompt || typeof prompt !== 'string') {
    return _noChange();
  }

  const p = prompt.trim();

  // 1. Check for full-regen signals first
  const fullRegenSignal = FULL_REGEN_SIGNALS.some(rx => rx.test(p));

  // 2. Detect action
  const actionMatch = ACTION_PATTERNS.find(ap => ap.pattern.test(p));
  const action      = actionMatch?.action || 'unknown';

  // 3. Detect domain(s) — all matching domains
  const matchedDomains = DOMAIN_PATTERNS.filter(dp => dp.pattern.test(p));

  // 4. Extract indicators (which keywords matched)
  const indicators = [];
  for (const m of matchedDomains) {
    const match = p.match(m.pattern);
    if (match) indicators.push(match[0].toLowerCase());
  }
  if (actionMatch) {
    const match = p.match(actionMatch.pattern);
    if (match) indicators.push(match[0].toLowerCase());
  }

  // 5. Map to sections
  const targetSections = [...new Set(matchedDomains.map(d => d.section))];

  // 6. Primary change type
  let changeType;
  let confidence = 'medium';

  if (matchedDomains.length === 0 && action === 'unknown') {
    // No clear signal — generic modify
    changeType = 'modify_feature';
    confidence  = 'low';
  } else if (matchedDomains.length > 0) {
    // Use the first (highest priority) domain match, refined by action
    const primary = matchedDomains[0];
    changeType    = _mapActionDomainToChangeType(action, primary.domain, primary.changeType);
    confidence    = matchedDomains.length === 1 ? 'high' : 'medium';
  } else {
    // Action-only (no domain)
    changeType = _actionOnlyChangeType(action);
    confidence  = 'medium';
  }

  // Platform change always forces itself as primary
  const hasPlatformDomain = matchedDomains.some(d => d.domain === 'platform');
  if (hasPlatformDomain) {
    changeType = 'change_platform';
    confidence  = 'high';
  }

  // 7. Secondary types
  const secondaryTypes = matchedDomains
    .slice(1)
    .map(d => _mapActionDomainToChangeType(action, d.domain, d.changeType))
    .filter((t, i, arr) => t !== changeType && arr.indexOf(t) === i);

  // If action=add and no domain, also add add_feature as fallback
  if (action === 'add' && matchedDomains.length > 0 && !secondaryTypes.includes('add_feature')) {
    secondaryTypes.push('add_feature');
  }

  return {
    changeType,
    secondaryTypes,
    action,
    targetSections,
    confidence,
    indicators: [...new Set(indicators)],
    isAdditive: action === 'add' || (action === 'unknown' && /\badd\b/i.test(p)),
    isRemoval:  action === 'remove',
    isRepair:   action === 'fix' || changeType === 'targeted_repair',
    isFullRegenRequired: fullRegenSignal || changeType === 'change_platform',
  };
}

/**
 * Detect whether a prompt is a major architectural change requiring full regeneration.
 *
 * @param {string} prompt
 * @returns {{ required: boolean, reason: string }}
 */
function isFullRegenerationRequired(prompt) {
  if (!prompt) return { required: false, reason: '' };

  for (const signal of FULL_REGEN_SIGNALS) {
    if (signal.test(prompt)) {
      return { required: true, reason: `Full-regen trigger detected: "${signal.toString()}"` };
    }
  }

  const detection = detectChangeType(prompt);
  if (detection.changeType === 'change_platform') {
    return { required: true, reason: 'Platform change detected — requires full regeneration' };
  }

  return { required: false, reason: '' };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _actionOnlyChangeType(action) {
  switch (action) {
    case 'add':     return 'add_feature';
    case 'remove':  return 'remove_feature';
    case 'fix':     return 'targeted_repair';
    case 'restyle': return 'restyle_ui';
    case 'improve': return 'modify_feature';
    case 'change':  return 'modify_feature';
    default:        return 'modify_feature';
  }
}

function _noChange() {
  return {
    changeType:     'modify_feature',
    secondaryTypes: [],
    action:         'unknown',
    targetSections: [],
    confidence:     'low',
    indicators:     [],
    isAdditive:     false,
    isRemoval:      false,
    isRepair:       false,
    isFullRegenRequired: false,
  };
}

module.exports = {
  detectChangeType,
  isFullRegenerationRequired,
  DOMAIN_PATTERNS,
  ACTION_PATTERNS,
};
