/**
 * editTier.js — Cost-aware routing for the edit pipeline.
 *
 * Classifies edits into 4 tiers to minimize model usage and token spend:
 *
 *   TIER 0 — local deterministic transform (0 tokens, 0 model calls)
 *   TIER 1 — targeted single-file AI patch (~1,500–3,000 tokens)
 *   TIER 2 — focused multi-file AI patch   (~3,000–7,000 tokens)
 *   TIER 3 — full-context AI patch         (up to 14,000 tokens)
 *
 * Key cost levers:
 *   - filterFilesForEdit: send only the files the AI actually needs
 *   - TIER_BUDGETS: tighter completion token caps for targeted edits
 *   - TIER_CONTEXT: smaller total context window per tier
 *   - applyLocalTransform: zero-cost local CSS patches for common requests
 */

// ── File targeting ─────────────────────────────────────────────────────────────
// Maps each edit type to the file extensions actually needed.
// Sending only relevant files is the single biggest context reduction.

const EDIT_FILE_TARGETS = {
  THEME_CHANGE:      { exts: ['.css'],                              maxFiles: 1 },
  COLOR_CHANGE:      { exts: ['.css'],                              maxFiles: 1 },
  TYPOGRAPHY_CHANGE: { exts: ['.css'],                              maxFiles: 1 },
  LAYOUT_CHANGE:     { exts: ['.css', '.html', '.htm'],             maxFiles: 3 },
  COPY_CHANGE:       { exts: ['.html', '.htm'],                     maxFiles: 2 },
  COMPONENT_CHANGE:  { exts: ['.css', '.html', '.htm'],             maxFiles: 4 },
  FUNCTIONAL_FIX:    { exts: ['.js', '.html', '.htm'],              maxFiles: 4 },
  BUG_FIX_REQUEST:   { exts: ['.js', '.html', '.htm', '.css'],      maxFiles: 6 },
  NEW_FEATURE:       { exts: null,                                   maxFiles: 10 },
  GENERAL_EDIT:      { exts: null,                                   maxFiles: 8  },
};

// Max AI completion tokens per tier
const TIER_BUDGETS = {
  0: 0,
  1: 3000,
  2: 7000,
  3: 14000,
};

// Max total file context chars sent to the AI per tier
const TIER_CONTEXT_CHARS = {
  1: 8_000,
  2: 16_000,
  3: 28_000,
};

// Max chars per individual file per tier
const TIER_FILE_CAP_CHARS = {
  1: 4_000,
  2: 6_000,
  3: 8_000,
};

/**
 * Determine the cost tier for this edit type.
 * Higher tier = more context, more tokens, more cost.
 *
 * @param {string} editType
 * @returns {0|1|2|3}
 */
function getEditTier(editType) {
  switch (editType) {
    case 'THEME_CHANGE':
    case 'COLOR_CHANGE':
    case 'TYPOGRAPHY_CHANGE':
    case 'COPY_CHANGE':
      return 1;
    case 'LAYOUT_CHANGE':
    case 'COMPONENT_CHANGE':
      return 2;
    default:
      // BUG_FIX_REQUEST, FUNCTIONAL_FIX, NEW_FEATURE, GENERAL_EDIT
      return 3;
  }
}

/**
 * Filter project files to only those relevant for the edit type.
 * This is the primary context-reduction mechanism — often cuts 60–90% of input tokens.
 *
 * @param {Array<{path:string,content:string}>} files
 * @param {string} editType
 * @returns {Array<{path:string,content:string}>}
 */
function filterFilesForEdit(files, editType) {
  const target = EDIT_FILE_TARGETS[editType] || EDIT_FILE_TARGETS.GENERAL_EDIT;

  if (!target.exts) {
    // All files (but still capped)
    return files.slice(0, target.maxFiles);
  }

  const matched = files.filter(f => target.exts.some(ext => f.path.endsWith(ext)));

  if (matched.length === 0) {
    // Fallback: at minimum send index.html so AI has something to work with
    const fallback = files.find(f => f.path === 'index.html' || f.path.endsWith('/index.html'));
    return fallback ? [fallback] : files.slice(0, 1);
  }

  return matched.slice(0, target.maxFiles);
}

