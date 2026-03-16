'use strict';

/**
 * Build Design Tokens
 *
 * Converts a DesignPresetDefinition into:
 *   1. A blueprint-compatible DesignTokenSet (blueprint.designSystem format)
 *   2. A CSS custom property map for `:root` injection
 *
 * The DesignTokenSet is directly compatible with the existing blueprint.designSystem
 * schema consumed by the scaffold and CSS generation passes.
 */

const { getPreset } = require('./presets');

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build the full token set from a preset.
 *
 * @param {import('./types').DesignPresetName} presetName
 * @param {import('./types').ThemeMode} [themeMode]
 * @param {import('./types').DensityMode} [density]
 * @param {Partial<import('./types').ColorTokens>} [colorOverrides]
 * @returns {import('./types').DesignTokenSet}
 */
function buildDesignTokens(presetName, themeMode, density, colorOverrides) {
  const preset = getPreset(presetName);

  const colors    = _resolveColors(preset, themeMode, colorOverrides);
  const typography = _resolveTypography(preset);
  const spacing   = _resolveSpacing(preset, density);
  const borderRadius = preset.borderRadius;
  const shadows   = _resolveShadows(preset, themeMode);
  const transitions = preset.transitions;

  return {
    colors,
    typography,
    spacing,
    borderRadius,
    shadows,
    transitions,
  };
}

/**
 * Convert a DesignTokenSet into a flat CSS custom property map.
 * Suitable for injecting as :root { ... } variables.
 *
 * @param {import('./types').DesignTokenSet} tokens
 * @returns {Record<string, string>}
 */
function tokensToCssVars(tokens) {
  const vars = {};

  // Colors
  for (const [key, value] of Object.entries(tokens.colors)) {
    vars[`--color-${_kebab(key)}`] = value;
  }

  // Typography
  vars['--font-family'] = tokens.typography.fontFamily;
  if (tokens.typography.monoFamily) vars['--font-mono'] = tokens.typography.monoFamily;
  for (const [scale, value] of Object.entries(tokens.typography.scaleRem)) {
    vars[`--text-${scale}`] = value;
  }
  for (const [weight, value] of Object.entries(tokens.typography.weights)) {
    vars[`--font-${weight}`] = String(value);
  }
  for (const [lh, value] of Object.entries(tokens.typography.lineHeights)) {
    vars[`--leading-${lh}`] = String(value);
  }

  // Spacing
  for (const [scale, value] of Object.entries(tokens.spacing)) {
    vars[`--space-${scale}`] = value;
  }

  // Border radius
  for (const [key, value] of Object.entries(tokens.borderRadius)) {
    vars[`--radius-${key}`] = value;
  }

  // Shadows
  for (const [key, value] of Object.entries(tokens.shadows)) {
    vars[`--shadow-${key}`] = value;
  }

  // Transitions
  vars['--transition'] = tokens.transitions;

  return vars;
}

/**
 * Render a CSS :root block string from a DesignTokenSet.
 *
 * @param {import('./types').DesignTokenSet} tokens
 * @returns {string}
 */
function renderCssRootBlock(tokens) {
  const vars = tokensToCssVars(tokens);
  const lines = [':root {'];
  for (const [prop, value] of Object.entries(vars)) {
    lines.push(`  ${prop}: ${value};`);
  }
  lines.push('}');
  return lines.join('\n');
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _resolveColors(preset, themeMode, overrides) {
  let colors = { ...preset.colors };

  // Dark mode adaptation for light presets
  if (themeMode === 'dark' && preset.themeMode !== 'dark') {
    colors = _lightToDark(colors, preset.name);
  }

  // Apply user color overrides
  if (overrides) {
    Object.assign(colors, overrides);
  }

  return colors;
}

/**
 * Convert a light-mode color set to a dark-mode color set.
 * Used when themeMode override is 'dark' for a light preset.
 */
function _lightToDark(colors, presetName) {
  return {
    ...colors,
    background:   '#111827',
    surface:      '#1F2937',
    surfaceHover: '#374151',
    text:         '#F9FAFB',
    textMuted:    '#9CA3AF',
    textOnPrimary: '#FFFFFF',
    border:       '#374151',
  };
}

function _resolveTypography(preset) {
  const base = preset.typography;
  // Fill any missing scale values with defaults
  const defaults = { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem', '5xl': '3rem' };
  return {
    ...base,
    scaleRem: { ...defaults, ...(base.scaleRem || {}) },
  };
}

function _resolveSpacing(preset, density) {
  const base = preset.spacing;

  if (density === 'compact') {
    return {
      xs:  '2px',
      sm:  '4px',
      md:  '10px',
      lg:  '16px',
      xl:  '28px',
      '2xl': '48px',
      '3xl': '64px',
    };
  }

  if (density === 'spacious') {
    return {
      xs:  '4px',
      sm:  '10px',
      md:  '20px',
      lg:  '36px',
      xl:  '56px',
      '2xl': '80px',
      '3xl': '120px',
    };
  }

  return base;
}

function _resolveShadows(preset, themeMode) {
  const base = preset.shadows;

  if (themeMode === 'dark' || preset.themeMode === 'dark') {
    // Stronger shadows for dark backgrounds
    return {
      sm:   '0 2px 8px rgba(0,0,0,0.40)',
      md:   '0 4px 20px rgba(0,0,0,0.50)',
      lg:   '0 12px 40px rgba(0,0,0,0.60)',
      glow: base.glow || `0 0 30px rgba(${_hexToRgb(preset.colors.primary)},0.15)`,
    };
  }

  return base;
}

function _kebab(str) {
  return str.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`);
}

function _hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

module.exports = { buildDesignTokens, tokensToCssVars, renderCssRootBlock };
