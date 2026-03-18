/**
 * scopeClassifier.js
 *
 * Detects explicit scope restrictions in edit prompts.
 * "fix only this button"  → { scope:'component', target:'button', isScoped:true }
 * "improve only UI"       → { scope:'ui',        target:null,     isScoped:true }
 * "rewrite only the logic"→ { scope:'logic',      target:null,     isScoped:true }
 * "update login page"     → { scope:'page',       target:'login',  isScoped:true }
 * "change header color"   → { scope:'ui',         target:'header', isScoped:true }
 * regular edit            → { scope:'auto',        target:null,     isScoped:false }
 */

'use strict';

// Words that signal an explicit scope restriction
const SCOPE_TRIGGERS = /\b(only|just|solely|strictly|nothing else|don'?t touch|don'?t change|leave everything else|keep everything else|without touching|without changing)\b/i;

// Scope detection rules — checked in order, first match wins
const SCOPE_RULES = [
  {
    scope: 'ui',
    patterns: [
      /\b(only|just)\b.{0,30}\b(visual|visuals|look|style|appearance|css|styling|theme|colors?|layout|graphics?)\b/i,
      /\b(visual|style|appearance|css|styling|theme|colors?|layout)\b.{0,20}\b(only|just|alone)\b/i,
      /\b(improve|fix|update|change|rework|redo|rewrite)\b.{0,20}\b(only|just)\b.{0,20}\b(visual|look|css|style|appearance)\b/i,
    ],
    allowedExtensions: ['.css', '.scss', '.less'],
    extraAllowed: ['style', 'styles'],
  },
  {
    scope: 'logic',
    patterns: [
      /\b(only|just)\b.{0,30}\b(gameplay|logic|mechanics?|javascript|js|functions?|code|behavior|physics|movement|collision)\b/i,
      /\b(gameplay|logic|mechanics?|javascript|functions?|behavior)\b.{0,20}\b(only|just|alone)\b/i,
      /\b(rewrite|fix|update)\b.{0,20}\b(only|just)\b.{0,30}\b(gameplay|logic|mechanics?|js|functions?|code)\b/i,
    ],
    allowedExtensions: ['.js', '.ts', '.jsx', '.tsx'],
    extraAllowed: [],
  },
  {
    scope: 'component',
    patterns: [
      /\b(only|just)\b.{0,40}\b(player|enemy|enemies|hud|button|menu|overlay|joystick|score|health|timer|wave|particle|obstacle|platform|powerup)\b/i,
      /\b(fix|improve|update|restyle|rework)\b.{0,20}\b(only|just)\b.{0,30}\b(player|enemy|hud|button|menu|overlay|joystick|score|health)\b/i,
      /\b(this|the)\s+\b(player|enemy|hud|button|menu|overlay|joystick|score|health|timer)\b.{0,20}\b(only|just|alone)\b/i,
    ],
    allowedExtensions: ['.html', '.css', '.js'],
    extraAllowed: [],
  },
  {
    scope: 'page',
    patterns: [
      /\b(only|just)\b.{0,40}\b(screen|game.?over|pause|main.?menu|settings|tutorial|loading)\b/i,
      /\b(game.?over|pause|main.?menu|settings|tutorial)\b.{0,20}\b(screen|only|just|alone)\b/i,
      /\b(screen)\b.{0,20}\b(only|just|alone)\b/i,
    ],
    allowedExtensions: ['.html', '.js'],
    extraAllowed: [],
  },
  {
    scope: 'function',
    patterns: [
      /\b(only|just)\b.{0,40}\b(function|method|handler|callback|hook|util|utility|helper)\b/i,
      /\b(function|method|handler)\b.{0,20}\b(only|just|alone)\b/i,
    ],
    allowedExtensions: ['.js', '.ts'],
    extraAllowed: [],
  },
];

// Extract a meaningful target name from the prompt (e.g. "login button", "dashboard page")
function extractTarget(prompt, scope) {
  const lower = prompt.toLowerCase();

  const COMPONENT_NAMES = ['button', 'player', 'enemy', 'hud', 'score', 'health', 'menu', 'overlay', 'joystick', 'particle', 'projectile', 'platform', 'obstacle', 'powerup', 'timer', 'wave'];
  const PAGE_NAMES = ['menu', 'gameover', 'game over', 'pause', 'settings', 'tutorial', 'loading'];
  const QUALIFIERS = ['the', 'this', 'that', 'my', 'a', 'an'];

  if (scope === 'component') {
    for (const name of COMPONENT_NAMES) {
      const idx = lower.indexOf(name);
      if (idx === -1) continue;
      // Try to grab a qualifier word before the component
      const before = lower.slice(Math.max(0, idx - 25), idx).trim().split(/\s+/);
      const qualifier = before.filter(w => !QUALIFIERS.includes(w) && w.length > 2).slice(-1)[0];
      return qualifier ? `${qualifier} ${name}` : name;
    }
  }

  if (scope === 'page') {
    for (const name of PAGE_NAMES) {
      if (lower.includes(name)) return `${name} page`;
    }
  }

  // Generic: grab 2-3 words around "only" / "just"
  const m = prompt.match(/\b(?:only|just)\b\s+(?:the\s+|this\s+)?([a-z][a-z0-9\s-]{2,30}?)(?:\s+(?:only|just|section|part|code|component|logic|ui|page)|\.|,|$)/i);
  if (m) return m[1].trim();

  return null;
}