// ── Local deterministic transforms ────────────────────────────────────────────
// Zero-cost CSS patches for common predictable requests on template projects.
// Template-generated projects have known CSS variable names, making these safe.

const COLOR_NAMES = {
  white: '#ffffff', black: '#000000', red: '#dc2626', blue: '#2563eb',
  green: '#16a34a', yellow: '#ca8a04', orange: '#ea580c', purple: '#7c3aed',
  pink: '#db2777', teal: '#0d9488', indigo: '#4f46e5', gray: '#6b7280',
  grey: '#6b7280', navy: '#1e3a8a', gold: '#b45309',
};

/**
 * Attempt a zero-cost local transform for common requests.
 * Only applies to template-generated projects (predictable CSS variable structure).
 *
 * @param {string} prompt
 * @param {string} editType
 * @param {Array<{path:string,content:string}>} files - full project files
 * @param {object} projectMeta - must include { generatedBy }
 * @returns {Array<{path:string,content:string}>|null} patched files or null if not applicable
 */
function applyLocalTransform(prompt, editType, files, projectMeta = {}) {
  // Local transforms are only safe for template-generated projects
  // where CSS variable names are known and predictable.
  if (projectMeta.generatedBy !== 'template') return null;

  const cssFile = files.find(f => f.path.endsWith('.css'));
  if (!cssFile) return null;

  const lower = prompt.toLowerCase();

  if (editType === 'COLOR_CHANGE') {
    // "make it black and white" / "grayscale" / "monochrome"
    if (/\b(black and white|monochrome|grayscale|greyscale)\b/.test(lower)) {
      const patched = grayscaleCSSHexValues(cssFile.content);
      if (patched) return [{ path: cssFile.path, content: patched }];
    }

    // "make (the) buttons [color]"
    const btnMatch = lower.match(
      /\bbuttons?\b.{0,25}\b(white|black|red|blue|green|yellow|orange|purple|pink|teal|indigo|gray|grey|navy|gold)\b/
    );
    if (btnMatch) {
      const hex = COLOR_NAMES[btnMatch[1]];
      if (hex) {
        const patched = patchPrimaryColor(cssFile.content, hex);
        if (patched) return [{ path: cssFile.path, content: patched }];
      }
    }
  }

  return null;
}

/**
 * Convert all hex color values in CSS custom property declarations to grayscale.
 * Only targets `--var-name: #hex;` patterns to avoid corrupting other content.
 */
function grayscaleCSSHexValues(css) {
  let changed = false;
  const patched = css.replace(
    /(--[\w-]+\s*:\s*)(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})(\s*;)/g,
    (match, prop, hex, semi) => {
      const gray = hexToGray(hex);
      if (gray === hex) return match;
      changed = true;
      return `${prop}${gray}${semi}`;
    }
  );
  return changed ? patched : null;
}

function hexToGray(hex) {
  let r, g, b;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const h = lum.toString(16).padStart(2, '0');
  return '#' + h + h + h;
}

/**
 * Patch the primary/accent color vars in template CSS.
 * Template CSS uses --primary and --accent for button/CTA colors.
 */
function patchPrimaryColor(css, hex) {
  // Target the specific template vars; don't touch other vars
  const patterns = [
    /(--primary\s*:\s*)#[0-9a-fA-F]{3,6}(\s*;)/g,
    /(--accent\s*:\s*)#[0-9a-fA-F]{3,6}(\s*;)/g,
    /(--btn-bg\s*:\s*)#[0-9a-fA-F]{3,6}(\s*;)/g,
  ];
  let patched = css;
  let changed = false;
  for (const rx of patterns) {
    const next = patched.replace(rx, `$1${hex}$2`);
    if (next !== patched) { patched = next; changed = true; }
  }
  return changed ? patched : null;
}

module.exports = {
  getEditTier,
  filterFilesForEdit,
  applyLocalTransform,
  TIER_BUDGETS,
  TIER_CONTEXT_CHARS,
  TIER_FILE_CAP_CHARS,
};
