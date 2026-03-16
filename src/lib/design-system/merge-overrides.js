'use strict';

/**
 * Merge Design Overrides
 *
 * Applies user-specified overrides on top of a base DesignSpec.
 * Supports: themeMode, density, accentMood, individual color overrides.
 *
 * Override precedence: user overrides > preset defaults.
 * Non-specified fields are always left as the preset values.
 *
 * Future extension points:
 *   - brand color injection
 *   - logo-aware theming
 *   - per-page variation within safe limits
 *   - white-label theme export
 */

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Merge overrides into a base DesignSpec.
 * Returns a new spec — does not mutate the input.
 *
 * @param {import('./types').DesignSpec} base
 * @param {import('./types').DesignOverrides} overrides
 * @returns {import('./types').DesignSpec}
 */
function mergeDesignOverrides(base, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return base;

  const spec = { ...base, tokens: { ...base.tokens, colors: { ...base.tokens.colors } } };

  // themeMode, density, visualTone already applied in buildDesignSpec
  // — only handle color-level overrides here

  // Direct color overrides
  if (overrides.colors) {
    Object.assign(spec.tokens.colors, overrides.colors);
  }

  // Accent mood adjustments
  if (overrides.accentMood) {
    _applyAccentMood(spec, overrides.accentMood);
  }

  return spec;
}

/**
 * Produce a summary of what overrides were applied.
 *
 * @param {import('./types').DesignOverrides} overrides
 * @returns {string}
 */
function describeOverrides(overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return 'no overrides';

  const parts = [];
  if (overrides.forcePreset)  parts.push(`forcePreset=${overrides.forcePreset}`);
  if (overrides.themeMode)    parts.push(`themeMode=${overrides.themeMode}`);
  if (overrides.density)      parts.push(`density=${overrides.density}`);
  if (overrides.visualTone)   parts.push(`visualTone=${overrides.visualTone}`);
  if (overrides.accentMood)   parts.push(`accentMood=${overrides.accentMood}`);
  if (overrides.colors)       parts.push(`colors(${Object.keys(overrides.colors).join(',')})`);
  return parts.join(', ');
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Apply an accent mood adjustment to the color tokens.
 * @param {import('./types').DesignSpec} spec
 * @param {'restrained'|'bold'|'playful'} mood
 */
function _applyAccentMood(spec, mood) {
  const colors = spec.tokens.colors;

  switch (mood) {
    case 'restrained':
      // Reduce saturation by shifting primary toward a more muted version
      // (simplified: just use a neutral-leaning secondary)
      spec.tokens.colors = {
        ...colors,
        secondary: _desaturate(colors.secondary),
        accent:    _desaturate(colors.accent || colors.secondary),
      };
      break;

    case 'bold':
      // No change — preset colors are already vivid
      break;

    case 'playful':
      // Shift accent toward more vibrant values if they aren't already
      spec.tokens.colors = {
        ...colors,
        accent: colors.accent || '#F59E0B',
      };
      break;

    default:
      break;
  }
}

/**
 * Rough desaturation — shifts a hex color toward gray.
 * Not perceptually accurate but sufficient for the accent mood system.
 * @param {string} hex
 * @returns {string}
 */
function _desaturate(hex) {
  if (!hex || !hex.startsWith('#')) return hex;
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const avg = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
    const mix = (channel) => Math.round(channel * 0.5 + avg * 0.5);
    const rr = mix(r).toString(16).padStart(2, '0');
    const gg = mix(g).toString(16).padStart(2, '0');
    const bb = mix(b).toString(16).padStart(2, '0');
    return `#${rr}${gg}${bb}`;
  } catch (_) {
    return hex;
  }
}

module.exports = { mergeDesignOverrides, describeOverrides };
