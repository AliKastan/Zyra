'use strict';

/**
 * Build Component Style Rules
 *
 * Returns a ComponentStyleRules object from a preset, optionally adjusted
 * for density and theme mode. These rules instruct generation passes on
 * how common components should look in the generated app.
 */

const { getPreset } = require('./presets');

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * @param {import('./types').DesignPresetName} presetName
 * @param {import('./types').DensityMode} [density]
 * @param {import('./types').ThemeMode} [themeMode]
 * @returns {import('./types').ComponentStyleRules}
 */
function buildComponentRules(presetName, density, themeMode) {
  const preset = getPreset(presetName);
  const base   = preset.componentRules;

  // Adjust for density
  if (density === 'compact') {
    return _compactify(base);
  }
  if (density === 'spacious') {
    return _spacify(base);
  }

  return { ...base };
}

/**
 * Produce a human-readable summary of how components will look.
 * Useful for debug UI and selection explanation.
 *
 * @param {import('./types').DesignPresetName} presetName
 * @returns {string[]}
 */
function summarizeComponentRules(presetName) {
  const preset = getPreset(presetName);
  const r      = preset.componentRules;
  const tok    = preset.borderRadius;

  return [
    `Buttons: ${r.buttons.primaryStyle} style, ${r.buttons.primaryRadius} radius, weight ${r.buttons.primaryWeight}`,
    `Cards: ${r.cards.radius} radius, ${r.cards.padding} padding, shadow=${r.cards.shadow}, border=${r.cards.hasBorder}`,
    `Inputs: ${r.inputs.borderStyle} border, ${r.inputs.focusStyle} focus style`,
    `Navigation: ${r.nav.type}${r.nav.width ? ` (${r.nav.width})` : ''}, active: ${r.nav.activeStyle}`,
    `Tables: compact=${r.tables?.compact || false}, sticky header=${r.tables?.stickyHeader || false}`,
  ];
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _compactify(rules) {
  return {
    ...rules,
    buttons: { ...rules.buttons, primaryPadding: '7px 14px' },
    cards:   { ...rules.cards,   padding: '14px' },
    inputs:  { ...rules.inputs,  padding: '7px 10px' },
    tables:  { ...rules.tables,  compact: true },
  };
}

function _spacify(rules) {
  return {
    ...rules,
    buttons: { ...rules.buttons, primaryPadding: '16px 36px' },
    cards:   { ...rules.cards,   padding: '36px' },
    inputs:  { ...rules.inputs,  padding: '14px 18px' },
    tables:  { ...rules.tables,  compact: false },
  };
}

module.exports = { buildComponentRules, summarizeComponentRules };
