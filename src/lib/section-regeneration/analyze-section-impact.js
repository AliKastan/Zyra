'use strict';

/**
 * Section Impact Analysis
 *
 * Given a ChangeDetection result and optional project context,
 * determines exactly which sections are affected, which must be preserved,
 * and whether full regeneration is required.
 *
 * The impact map is deterministic. It requires no LLM calls.
 */

const ALL_SECTIONS = [
  'ui-presentation', 'routes-pages', 'auth', 'database',
  'backend-api', 'billing', 'integrations', 'admin',
  'mobile-shell', 'deployment', 'ux-states', 'design-system',
];

// ── Impact map: changeType → SectionImpactDefinition ─────────────────────────
// primary:   sections that need regeneration
// secondary: sections that may need patching
// preserve:  sections that MUST NOT be touched
// validationRequired: sections to validate after regen
// repairRequired:     sections to repair if broken after regen

const IMPACT_MAP = {
  restyle_ui: {
    primary:             ['design-system', 'ui-presentation'],
    secondary:           ['routes-pages'],
    preserve:            ['auth', 'backend-api', 'database', 'billing', 'integrations', 'admin', 'deployment', 'mobile-shell'],
    riskLevel:           'low',
    fullRegenRequired:   false,
    validationRequired:  ['ui-presentation', 'design-system'],
    repairRequired:      ['ui-presentation'],
  },

  change_billing: {
    primary:             ['billing', 'integrations', 'deployment'],
    secondary:           ['auth', 'backend-api', 'routes-pages'],
    preserve:            ['database', 'admin', 'ui-presentation', 'design-system', 'mobile-shell', 'ux-states'],
    riskLevel:           'medium',
    fullRegenRequired:   false,
    validationRequired:  ['billing', 'backend-api', 'deployment'],
    repairRequired:      ['billing', 'backend-api'],
  },

  add_integration: {
    primary:             ['integrations', 'deployment'],
    secondary:           ['backend-api', 'routes-pages'],
    preserve:            ['auth', 'database', 'billing', 'admin', 'ui-presentation', 'design-system', 'mobile-shell', 'ux-states'],
    riskLevel:           'low',
    fullRegenRequired:   false,
    validationRequired:  ['integrations', 'deployment'],
    repairRequired:      ['integrations'],
  },

  improve_admin_tools: {
    primary:             ['admin', 'routes-pages', 'auth'],
    secondary:           ['backend-api', 'ui-presentation'],
    preserve:            ['billing', 'database', 'integrations', 'deployment', 'design-system', 'mobile-shell', 'ux-states'],
    riskLevel:           'medium',
    fullRegenRequired:   false,
    validationRequired:  ['admin', 'auth', 'backend-api'],
    repairRequired:      ['admin', 'auth'],
  },

  improve_deployment: {
    primary:             ['deployment'],
    secondary:           [],
    preserve:            ['ui-presentation', 'design-system', 'auth', 'backend-api', 'database', 'billing', 'integrations', 'admin', 'routes-pages', 'mobile-shell', 'ux-states'],
    riskLevel:           'low',
    fullRegenRequired:   false,
    validationRequired:  ['deployment'],
    repairRequired:      ['deployment'],
  },

  change_navigation: {
    primary:             ['mobile-shell', 'routes-pages'],
    secondary:           ['ui-presentation'],
    preserve:            ['backend-api', 'auth', 'database', 'billing', 'integrations', 'admin', 'deployment', 'design-system', 'ux-states'],
    riskLevel:           'low',
    fullRegenRequired:   false,
    validationRequired:  ['mobile-shell', 'routes-pages'],
    repairRequired:      ['mobile-shell'],
  },

  change_platform: {
    primary:             ALL_SECTIONS.slice(),  // everything changes
    secondary:           [],
    preserve:            [],
    riskLevel:           'critical',
    fullRegenRequired:   true,
    validationRequired:  ALL_SECTIONS.slice(),
    repairRequired:      ALL_SECTIONS.slice(),
  },

  fix_ux_states: {
    primary:             ['ux-states', 'ui-presentation'],
    secondary:           ['routes-pages'],
    preserve:            ['backend-api', 'auth', 'database', 'billing', 'integrations', 'admin', 'deployment', 'design-system', 'mobile-shell'],
    riskLevel:           'low',
    fullRegenRequired:   false,
    validationRequired:  ['ux-states', 'ui-presentation'],
    repairRequired:      ['ux-states'],
  },

  change_auth_behavior: {
    primary:             ['auth'],
    secondary:           ['backend-api', 'routes-pages', 'admin'],
    preserve:            ['billing', 'database', 'integrations', 'deployment', 'ui-presentation', 'design-system', 'mobile-shell', 'ux-states'],
    riskLevel:           'high',
    fullRegenRequired:   false,
    validationRequired:  ['auth', 'backend-api', 'routes-pages'],
    repairRequired:      ['auth', 'backend-api'],
  },

  change_database: {
    primary:             ['database', 'backend-api'],
    secondary:           ['auth', 'admin'],
    preserve:            ['ui-presentation', 'design-system', 'billing', 'integrations', 'deployment', 'routes-pages', 'mobile-shell', 'ux-states'],
    riskLevel:           'high',
    fullRegenRequired:   false,
    validationRequired:  ['database', 'backend-api', 'auth'],
    repairRequired:      ['database', 'backend-api'],
  },

  add_feature: {
    primary:             ['routes-pages', 'backend-api'],
    secondary:           ['auth', 'database', 'ui-presentation'],
    preserve:            ['billing', 'integrations', 'admin', 'deployment', 'design-system', 'mobile-shell', 'ux-states'],
    riskLevel:           'medium',
    fullRegenRequired:   false,
    validationRequired:  ['routes-pages', 'backend-api'],
    repairRequired:      ['backend-api'],
  },

  modify_feature: {
    primary:             ['routes-pages', 'ui-presentation'],
    secondary:           ['backend-api', 'database'],
    preserve:            ['billing', 'integrations', 'admin', 'deployment', 'design-system', 'mobile-shell', 'ux-states', 'auth'],
    riskLevel:           'low',
    fullRegenRequired:   false,
    validationRequired:  ['routes-pages', 'ui-presentation'],
    repairRequired:      [],
  },

  remove_feature: {
    primary:             ['routes-pages', 'backend-api'],
    secondary:           ['auth', 'billing', 'integrations'],
    preserve:            ['design-system', 'deployment', 'database', 'admin', 'mobile-shell', 'ux-states'],
    riskLevel:           'medium',
    fullRegenRequired:   false,
    validationRequired:  ['routes-pages', 'backend-api'],
    repairRequired:      [],
  },

  targeted_repair: {
    primary:             [],   // Determined dynamically from targetSections
    secondary:           [],
    preserve:            [],   // Computed: everything outside primary
    riskLevel:           'low',
    fullRegenRequired:   false,
    validationRequired:  [],
    repairRequired:      [],
  },

  fix_bug: {
    primary:             [],   // Determined dynamically
    secondary:           [],
    preserve:            [],
    riskLevel:           'low',
    fullRegenRequired:   false,
    validationRequired:  [],
    repairRequired:      [],
  },
};

