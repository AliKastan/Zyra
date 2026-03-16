'use strict';

/**
 * UI / Presentation + Design System Section Regenerator
 *
 * Produces a SectionRegenerationSpec for UI/styling changes.
 * Covers: color themes, typography, spacing, component styling, dark/light mode.
 *
 * Does NOT call LLMs. Returns a spec that the caller (edit pipeline) uses
 * to guide targeted generation.
 */

/**
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object} [context]
 * @param {Object.<string,string>} [context.existingFiles]
 * @param {Object} [context.blueprint]
 * @param {string} [context.userPrompt]
 * @returns {import('./types').SectionRegenerationSpec}
 */
function regenerateUiSection(plan, context = {}) {
  const { existingFiles = {}, userPrompt = '' } = context;
  const { changeDetection } = plan;

  // Identify which existing CSS/style files need to be regenerated
  const styleFiles = Object.keys(existingFiles).filter(p =>
    /\.(css|scss|sass|less)$/i.test(p) ||
    /(?:theme|token|style|design).*\.(js|ts|json)$/i.test(p),
  );

  // Identify component files in the primary scope
  const componentFiles = Object.keys(existingFiles).filter(p =>
    /\/(?:components?|ui)\//i.test(p) &&
    /\.(jsx?|tsx?|vue)$/i.test(p),
  );

  const isThemeChange = /dark|light|theme|color|palette/i.test(userPrompt);
  const isLayoutChange = /spacing|layout|grid|responsive/i.test(userPrompt);
  const isTypographyChange = /font|typography|text[_\s-]?size/i.test(userPrompt);

  const filesToCreate = [];
  if (styleFiles.length === 0) {
    filesToCreate.push({ path: 'client/styles/main.css', description: 'Main stylesheet with CSS custom properties' });
    filesToCreate.push({ path: 'client/styles/tokens.css', description: 'Design tokens (colors, spacing, typography)' });
  }

  const generationHints = [
    'Update only CSS custom properties and stylesheet files',
    'Preserve all HTML structure and JavaScript logic',
    'Do not change file names or import paths',
    'Use CSS custom properties (--var-name) for all design tokens',
  ];

  if (isThemeChange)      generationHints.push('Regenerate color palette and theme variables based on requested tone');
  if (isLayoutChange)     generationHints.push('Update spacing scale and layout utilities only');
  if (isTypographyChange) generationHints.push('Update font variables and typography scale only');

  return {
    sectionType:          'ui-presentation',
    filesToCreate,
    filesToPatch:         componentFiles.map(p => ({ path: p, description: 'Update component styling only', operation: 'patch' })),
    envVarsNeeded:        [],
    dependenciesNeeded:   [],
    generationHints,
    validationHints: [
      'Verify CSS custom properties are defined in :root',
      'Check all components reference variables rather than hardcoded values',
      'Verify responsive breakpoints are intact',
    ],
    repairHints: [
      'Re-add missing --color-primary if theme update removed it',
      'Restore responsive media queries if overwritten',
    ],
    placeholderMode:   false,
    authenticityNote:  'UI changes require no backend considerations',
  };
}

module.exports = { regenerateUiSection };
