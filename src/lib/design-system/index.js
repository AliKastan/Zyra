'use strict';

/**
 * Design System — Public API
 *
 * Stage 4.5 of the Zyra generation pipeline.
 * Runs after blueprint assembly, before multi-pass generation.
 *
 * Primary entry point: runDesignSystemStage(ctx)
 */

const { selectDesignPreset }          = require('./select-preset');
const { buildDesignSpec,
        mergeDesignSpecIntoBlueprint,
        summarizeDesignSpec }          = require('./build-design-spec');
const { buildDesignTokens,
        tokensToCssVars,
        renderCssRootBlock }           = require('./build-design-tokens');
const { buildComponentRules,
        summarizeComponentRules }      = require('./build-component-rules');
const { mergeDesignOverrides,
        describeOverrides }            = require('./merge-overrides');
const { getPreset, ALL_PRESETS,
        PRESET_NAMES }                 = require('./presets');

// ── Primary stage entry point ───────────────────────────────────────────────

/**
 * Run the full Design System Stage (Stage 4.5).
 *
 * Accepts the same context object used by the orchestrator and returns:
 *   - enrichedBlueprint: blueprint with design tokens + _designSpec attached
 *   - designSpec: the full DesignSpec
 *   - selection: { primary, fallback, scores, reason }
 *   - summary: one-line human-readable description
 *
 * @param {import('./types').DesignSelectionContext} ctx
 * @param {Object} [blueprint] - existing blueprint to enrich (optional)
 * @returns {{ enrichedBlueprint: Object, designSpec: import('./types').DesignSpec, selection: Object, summary: string }}
 */
function runDesignSystemStage(ctx, blueprint) {
  // 1. Select best-fit preset
  const selection = selectDesignPreset(ctx);

  // 2. Build full design spec
  const designSpec = buildDesignSpec(ctx, selection);

  // 3. Enrich blueprint if provided
  const enrichedBlueprint = blueprint
    ? mergeDesignSpecIntoBlueprint(blueprint, designSpec)
    : null;

  // 4. Summarize
  const summary = summarizeDesignSpec(designSpec);

  return { enrichedBlueprint, designSpec, selection, summary };
}

// ── Convenience helpers ─────────────────────────────────────────────────────

/**
 * Quick preset lookup + token generation without a full ctx object.
 * Useful for UI preview and debugging.
 *
 * @param {import('./types').DesignPresetName} presetName
 * @param {{ themeMode?: string, density?: string }} [options]
 * @returns {{ tokens: import('./types').DesignTokenSet, cssVars: Record<string,string>, cssRoot: string, componentRules: import('./types').ComponentStyleRules }}
 */
function getPresetTokens(presetName, options = {}) {
  const { themeMode, density } = options;
  const tokens        = buildDesignTokens(presetName, themeMode, density);
  const cssVars       = tokensToCssVars(tokens);
  const cssRoot       = renderCssRootBlock(tokens);
  const componentRules = buildComponentRules(presetName, density, themeMode);
  return { tokens, cssVars, cssRoot, componentRules };
}

/**
 * List all available preset names with short descriptions.
 *
 * @returns {Array<{ name: string, tone: string, themeMode: string, density: string, designNotes: string }>}
 */
function listPresets() {
  return PRESET_NAMES.map(name => {
    const p = ALL_PRESETS[name];
    return {
      name,
      tone:        p.visualTone,
      themeMode:   p.themeMode,
      density:     p.density,
      designNotes: p.designNotes,
    };
  });
}

/**
 * Produce a full debug summary for a given context — useful for server logs.
 *
 * @param {import('./types').DesignSelectionContext} ctx
 * @returns {string}
 */
function debugDesignSelection(ctx) {
  const { selection, designSpec } = runDesignSystemStage(ctx, null);
  const lines = [
    `Design System Stage 4.5 — Debug`,
    `Selected: ${selection.primary} (fallback: ${selection.fallback})`,
    `Reason:   ${selection.reason}`,
    `Spec:     ${summarizeDesignSpec(designSpec)}`,
    `Overrides: ${describeOverrides(ctx.overrides || {})}`,
    ``,
    `Scores:`,
    ...Object.entries(selection.scores)
      .sort(([, a], [, b]) => b - a)
      .map(([name, score]) => `  ${name.padEnd(24)} ${score}`),
    ``,
    `Component Rules (${selection.primary}):`,
    ...summarizeComponentRules(selection.primary).map(r => `  ${r}`),
  ];
  return lines.join('\n');
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Primary stage entry
  runDesignSystemStage,

  // Preset selection
  selectDesignPreset,

  // Spec building
  buildDesignSpec,
  mergeDesignSpecIntoBlueprint,
  summarizeDesignSpec,

  // Token building
  buildDesignTokens,
  tokensToCssVars,
  renderCssRootBlock,

  // Component rules
  buildComponentRules,
  summarizeComponentRules,

  // Overrides
  mergeDesignOverrides,
  describeOverrides,

  // Preset registry
  getPreset,
  ALL_PRESETS,
  PRESET_NAMES,

  // Convenience helpers
  getPresetTokens,
  listPresets,
  debugDesignSelection,
};