// Threshold: if > 60% of sections are in primary+secondary, flag as high-impact
const HIGH_IMPACT_THRESHOLD = 0.6;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyze which sections are affected by a detected change.
 *
 * @param {import('./types').ChangeDetection} changeDetection
 * @param {Object} [projectContext]
 * @param {string[]} [projectContext.existingSections]    - Sections present in this project
 * @param {string}   [projectContext.stack]               - Tech stack description
 * @param {Object}   [projectContext.intentMemory]        - Current intent memory
 * @returns {import('./types').SectionImpactAnalysis}
 */
function analyzeSectionImpact(changeDetection, projectContext = {}) {
  const { changeType, targetSections = [], isFullRegenRequired: promptFullRegen = false } = changeDetection;
  const { existingSections = ALL_SECTIONS } = projectContext;

  // Check for explicit full-regen signals
  if (promptFullRegen || changeType === 'change_platform') {
    return _fullRegenResult('Platform or architectural change requires full regeneration');
  }

  // Look up impact definition
  let impact = IMPACT_MAP[changeType];
  if (!impact) {
    impact = IMPACT_MAP.modify_feature; // safe default
  }

  // For dynamic types (targeted_repair, fix_bug), use targetSections as primary
  let primary   = impact.primary.slice();
  let secondary = impact.secondary.slice();

  if ((changeType === 'targeted_repair' || changeType === 'fix_bug') && targetSections.length > 0) {
    primary   = targetSections.filter(s => ALL_SECTIONS.includes(s));
    secondary = [];
  }

  // Refine: if targetSections adds specificity, intersect with primary
  if (targetSections.length > 0 && primary.length > 0) {
    const specificPrimary = primary.filter(s => targetSections.includes(s));
    if (specificPrimary.length > 0) {
      // The prompt narrows scope — only regenerate the intersection
      primary = specificPrimary;
    }
  }

  // Only include sections that exist in the project
  const relevantExisting = new Set(existingSections);
  const filteredPrimary   = primary.filter(s => relevantExisting.has(s));
  const filteredSecondary = secondary.filter(s => relevantExisting.has(s) && !filteredPrimary.includes(s));

  // Compute preserve: everything NOT in primary or secondary
  const touchedSet  = new Set([...filteredPrimary, ...filteredSecondary]);
  const preserve    = existingSections.filter(s => !touchedSet.has(s));

  // Impact score: fraction of all sections affected
  const impactScore = Math.round((touchedSet.size / Math.max(existingSections.length, 1)) * 100);

  // Check if impact is so broad that full regen is better
  const breadthRatio = touchedSet.size / Math.max(existingSections.length, 1);
  if (breadthRatio > HIGH_IMPACT_THRESHOLD && !impact.fullRegenRequired) {
    // High impact but not explicitly full-regen — flag as manual review
    return {
      primarySections:         filteredPrimary,
      secondarySections:       filteredSecondary,
      preserveSections:        preserve,
      riskLevel:               'critical',
      fullRegenerationRequired: true,
      fullRegenerationReason:  `Change affects ${Math.round(breadthRatio * 100)}% of project sections — full regeneration recommended`,
      impactScore,
      validationRequired:      impact.validationRequired.filter(s => relevantExisting.has(s)),
      repairRequired:          impact.repairRequired.filter(s => relevantExisting.has(s)),
    };
  }

  return {
    primarySections:          filteredPrimary,
    secondarySections:        filteredSecondary,
    preserveSections:         preserve,
    riskLevel:                impact.riskLevel,
    fullRegenerationRequired: impact.fullRegenRequired,
    fullRegenerationReason:   impact.fullRegenRequired ? 'Architecture change detected' : '',
    impactScore,
    validationRequired:       impact.validationRequired.filter(s => relevantExisting.has(s)),
    repairRequired:           impact.repairRequired.filter(s => relevantExisting.has(s)),
  };
}

/**
 * Get the impact definition for a change type.
 * @param {string} changeType
 * @returns {Object}
 */
function getImpactDefinition(changeType) {
  return IMPACT_MAP[changeType] || IMPACT_MAP.modify_feature;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _fullRegenResult(reason) {
  return {
    primarySections:          ALL_SECTIONS.slice(),
    secondarySections:        [],
    preserveSections:         [],
    riskLevel:                'critical',
    fullRegenerationRequired: true,
    fullRegenerationReason:   reason,
    impactScore:              100,
    validationRequired:       ALL_SECTIONS.slice(),
    repairRequired:           ALL_SECTIONS.slice(),
  };
}

module.exports = {
  analyzeSectionImpact,
  getImpactDefinition,
  ALL_SECTIONS,
  IMPACT_MAP,
};
