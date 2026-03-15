'use strict';

const { callClaude, SONNET_MODEL } = require('../../providers/anthropicProvider');
const { buildBlueprintPrompt }      = require('../prompts/blueprint');
const { safeJsonParse }             = require('../../utils/safeJsonParse');
const { slugify }                   = require('../../utils/slugify');
const logger                        = require('../../utils/logger');

const DEFAULT_DESIGN_SYSTEM = {
  colors: {
    primary:       '#4F46E5',
    primaryHover:  '#4338CA',
    secondary:     '#0EA5E9',
    background:    '#F8FAFC',
    surface:       '#FFFFFF',
    surfaceHover:  '#F1F5F9',
    text:          '#1E293B',
    textMuted:     '#64748B',
    textOnPrimary: '#FFFFFF',
    border:        '#E2E8F0',
    error:         '#EF4444',
    success:       '#22C55E',
    warning:       '#F59E0B',
  },
  typography: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    scaleRem:   { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem' },
    weights:    { normal: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeights: { tight: 1.25, normal: 1.5, relaxed: 1.75 },
  },
  spacing:      { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '40px', '2xl': '64px', '3xl': '96px' },
  borderRadius: { sm: '4px', md: '8px', lg: '16px', full: '9999px' },
  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.08)',
    md: '0 4px 12px rgba(0,0,0,0.10)',
    lg: '0 8px 24px rgba(0,0,0,0.14)',
  },
  transitions: 'all 0.15s ease',
};

/**
 * @param {import('../types').GenerationIntent} intent
 * @param {import('../types').ProductPlan} product
 * @param {import('../types').StackPlan} stack
 * @returns {import('../types').AppBlueprint}
 */
function _defaultBlueprint(intent, product, stack) {
  const projectName = slugify(product.appName || 'my-app') || 'my-app';
  return {
    projectName,
    designSystem: DEFAULT_DESIGN_SYSTEM,
    cssComponents: [],
    fileList:  stack.files,
    fileSpecs: stack.files.map(f => ({
      path:          f,
      description:   `${f} — part of ${product.displayName || product.appName}`,
      htmlStructure: f.endsWith('.html') ? 'Standard page structure' : undefined,
      sections:      [],
      jsFunctions:   [],
    })),
    dataFlow: {
      description:   product.summary || 'Client-side app with localStorage persistence',
      storageSchema: (product.dataModels || []).map(m => ({
        key:       m.storageKey || `app_${m.name.toLowerCase()}`,
        type:      'Array',
        structure: `Array of ${m.name} objects`,
      })),
      initialData:   'Empty arrays on first load',
      updatePattern: 'Full re-render after each data change',
    },
    navigation:                product.navigation || { type: 'none', links: [] },
    accessibilityRequirements: ['All inputs have labels', 'Focus indicators visible', 'Color contrast ≥ 4.5:1'],
    responsiveBreakpoints: {
      mobile:  '< 640px — single column, stacked navigation',
      tablet:  '640px–1024px — two columns where appropriate',
      desktop: '> 1024px — full layout',
    },
    designNotes: `Clean, ${intent.tone || 'professional'} design. Consistent spacing and typography.`,
  };
}

/**
 * Stage 4 — Implementation Blueprint.
 *
 * Uses Sonnet with a large token budget to produce the definitive build contract:
 * a complete design system, every CSS component class, every JS function signature,
 * and a per-file structural spec with exact HTML elements and class names.
 *
 * Token budget: 4000 — this is the most important planning document in the pipeline.
 * The code generator reads nothing except this blueprint. Ambiguity here = broken code.
 *
 * @param {import('../types').GenerationIntent} intent
 * @param {import('../types').ProductPlan} product
 * @param {import('../types').StackPlan} stack
 * @param {object} cost - cost tracker instance
 * @returns {Promise<import('../types').AppBlueprint>}
 */
async function generateBlueprint(intent, product, stack, cost) {
  const { system, user } = buildBlueprintPrompt(intent, product, stack);

  try {
    const raw = await callClaude(system, user, { model: SONNET_MODEL, maxTokens: 4000 });

    if (cost) cost.record('blueprint', system, user, raw, { model: SONNET_MODEL });

    const { success, data: parsed } = safeJsonParse(raw);
    if (!success || !parsed || !Array.isArray(parsed.fileList) || parsed.fileList.length === 0) {
      logger.warn('blueprintGenerator: invalid JSON shape, using fallback');
      return _defaultBlueprint(intent, product, stack);
    }

    const projectName = slugify(parsed.projectName || product.appName || 'my-app') || 'my-app';

    // fileList: prefer blueprint's list, fall back to stack
    const fileList = parsed.fileList.length > 0 ? parsed.fileList : stack.files;

    // fileSpecs: ensure every file has a spec
    const specsByPath = new Map((parsed.fileSpecs || []).map(s => [s.path, s]));
    const fileSpecs   = fileList.map(path => specsByPath.get(path) || {
      path,
      description:   `${path} — part of ${projectName}`,
      htmlStructure: path.endsWith('.html') ? 'Standard page structure' : undefined,
      sections:      [],
      jsFunctions:   [],
    });

    // Design system: prefer blueprint's, deep-merge missing keys from default
    const ds = parsed.designSystem || {};
    const designSystem = {
      colors:        { ...DEFAULT_DESIGN_SYSTEM.colors,        ...(ds.colors        || {}) },
      typography:    { ...DEFAULT_DESIGN_SYSTEM.typography,    ...(ds.typography    || {}) },
      spacing:       { ...DEFAULT_DESIGN_SYSTEM.spacing,       ...(ds.spacing       || {}) },
      borderRadius:  { ...DEFAULT_DESIGN_SYSTEM.borderRadius,  ...(ds.borderRadius  || {}) },
      shadows:       { ...DEFAULT_DESIGN_SYSTEM.shadows,       ...(ds.shadows       || {}) },
      transitions:   ds.transitions || DEFAULT_DESIGN_SYSTEM.transitions,
    };

    const blueprint = {
      projectName,
      designSystem,
      cssComponents:             Array.isArray(parsed.cssComponents)             ? parsed.cssComponents             : [],
      fileList,
      fileSpecs,
      dataFlow:                  parsed.dataFlow                  || _defaultBlueprint(intent, product, stack).dataFlow,
      navigation:                parsed.navigation                || product.navigation || { type: 'none', links: [] },
      accessibilityRequirements: parsed.accessibilityRequirements || _defaultBlueprint(intent, product, stack).accessibilityRequirements,
      responsiveBreakpoints:     parsed.responsiveBreakpoints     || _defaultBlueprint(intent, product, stack).responsiveBreakpoints,
      designNotes:               parsed.designNotes               || _defaultBlueprint(intent, product, stack).designNotes,
    };

    logger.info(`blueprintGenerator: projectName="${projectName}" files=${fileList.length} cssComponents=${blueprint.cssComponents.length}`);

    return blueprint;
  } catch (err) {
    logger.warn(`blueprintGenerator: failed (${err.message}), using fallback`);
    return _defaultBlueprint(intent, product, stack);
  }
}

module.exports = { generateBlueprint };
