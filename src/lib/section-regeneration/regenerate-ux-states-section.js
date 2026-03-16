'use strict';

/**
 * UX States Section Regenerator
 *
 * Spec for loading states, error states, empty states, skeleton screens,
 * disabled/configuration-required states.
 *
 * Highly targeted — touches only UX state components, not business logic.
 */

/**
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object} [context]
 * @param {Object.<string,string>} [context.existingFiles]
 * @param {string} [context.userPrompt]
 * @returns {import('./types').SectionRegenerationSpec}
 */
function regenerateUxStatesSection(plan, context = {}) {
  const { existingFiles = {}, userPrompt = '' } = context;

  const needsLoading = /loading|spinner|skeleton/i.test(userPrompt);
  const needsError   = /error[_\s-]?state|error[_\s-]?message|error[_\s-]?bound/i.test(userPrompt);
  const needsEmpty   = /empty[_\s-]?state|no[_\s-]?results?|no[_\s-]?data|zero[_\s-]?state/i.test(userPrompt);

  // Infer from generic "loading states" prompt (apply all three)
  const applyAll = !needsLoading && !needsError && !needsEmpty;

  const existingUxFiles = Object.keys(existingFiles).filter(p =>
    /(?:Loading|Spinner|Skeleton|ErrorState|EmptyState|NoResults|ErrorBoundary)\.(?:jsx?|tsx?)$/i.test(p.split('/').pop()),
  );

  const filesToCreate = [];

  if ((needsLoading || applyAll) && !existingUxFiles.some(p => /loading|spinner|skeleton/i.test(p))) {
    filesToCreate.push({ path: 'client/components/LoadingState.jsx', description: 'Loading spinner / skeleton component' });
    filesToCreate.push({ path: 'client/components/Skeleton.jsx', description: 'Skeleton screen for content placeholders' });
  }
  if ((needsError || applyAll) && !existingUxFiles.some(p => /error/i.test(p))) {
    filesToCreate.push({ path: 'client/components/ErrorState.jsx', description: 'Error state component with retry action' });
    filesToCreate.push({ path: 'client/components/ErrorBoundary.jsx', description: 'React error boundary wrapper' });
  }
  if ((needsEmpty || applyAll) && !existingUxFiles.some(p => /empty|noresult/i.test(p))) {
    filesToCreate.push({ path: 'client/components/EmptyState.jsx', description: 'Empty/zero-results state with CTA' });
  }

  const filesToPatch = existingUxFiles.map(p => ({
    path: p,
    description: 'Improve UX state component',
    operation: 'replace',
  }));

  const generationHints = [
    'UX state components should be reusable — accept props for message and action',
    'Loading state should show a spinner or skeleton matching the content type',
    'Error state should show a clear message and optional retry/reload action',
    'Empty state should explain what is missing and suggest next action',
    'Do not touch business logic — only add/update UX state components',
    'Use CSS custom properties for colors — do not hardcode values',
  ];

  if (needsLoading) generationHints.push('Skeleton screens should match the shape of the content they replace');
  if (needsError)   generationHints.push('Error boundary should catch and display friendly error instead of crashing');
  if (needsEmpty)   generationHints.push('Empty state should include an icon, message, and CTA button');

  return {
    sectionType:        'ux-states',
    filesToCreate,
    filesToPatch,
    envVarsNeeded:      [],
    dependenciesNeeded: [],
    generationHints,
    validationHints: [
      'Verify loading states are shown while async data loads',
      'Verify error states are rendered when API calls fail',
      'Verify empty states are shown when data arrays are empty',
      'Check components accept className or style props for flexibility',
    ],
    repairHints: [
      'Add conditional render for loading state if async data has no loading guard',
      'Wrap async data fetch with try/catch and render ErrorState on failure',
      'Check if EmptyState is rendered when data.length === 0',
    ],
    placeholderMode:  false,
    authenticityNote: 'UX state changes do not affect backend authenticity',
  };
}

module.exports = { regenerateUxStatesSection };