/**
 * Classify the scope of an edit prompt.
 *
 * @param {string} prompt
 * @returns {{
 *   scope: 'ui'|'logic'|'component'|'page'|'function'|'auto',
 *   target: string|null,
 *   isScoped: boolean,
 *   allowedExtensions: string[]|null,
 *   extraAllowed: string[],
 *   constraint: string|null,
 * }}
 */
function classifyScope(prompt) {
  if (!prompt) return { scope: 'auto', target: null, isScoped: false, allowedExtensions: null, extraAllowed: [], constraint: null };

  const constraintMatch = prompt.match(SCOPE_TRIGGERS);
  const constraint = constraintMatch ? constraintMatch[1].toLowerCase() : null;

  for (const rule of SCOPE_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(prompt)) {
        const target = extractTarget(prompt, rule.scope);
        return {
          scope:             rule.scope,
          target,
          isScoped:          true,
          allowedExtensions: rule.allowedExtensions,
          extraAllowed:      rule.extraAllowed || [],
          constraint,
        };
      }
    }
  }

  // Even without "only/just", certain patterns suggest a scoped intent
  if (constraint) {
    // Has a restricting word — auto-detect scope from context
    for (const rule of SCOPE_RULES) {
      // Try matching without the "only/just" prefix requirement
      const broader = [
        new RegExp(`\\b(${rule.scope}|${(rule.extraAllowed || []).join('|')})\\b`, 'i'),
      ];
      for (const p of broader) {
        if (p.test(prompt)) {
          const target = extractTarget(prompt, rule.scope);
          return { scope: rule.scope, target, isScoped: true, allowedExtensions: rule.allowedExtensions, extraAllowed: rule.extraAllowed || [], constraint };
        }
      }
    }
  }

  return { scope: 'auto', target: null, isScoped: false, allowedExtensions: null, extraAllowed: [], constraint: null };
}

/**
 * Filter a file list to only include files allowed for a given scope.
 *
 * @param {Array<{path:string,content:string}>} files
 * @param {{scope:string, allowedExtensions:string[]|null, extraAllowed:string[], target:string|null}} scopeInfo
 * @param {string} [editType] — fallback edit type for no-scope case
 * @returns {Array<{path:string,content:string}>}
 */
function filterFilesByScope(files, scopeInfo, editType) {
  if (!scopeInfo.isScoped || !scopeInfo.allowedExtensions) return files;

  const { allowedExtensions, extraAllowed, scope, target } = scopeInfo;

  let filtered = files.filter(f => {
    const ext = '.' + f.path.split('.').pop().toLowerCase();
    if (allowedExtensions.includes(ext)) return true;
    // Check extraAllowed (e.g. files with 'style' in name)
    if (extraAllowed.some(kw => f.path.toLowerCase().includes(kw))) return true;
    return false;
  });

  // For page scope, try to narrow to the specific page file
  if (scope === 'page' && target) {
    const pageName = target.replace(/\s+page$/i, '').trim().toLowerCase();
    const specific = filtered.filter(f => f.path.toLowerCase().includes(pageName));
    if (specific.length > 0) filtered = specific;
  }

  // For component scope, include both CSS and relevant HTML
  if (scope === 'component') {
    filtered = files.filter(f => {
      const ext = '.' + f.path.split('.').pop().toLowerCase();
      return ['.html', '.css', '.js'].includes(ext);
    });
  }

  // Always include at least one file
  if (filtered.length === 0) {
    const fallback = files.find(f => f.path === 'index.html') || files[0];
    return fallback ? [fallback] : files.slice(0, 2);
  }

  return filtered;
}

/**
 * Build a scope constraint block to inject into the edit prompt.
 * Tells the AI exactly what it may and may not touch.
 *
 * @param {{scope:string, target:string|null, isScoped:boolean}} scopeInfo
 * @param {string[]} allowedFilePaths - files the AI may modify
 * @param {string[]} forbiddenFilePaths - files the AI must NOT touch
 * @returns {string}
 */
function buildScopeConstraintBlock(scopeInfo, allowedFilePaths, forbiddenFilePaths) {
  if (!scopeInfo.isScoped) return '';

  const { scope, target } = scopeInfo;

  const scopeLabel = {
    ui:        'visual styling only (CSS — colors, layout, appearance)',
    logic:     'gameplay logic only (JavaScript — mechanics, rules, behavior)',
    component: target ? `the ${target}` : 'the specified game element',
    page:      target ? `the ${target}` : 'the specified game screen',
    function:  target ? `the ${target} function` : 'the specified function',
  }[scope] || scope;

  const lines = [
    `SCOPE CONSTRAINT — READ THIS FIRST (non-negotiable):`,
    `You are ONLY allowed to modify: ${scopeLabel}.`,
    `You must NOT change anything outside this scope.`,
    `You must NOT add, remove, or rename files outside this scope.`,
    `Preserve all other functionality, layout, and code 100% unchanged.`,
  ];

  if (allowedFilePaths.length > 0) {
    lines.push(`Files you MAY modify: ${allowedFilePaths.join(', ')}`);
  }
  if (forbiddenFilePaths.length > 0) {
    lines.push(`Files you must NOT output or change: ${forbiddenFilePaths.join(', ')}`);
  }

  lines.push(`Only output files that you actually modified within the allowed scope.`);

  return lines.join('\n');
}

module.exports = { classifyScope, filterFilesByScope, buildScopeConstraintBlock };
