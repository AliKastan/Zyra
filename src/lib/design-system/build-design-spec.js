'use strict';

/**
 * Build Design Spec
 *
 * Assembles the complete DesignSpec from a selection result and context.
 * This is the primary output of Stage 4.5 — consumed by both the orchestrator
 * (to enrich the blueprint) and the generation passes (via blueprint._designSpec).
 */

const { getPreset }           = require('./presets');
const { buildDesignTokens }   = require('./build-design-tokens');
const { buildComponentRules } = require('./build-component-rules');
const { mergeDesignOverrides } = require('./merge-overrides');

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build the full DesignSpec for the selected preset.
 *
 * @param {import('./types').DesignSelectionContext} ctx
 * @param {{ primary: import('./types').DesignPresetName, fallback: import('./types').DesignPresetName, reason: string }} selection
 * @returns {import('./types').DesignSpec}
 */
function buildDesignSpec(ctx, selection) {
  const overrides = ctx.overrides || {};
  const preset    = getPreset(selection.primary);

  // Resolve theme mode and density (overrides win)
  const themeMode = overrides.themeMode || preset.themeMode;
  const density   = overrides.density   || preset.density;
  const visualTone = overrides.visualTone || preset.visualTone;

  // Build tokens (blueprint-compatible)
  const tokens = buildDesignTokens(
    selection.primary,
    themeMode,
    density,
    overrides.colors,
  );

  // Build component rules
  const componentRules = buildComponentRules(selection.primary, density, themeMode);

  // Build the spec
  /** @type {import('./types').DesignSpec} */
  const spec = {
    preset:          selection.primary,
    fallbackPreset:  selection.fallback,
    selectionReason: selection.reason,
    visualTone,
    density,
    themeMode,
    overrideApplied: Object.keys(overrides).length > 0,

    tokens,
    layout:          { ...preset.layout },
    componentRules,
    mobileRules:     { ...preset.mobileRules },
    webRules:        { ...preset.webRules },
    designNotes:     [preset.designNotes],
    generationHints: [...preset.generationHints],
  };

  // Apply any remaining overrides (accent mood, etc.)
  return mergeDesignOverrides(spec, overrides);
}

/**
 * Merge a DesignSpec into an existing blueprint.designSystem.
 * Returns the enriched blueprint — the original blueprint is not mutated.
 *
 * @param {Object} blueprint  - AppBlueprint from Stage 4
 * @param {import('./types').DesignSpec} designSpec
 * @returns {Object}
 */
function mergeDesignSpecIntoBlueprint(blueprint, designSpec) {
  const enrichedBlueprint = { ...blueprint };

  // Replace the blueprint's design system with design spec tokens
  // (preset tokens always win — they are more intentional than blueprint defaults)
  enrichedBlueprint.designSystem = {
    ...blueprint.designSystem,
    ...designSpec.tokens,
  };

  // Attach full design spec for generation passes to consume
  enrichedBlueprint._designSpec = designSpec;

  // Append generation hints to designNotes (consumed by prompt builders)
  const existingNotes = typeof blueprint.designNotes === 'string'
    ? blueprint.designNotes
    : (blueprint.designNotes || '');

  const hintBlock = [
    `\n\n--- DESIGN SYSTEM: ${designSpec.preset} (${designSpec.visualTone}) ---`,
    `Theme: ${designSpec.themeMode} | Density: ${designSpec.density}`,
    ...designSpec.generationHints,
  ].join('\n');

  enrichedBlueprint.designNotes = existingNotes + hintBlock;

  return enrichedBlueprint;
}

/**
 * One-line summary for server logs and UI display.
 *
 * @param {import('./types').DesignSpec} spec
 * @returns {string}
 */
function summarizeDesignSpec(spec) {
  return [
    `preset="${spec.preset}"`,
    `tone="${spec.visualTone}"`,
    `theme="${spec.themeMode}"`,
    `density="${spec.density}"`,
    `overrides=${spec.overrideApplied}`,
    `hints=${spec.generationHints.length}`,
    `fallback="${spec.fallbackPreset}"`,
  ].join(' ');
}

module.exports = { buildDesignSpec, mergeDesignSpecIntoBlueprint, summarizeDesignSpec };
