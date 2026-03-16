'use strict';

/**
 * Platform-Aware Generation — Public API
 *
 * Detects the target platform from a user prompt and configures
 * platform-specific code generation: stack, structure, rules, validation.
 *
 * No LLM calls — purely deterministic planning layer.
 *
 * @example
 * const { buildPlatformConfig } = require('./lib/platform-aware');
 * const config = buildPlatformConfig('Build a mobile fitness app');
 * // config.detection.platform → 'mobile'
 * // config.stack.framework   → 'Expo (React Native)'
 * // config.structure.directories → ['app', 'screens', ...]
 */

const { detectPlatform, detectAllPlatforms, detectPlatformSwitch } = require('./detect-platform');
const { selectStack, listStacksForPlatform, getStack }             = require('./select-platform-stack');
const { getPlatformStructure, getGenerationHints, buildPlatformHintBlock } = require('./platform-structure');
const { getPlatformRules, getIncompatibilityPatterns, checkFilePathCompatibility } = require('./platform-rules');
const { validatePlatformCompatibility, validateFile, isFilesListCompatible }       = require('./platform-validator');
const { PLATFORM_TYPES } = require('./types');

// ── Main entry points ─────────────────────────────────────────────────────────

/**
 * Build the full platform generation config from a user prompt.
 * This is the primary entry point for the generation pipeline.
 *
 * @param {string} prompt
 * @param {Object} [intentMemory]
 * @returns {import('./types').PlatformGenerationConfig}
 */
function buildPlatformConfig(prompt, intentMemory) {
  const detection = detectPlatform(prompt, intentMemory);
  const stack     = selectStack(detection.platform, prompt);
  const structure = getPlatformStructure(detection.platform, stack.variant);
  const rules     = getPlatformRules(detection.platform);

  return {
    detection,
    stack,
    structure,
    rules,
    summary: _buildSummary(detection, stack),
  };
}

/**
 * Build the UI-safe payload for a PlatformGenerationConfig.
 * @param {import('./types').PlatformGenerationConfig} config
 * @returns {Object}
 */
function buildUiPlatformPayload(config) {
  if (!config) return null;
  return {
    platform:          config.detection.platform,
    confidence:        config.detection.confidence,
    isExplicit:        config.detection.isExplicit,
    rationale:         config.detection.rationale,
    framework:         config.stack.framework,
    variant:           config.stack.variant,
    routing:           config.stack.routing,
    backend:           config.stack.backend,
    directories:       config.structure.directories,
    coreFiles:         config.structure.coreFiles,
    dependencies:      config.stack.dependencies,
    devDependencies:   config.stack.devDependencies,
    generationHints:   config.structure.generationHints.slice(0, 5),
    summary:           config.summary,
    secondaryPlatforms: config.detection.secondaryPlatforms,
  };
}

/**
 * One-line summary of a platform config for logging.
 * @param {import('./types').PlatformGenerationConfig} config
 * @returns {string}
 */
function summarizePlatformConfig(config) {
  const { detection, stack } = config;
  return (
    `platform="${detection.platform}" stack="${stack.variant}" ` +
    `confidence="${detection.confidence}" explicit=${detection.isExplicit}`
  );
}

// ── Re-exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Main entry point
  buildPlatformConfig,
  buildUiPlatformPayload,
  summarizePlatformConfig,

  // Detection
  detectPlatform,
  detectAllPlatforms,
  detectPlatformSwitch,

  // Stack selection
  selectStack,
  listStacksForPlatform,
  getStack,

  // Structure
  getPlatformStructure,
  getGenerationHints,
  buildPlatformHintBlock,

  // Rules
  getPlatformRules,
  getIncompatibilityPatterns,
  checkFilePathCompatibility,

  // Validation
  validatePlatformCompatibility,
  validateFile,
  isFilesListCompatible,

  // Constants
  PLATFORM_TYPES,
};

// ── Private ───────────────────────────────────────────────────────────────────

function _buildSummary(detection, stack) {
  const explicit = detection.isExplicit ? 'explicitly' : 'inferred';
  return (
    `${detection.platform.toUpperCase()} (${stack.variant}) — ` +
    `${stack.framework} with ${stack.routing}. ` +
    `Platform ${explicit} detected (${detection.confidence} confidence).`
  );
}
