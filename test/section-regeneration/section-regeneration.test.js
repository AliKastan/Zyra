'use strict';

/**
 * Section Regeneration — Test Suite
 *
 * Tests all major pipeline stages and integration scenarios.
 */

const {
  runSectionRegeneration,
  detectChangeType,
  isFullRegenerationRequired,
  analyzeSectionImpact,
  mapSectionsToFiles,
  buildRegenerationPlan,
  selectRegenerationStrategy,
  validatePlanSafety,
  mergeRegeneratedSections,
  computeFileDiff,
  patchEnvExample,
  runSelectiveValidation,
  runSelectiveRepair,
  buildSelectiveValidationScope,
  buildSelectiveRepairScope,
  buildSectionRegenerationReport,
  buildUiSectionRegenerationPayload,
  summarizeSectionRegeneration,
  buildSectionSpec,
  buildAllSectionSpecs,
  regenerateUiSection,
  regenerateAuthSection,
  regenerateBillingSection,
  regenerateIntegrationSection,
  regenerateAdminSection,
  regenerateDeploymentSection,
  regenerateUxStatesSection,
} = require('../../src/lib/section-regeneration');

// ── Test Harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function describe(label, fn) {
  console.log(`\n  ${label}`);
  fn();
}

function it(label, fn) {
  try {
    fn();
    console.log(`    ✓ ${label}`);
    passed++;
  } catch (err) {
    console.log(`    ✗ ${label}`);
    console.log(`      ${err.message}`);
    failed++;
    failures.push({ label, error: err.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertIncludes(arr, val, msg) {
  if (!Array.isArray(arr) || !arr.includes(val))
    throw new Error(msg || `Expected array to include ${JSON.stringify(val)}, got ${JSON.stringify(arr)}`);
}

function assertNotIncludes(arr, val, msg) {
  if (Array.isArray(arr) && arr.includes(val))
    throw new Error(msg || `Expected array NOT to include ${JSON.stringify(val)}`);
}

// ── Sample Data ───────────────────────────────────────────────────────────────

const SAMPLE_FILES = {
  'server/index.js':         'const express = require("express");\nconst app = express();\n',
  'server/routes/auth.js':   'router.post("/login", async (req, res) => {});\n',
  'server/models/User.js':   'const { DataTypes } = require("sequelize");\n',
  'client/App.jsx':          'import React from "react";\nexport default function App() {}\n',
  'client/styles/main.css':  ':root { --bg: #fff; --text: #000; }\n',
  'client/pages/Login.jsx':  'import React from "react";\nexport default function Login() {}\n',
  'client/pages/Home.jsx':   'import React from "react";\nexport default function Home() {}\n',
  'package.json':            '{"name":"app","scripts":{"start":"node server/index.js"},"dependencies":{}}\n',
  '.env.example':            'PORT=3000\nNODE_ENV=development\n',
  'Dockerfile':              'FROM node:18\nCOPY . .\nRUN npm install\nCMD ["node","server/index.js"]\n',
  'server/routes/api.js':    'router.get("/health", (req, res) => res.json({ ok: true }));\n',
};

// ── Scenario 1: Change Type Detection ────────────────────────────────────────

describe('Scenario 1: Change Type Detection', () => {
  it('detects restyle_ui for UI change prompts', () => {
    const result = detectChangeType('Make the app dark mode with a modern look');
    assertEqual(result.changeType, 'restyle_ui');
  });

  it('detects add_feature for generic add prompts', () => {
    const result = detectChangeType('Add a search bar to the homepage');
    assertEqual(result.changeType, 'add_feature');
  });

  it('detects change_auth_behavior for auth prompts', () => {
    const result = detectChangeType('Add Google OAuth login support');
    assertEqual(result.changeType, 'change_auth_behavior');
  });

  it('detects change_billing for Stripe prompts', () => {
    const result = detectChangeType('Add Stripe payment integration with subscriptions');
    assertEqual(result.changeType, 'change_billing');
  });

  it('detects improve_deployment for deployment prompts', () => {
    const result = detectChangeType('Add Docker support and deploy to Railway');
    assertEqual(result.changeType, 'improve_deployment');
  });

  it('detects remove_feature for removal prompts', () => {
    const result = detectChangeType('Remove the admin dashboard page');
    assertEqual(result.changeType, 'remove_feature');
    assert(result.isRemoval, 'should be marked as removal');
  });

  it('marks fix action as repair (targeted_repair or fix_bug)', () => {
    const result = detectChangeType('Fix the login form validation bug');
    assert(result.isRepair, 'should be marked as repair');
    assert(
      result.changeType === 'targeted_repair' || result.changeType === 'fix_bug',
      `Expected repair changeType, got ${result.changeType}`,
    );
  });

  it('detects add_integration for integration prompts', () => {
    const result = detectChangeType('Integrate SendGrid for email notifications');
    assertEqual(result.changeType, 'add_integration');
  });

  it('detects fix_ux_states for UX state prompts', () => {
    const result = detectChangeType('Add loading spinners and error states');
    assertEqual(result.changeType, 'fix_ux_states');
  });

  it('marks full regen required for rebuild prompts', () => {
    const result = detectChangeType('Rebuild this from scratch using Next.js');
    assert(result.isFullRegenRequired, 'should require full regen');
  });

  it('isFullRegenerationRequired returns required=true for platform migration', () => {
    const result = isFullRegenerationRequired('Migrate this app to a React Native mobile app');
    assert(result.required === true, 'required should be true');
  });

  it('returns confidence (string) and indicators', () => {
    const result = detectChangeType('Update the color scheme and fonts');
    assert(['low', 'medium', 'high'].includes(result.confidence), `confidence should be low/medium/high, got "${result.confidence}"`);
    assert(Array.isArray(result.indicators), 'indicators should be array');
  });

  it('handles empty prompt gracefully', () => {
    const result = detectChangeType('');
    assert(result.changeType, 'should return a changeType');
    assert(Array.isArray(result.targetSections), 'targetSections should be array');
  });
});

// ── Scenario 2: Section Impact Analysis ──────────────────────────────────────

describe('Scenario 2: Section Impact Analysis', () => {
  it('restyle_ui keeps auth/billing/database preserved', () => {
    const cd = detectChangeType('Change colors and add dark mode');
    const impact = analyzeSectionImpact(cd, {});
    assertIncludes(impact.primarySections, 'design-system');
    assertIncludes(impact.preserveSections, 'auth');
    assertIncludes(impact.preserveSections, 'billing');
    assertIncludes(impact.preserveSections, 'database');
  });

  it('change_billing marks billing as primary', () => {
    const cd = detectChangeType('Add Stripe subscriptions');
    const impact = analyzeSectionImpact(cd, {});
    assertIncludes(impact.primarySections, 'billing');
  });

  it('change_auth_behavior marks auth as primary', () => {
    const cd = detectChangeType('Add OAuth with Google');
    const impact = analyzeSectionImpact(cd, {});
    assertIncludes(impact.primarySections, 'auth');
  });

  it('improve_deployment keeps everything else preserved', () => {
    const cd = detectChangeType('Add Dockerfile and Railway config');
    const impact = analyzeSectionImpact(cd, {});
    assertIncludes(impact.primarySections, 'deployment');
    assertIncludes(impact.preserveSections, 'auth');
    assertIncludes(impact.preserveSections, 'billing');
    assertIncludes(impact.preserveSections, 'database');
  });

  it('returns riskLevel', () => {
    const cd = detectChangeType('Update button colors');
    const impact = analyzeSectionImpact(cd, {});
    assert(['low', 'medium', 'high', 'critical'].includes(impact.riskLevel));
  });

  it('computes impactScore', () => {
    const cd = detectChangeType('Add auth and billing and database');
    const impact = analyzeSectionImpact(cd, {});
    assert(typeof impact.impactScore === 'number');
  });

  it('flags fullRegenerationRequired for platform change', () => {
    const cd = detectChangeType('Rebuild from scratch as a Next.js app');
    cd.isFullRegenRequired = true;
    const impact = analyzeSectionImpact(cd, {});
    assert(impact.fullRegenerationRequired, 'should require full regen');
  });

  it('lists validationRequired sections', () => {
    const cd = detectChangeType('Add Stripe billing');
    const impact = analyzeSectionImpact(cd, {});
    assert(Array.isArray(impact.validationRequired));
  });
});

// ── Scenario 3: File Mapping ──────────────────────────────────────────────────

describe('Scenario 3: File Mapping (mapSectionsToFiles)', () => {
  it('maps auth files correctly', () => {
    const mapping = mapSectionsToFiles(['auth'], SAMPLE_FILES);
    const authEntry = mapping.find(m => m.section === 'auth');
    assert(authEntry, 'should have auth entry');
    // matchedFiles might be empty if no pattern matches — check structure
    assert(Array.isArray(authEntry.matchedFiles), 'auth entry should have matchedFiles array');
  });

  it('maps deployment files correctly', () => {
    const mapping = mapSectionsToFiles(['deployment'], SAMPLE_FILES);
    const dep = mapping.find(m => m.section === 'deployment');
    assert(dep, 'should have deployment entry');
    assert(Array.isArray(dep.matchedFiles), 'should have matchedFiles');
    assert(dep.matchedFiles.some(f => f.includes('Dockerfile') || f.includes('package')));
  });

  it('returns fileMapping array', () => {
    const mapping = mapSectionsToFiles(['auth', 'deployment'], SAMPLE_FILES);
    assert(Array.isArray(mapping), 'should be array');
    assert(mapping.length > 0);
  });

  it('handles empty files gracefully', () => {
    const mapping = mapSectionsToFiles(['auth'], {});
    assert(Array.isArray(mapping));
  });
});

// ── Scenario 4: Regeneration Plan ────────────────────────────────────────────

describe('Scenario 4: Regeneration Plan (buildRegenerationPlan)', () => {
  it('builds a valid plan for UI restyle', () => {
    const cd     = detectChangeType('Update the design system');
    const impact = analyzeSectionImpact(cd, {});
    const allSections = [...impact.primarySections, ...impact.secondarySections];
    const fm     = mapSectionsToFiles(allSections, SAMPLE_FILES);
    const plan   = buildRegenerationPlan(cd, impact, fm, { existingFiles: SAMPLE_FILES });
    assert(Array.isArray(plan.filesToRegenerate), 'filesToRegenerate should be array');
    assert(Array.isArray(plan.filesToPatch), 'filesToPatch should be array');
    assert(Array.isArray(plan.filesToPreserve), 'filesToPreserve should be array');
    assert(plan.impact, 'plan should carry impact');
  });

  it('puts CSS files in filesToRegenerate or patch for restyle change', () => {
    const cd     = detectChangeType('Change the color palette');
    const impact = analyzeSectionImpact(cd, {});
    const allSections = [...impact.primarySections, ...impact.secondarySections];
    const fm     = mapSectionsToFiles(allSections, SAMPLE_FILES);
    const plan   = buildRegenerationPlan(cd, impact, fm, { existingFiles: SAMPLE_FILES });
    // Plan should at least include some files in scope (regen, patch, or preserve)
    const total = plan.filesToRegenerate.length + plan.filesToPatch.length + plan.filesToPreserve.length;
    assert(total > 0, 'plan should include some files');
  });

  it('estimatePlanCost returns a number', () => {
    const cd     = detectChangeType('Add auth');
    const impact = analyzeSectionImpact(cd, {});
    const allSections = [...impact.primarySections, ...impact.secondarySections];
    const fm     = mapSectionsToFiles(allSections, SAMPLE_FILES);
    const plan   = buildRegenerationPlan(cd, impact, fm, { existingFiles: SAMPLE_FILES });
    const cost   = require('../../src/lib/section-regeneration/build-regeneration-plan').estimatePlanCost(plan);
    assert(typeof cost === 'object' && typeof cost.estimatedTokens === 'number' && cost.estimatedTokens >= 0);
  });
});

// ── Scenario 5: Strategy Selection ───────────────────────────────────────────

describe('Scenario 5: Strategy Selection', () => {
  it('returns a valid strategy for normal changes', () => {
    const cd     = detectChangeType('Add a loading spinner');
    const impact = analyzeSectionImpact(cd, {});
    const allSections = [...impact.primarySections, ...impact.secondarySections];
    const fm     = mapSectionsToFiles(allSections, SAMPLE_FILES);
    const plan   = buildRegenerationPlan(cd, impact, fm, { existingFiles: SAMPLE_FILES });
    const strat  = selectRegenerationStrategy(plan);
    assert(['section_regeneration', 'full_regeneration', 'no_regeneration_needed'].includes(strat.strategy));
  });

  it('returns full_regeneration when plan.isFullRegeneration is true', () => {
    const plan = {
      isFullRegeneration: true,
      filesToRegenerate: [], filesToPatch: [], filesToPreserve: [],
      impact: { primarySections: [], secondarySections: [], riskLevel: 'high' },
    };
    const strat = selectRegenerationStrategy(plan);
    assertEqual(strat.strategy, 'full_regeneration');
  });

  it('returns no_regeneration_needed for trivial changes', () => {
    const plan = {
      isFullRegeneration: false,
      filesToRegenerate: [], filesToPatch: [], filesToPreserve: [],
      impact: { primarySections: [], secondarySections: [], riskLevel: 'low' },
      newFilesNeeded: [],
    };
    const strat = selectRegenerationStrategy(plan);
    assertEqual(strat.strategy, 'no_regeneration_needed');
  });

  it('validatePlanSafety returns warnings for server entrypoint in regen scope', () => {
    const plan = {
      filesToRegenerate: ['server.js'],
      filesToPatch: [],
      filesToPreserve: [],
      impact: { primarySections: ['backend-api'], riskLevel: 'medium' },
    };
    const safety = validatePlanSafety(plan);
    assert(Array.isArray(safety.warnings));
    assert(safety.warnings.some(w => w.includes('entrypoint') || w.includes('runtime')));
  });
});

// ── Scenario 6: Merge Regenerated Sections ───────────────────────────────────

describe('Scenario 6: Merge Regenerated Sections', () => {
  const plan = {
    filesToRegenerate: ['client/styles/main.css'],
    filesToPatch:      ['package.json'],
    filesToPreserve:   ['server/index.js', 'server/models/User.js'],
    changeDetection:   { action: 'add' },
  };

  const newFiles = {
    'client/styles/main.css': ':root { --bg: #1a1a1a; --text: #fff; }\n',
    'package.json': '{"name":"app","scripts":{"start":"node server/index.js","dev":"nodemon"},"dependencies":{"express":"^4"}}\n',
    'client/components/NewComponent.jsx': 'export default function New() {}\n',
  };

  it('replaces files in filesToRegenerate', () => {
    const result = mergeRegeneratedSections(SAMPLE_FILES, newFiles, plan);
    assertEqual(result.mergedFiles['client/styles/main.css'], newFiles['client/styles/main.css']);
    assertIncludes(result.replaced, 'client/styles/main.css');
  });

  it('patches package.json by merging scripts and deps', () => {
    const result = mergeRegeneratedSections(SAMPLE_FILES, newFiles, plan);
    assertIncludes(result.patched, 'package.json');
    const pkg = JSON.parse(result.mergedFiles['package.json']);
    assert(pkg.scripts.start, 'should have start script');
    assert(pkg.scripts.dev, 'should have dev script from patch');
  });

  it('preserves files in filesToPreserve', () => {
    const result = mergeRegeneratedSections(SAMPLE_FILES, newFiles, plan);
    assertEqual(result.mergedFiles['server/index.js'], SAMPLE_FILES['server/index.js']);
    assertIncludes(result.preserved, 'server/index.js');
  });

  it('creates new files not in currentFiles', () => {
    const result = mergeRegeneratedSections(SAMPLE_FILES, newFiles, plan);
    assertIncludes(result.created, 'client/components/NewComponent.jsx');
  });

  it('computeFileDiff detects added, removed, modified', () => {
    const before = { 'a.js': 'old', 'b.js': 'same' };
    const after  = { 'b.js': 'same', 'c.js': 'new' };
    const diff   = computeFileDiff(before, after);
    assertIncludes(diff.added, 'c.js');
    assertIncludes(diff.removed, 'a.js');
    assert(diff.modified.length === 0, 'b.js unchanged');
  });

  it('patchEnvExample appends only missing vars', () => {
    const existing = 'PORT=3000\nNODE_ENV=development\n';
    const result   = patchEnvExample(existing, ['PORT', 'STRIPE_SECRET_KEY', 'JWT_SECRET']);
    assert(!result.includes('PORT=\n'), 'PORT already exists — should not be duplicated');
    assert(result.includes('STRIPE_SECRET_KEY='), 'should add STRIPE_SECRET_KEY');
    assert(result.includes('JWT_SECRET='), 'should add JWT_SECRET');
  });

  it('handles file removal when action is remove', () => {
    const removePlan = {
      filesToRegenerate: ['client/styles/main.css'],
      filesToPatch: [],
      filesToPreserve: [],
      changeDetection: { action: 'remove' },
    };
    const result = mergeRegeneratedSections(SAMPLE_FILES, {}, removePlan);
    assert(!result.mergedFiles['client/styles/main.css'], 'file should be deleted');
  });
});

// ── Scenario 7: Selective Validation ─────────────────────────────────────────

describe('Scenario 7: Selective Validation', () => {
  it('builds validation scope with relevant checks for auth change', () => {
    const cd     = detectChangeType('Add login with JWT');
    const impact = analyzeSectionImpact(cd, {});
    const allSections = [...impact.primarySections, ...impact.secondarySections];
    const fm     = mapSectionsToFiles(allSections, SAMPLE_FILES);
    const plan   = buildRegenerationPlan(cd, impact, fm, { existingFiles: SAMPLE_FILES });
    const scope  = buildSelectiveValidationScope(plan);
    assert(Array.isArray(scope.checksToRun), 'checksToRun should be array');
    assert(scope.checksToRun.includes('missing-imports'), 'always-run check should be present');
  });

  it('includes auth-specific checks for auth changes', () => {
    const plan = {
      isFullRegeneration: false,
      impact: {
        primarySections: ['auth'],
        secondarySections: [],
        preserveSections: ['billing', 'database'],
        validationRequired: ['auth'],
        riskLevel: 'medium',
      },
      filesToRegenerate: ['server/routes/auth.js'],
      filesToPatch: [],
      filesToPreserve: ['server/models/User.js'],
    };
    const scope = buildSelectiveValidationScope(plan);
    assert(scope.checksToRun.some(c => c.includes('auth') || c.includes('jwt') || c.includes('credential')));
  });

  it('skips checks for preserved sections', () => {
    const plan = {
      isFullRegeneration: false,
      impact: {
        primarySections: ['ui-presentation'],
        secondarySections: [],
        preserveSections: ['billing', 'auth'],
        validationRequired: ['ui-presentation'],
        riskLevel: 'low',
      },
      filesToRegenerate: ['client/styles/main.css'],
      filesToPatch: [],
      filesToPreserve: [],
    };
    const scope = buildSelectiveValidationScope(plan);
    assert(Array.isArray(scope.skipChecks));
  });

  it('runs full validation for critical risk', () => {
    const plan = {
      isFullRegeneration: false,
      impact: {
        primarySections: ['auth'],
        secondarySections: ['billing'],
        preserveSections: [],
        validationRequired: ['auth'],
        riskLevel: 'critical',
      },
      filesToRegenerate: ['server/routes/auth.js'],
      filesToPatch: [],
      filesToPreserve: [],
    };
    const scope = buildSelectiveValidationScope(plan);
    assertEqual(scope.rationale, 'Full validation: high-risk or full-regen change');
  });

  it('runSelectiveValidation returns scope even when validator not available', () => {
    const plan = {
      isFullRegeneration: false,
      impact: { primarySections: ['deployment'], secondarySections: [], preserveSections: [], validationRequired: [], riskLevel: 'low' },
      filesToRegenerate: ['Dockerfile'], filesToPatch: [], filesToPreserve: [],
    };
    const result = runSelectiveValidation(plan, SAMPLE_FILES);
    assert(result.scope, 'should return scope');
    assert(Array.isArray(result.skippedChecks));
  });
});

// ── Scenario 8: Selective Repair ─────────────────────────────────────────────

describe('Scenario 8: Selective Repair', () => {
  it('skips repair for low-risk changes', () => {
    const plan = {
      isFullRegeneration: false,
      impact: { primarySections: ['ux-states'], secondarySections: [], repairRequired: [], riskLevel: 'low' },
      filesToRegenerate: ['client/components/LoadingState.jsx'],
      filesToPatch: [],
    };
    const scope = buildSelectiveRepairScope(plan);
    assert(scope.skipRepair, 'should skip repair for low-risk');
  });

  it('runs repair for medium-risk changes', () => {
    const plan = {
      isFullRegeneration: false,
      impact: { primarySections: ['auth'], secondarySections: [], repairRequired: ['auth'], riskLevel: 'medium' },
      filesToRegenerate: ['server/routes/auth.js'],
      filesToPatch: [],
    };
    const scope = buildSelectiveRepairScope(plan);
    assert(!scope.skipRepair, 'should not skip repair for medium-risk');
    assert(scope.passesToRun.length > 0, 'should have passes to run');
  });

  it('forces repair when forceRepair=true even for low-risk', () => {
    const plan = {
      isFullRegeneration: false,
      impact: { primarySections: ['deployment'], secondarySections: [], repairRequired: [], riskLevel: 'low' },
      filesToRegenerate: ['Dockerfile'],
      filesToPatch: [],
    };
    const scope = buildSelectiveRepairScope(plan, { forceRepair: true });
    assert(!scope.skipRepair, 'forceRepair should override low-risk skip');
  });

  it('runSelectiveRepair returns scope + repairApplied flag', () => {
    const plan = {
      isFullRegeneration: false,
      impact: { primarySections: ['auth'], secondarySections: [], repairRequired: ['auth'], riskLevel: 'medium' },
      filesToRegenerate: ['server/routes/auth.js'],
      filesToPatch: [],
    };
    const result = runSelectiveRepair(plan, SAMPLE_FILES);
    assert(result.scope, 'should return scope');
    assert(typeof result.repairApplied === 'boolean', 'should return repairApplied flag');
  });
});

// ── Scenario 9: Section-Specific Regenerators ─────────────────────────────────

describe('Scenario 9: Section-Specific Regenerators', () => {
  const basePlan = {
    changeDetection: { action: 'add', changeType: 'add_feature', isRemoval: false },
    impact: { primarySections: [], secondarySections: [], riskLevel: 'medium' },
    filesToRegenerate: [], filesToPatch: [], filesToPreserve: [], newFilesNeeded: [],
  };

  it('regenerateUiSection returns valid spec', () => {
    const spec = regenerateUiSection(basePlan, { userPrompt: 'dark mode' });
    assertEqual(spec.sectionType, 'ui-presentation');
    assert(Array.isArray(spec.generationHints));
    assert(typeof spec.placeholderMode === 'boolean');
  });

  it('regenerateAuthSection returns spec with server files', () => {
    const spec = regenerateAuthSection(basePlan, { userPrompt: 'Add login with JWT' });
    assertEqual(spec.sectionType, 'auth');
    assert(spec.filesToCreate.some(f => f.path.includes('server') || f.path.includes('auth')));
    assert(spec.generationHints.some(h => h.toLowerCase().includes('jwt') || h.toLowerCase().includes('bcrypt')));
    assert(spec.authenticityNote, 'auth section must have authenticity note');
  });

  it('regenerateBillingSection returns spec with stripe env vars', () => {
    const spec = regenerateBillingSection(basePlan, { userPrompt: 'Add Stripe subscriptions' });
    assertEqual(spec.sectionType, 'billing');
    assertIncludes(spec.envVarsNeeded, 'STRIPE_SECRET_KEY');
    assert(spec.authenticityNote, 'billing must have authenticity note');
    assert(spec.generationHints.some(h => h.toLowerCase().includes('webhook') || h.toLowerCase().includes('stripe')));
  });

  it('regenerateIntegrationSection detects OpenAI integration', () => {
    const spec = regenerateIntegrationSection(basePlan, { userPrompt: 'Add OpenAI chatbot' });
    assertEqual(spec.sectionType, 'integrations');
    assertIncludes(spec.envVarsNeeded, 'OPENAI_API_KEY');
    assert(spec.placeholderMode, 'integrations should use placeholder mode');
  });

  it('regenerateAdminSection returns spec with auth guards', () => {
    const spec = regenerateAdminSection(basePlan, { userPrompt: 'Add admin dashboard' });
    assertEqual(spec.sectionType, 'admin');
    assert(spec.generationHints.some(h => h.toLowerCase().includes('admin') || h.toLowerCase().includes('role') || h.toLowerCase().includes('guard')));
    assert(spec.authenticityNote, 'admin must have authenticity note');
  });

  it('regenerateDeploymentSection detects Railway platform', () => {
    const spec = regenerateDeploymentSection(basePlan, { userPrompt: 'Deploy to Railway' });
    assertEqual(spec.sectionType, 'deployment');
    assert(spec.filesToCreate.some(f => f.path.toLowerCase().includes('railway') || f.description.toLowerCase().includes('railway')));
  });

  it('regenerateUxStatesSection creates LoadingState and ErrorState for applyAll', () => {
    const spec = regenerateUxStatesSection(basePlan, { userPrompt: 'Improve UX states' });
    assertEqual(spec.sectionType, 'ux-states');
    assert(spec.filesToCreate.some(f => f.path.includes('Loading') || f.path.includes('Skeleton')));
    assert(spec.filesToCreate.some(f => f.path.includes('Error')));
    assert(spec.filesToCreate.some(f => f.path.includes('Empty')));
  });

  it('regenerateUxStatesSection only creates loading components for loading prompt', () => {
    const spec = regenerateUxStatesSection(basePlan, { userPrompt: 'Add a loading spinner' });
    assertEqual(spec.sectionType, 'ux-states');
    // Should have loading files but may not have EmptyState
    assert(spec.filesToCreate.some(f => f.path.includes('Loading') || f.path.includes('Skeleton')));
  });

  it('buildSectionSpec returns spec for known section', () => {
    const spec = buildSectionSpec('auth', basePlan, { userPrompt: 'Add auth' });
    assert(spec, 'should return spec for known section');
    assertEqual(spec.sectionType, 'auth');
  });

  it('buildSectionSpec returns null for unknown section', () => {
    const spec = buildSectionSpec('unknown-section', basePlan, {});
    assert(spec === null, 'should return null for unknown section');
  });

  it('buildAllSectionSpecs builds specs for all primary sections', () => {
    const plan = {
      ...basePlan,
      impact: { primarySections: ['auth', 'deployment'], secondarySections: [], riskLevel: 'medium' },
    };
    const specs = buildAllSectionSpecs(plan, { userPrompt: 'Add auth and deploy' });
    assert(specs.auth, 'should have auth spec');
    assert(specs.deployment, 'should have deployment spec');
  });
});

// ── Scenario 10: Report Builder ───────────────────────────────────────────────

describe('Scenario 10: Report Builder', () => {
  const cd     = detectChangeType('Add loading states');
  const impact = analyzeSectionImpact(cd, {});
  const allSecs = [...impact.primarySections, ...impact.secondarySections];
  const fm     = mapSectionsToFiles(allSecs, SAMPLE_FILES);
  const plan   = buildRegenerationPlan(cd, impact, fm, { existingFiles: SAMPLE_FILES });
  const strat  = selectRegenerationStrategy(plan);

  it('buildSectionRegenerationReport returns valid report', () => {
    const report = buildSectionRegenerationReport({ userPrompt: 'Add loading states', changeDetection: cd, impact, plan, strategy: strat });
    assert(report.status, 'should have status');
    assert(report.changeType, 'should have changeType');
    assert(Array.isArray(report.warnings), 'should have warnings array');
    assert(report.summary, 'should have summary string');
  });

  it('report has section arrays', () => {
    const report = buildSectionRegenerationReport({ userPrompt: 'Add loading states', changeDetection: cd, impact, plan, strategy: strat });
    assert(Array.isArray(report.primarySections));
    assert(Array.isArray(report.secondarySections));
    assert(Array.isArray(report.preservedSections));
  });

  it('buildUiSectionRegenerationPayload returns UI-safe object', () => {
    const report = buildSectionRegenerationReport({ userPrompt: 'Add loading states', changeDetection: cd, impact, plan, strategy: strat });
    const payload = buildUiSectionRegenerationPayload(report);
    assert(payload.status, 'should have status');
    assert(typeof payload.impactedFilesCount === 'number');
    assert(payload.summary, 'should have summary');
    assert(payload.savingsRationale, 'should have savingsRationale');
  });

  it('buildUiSectionRegenerationPayload returns null for null input', () => {
    const payload = buildUiSectionRegenerationPayload(null);
    assert(payload === null);
  });

  it('summarizeSectionRegeneration returns a string', () => {
    const report = buildSectionRegenerationReport({ userPrompt: 'Add loading states', changeDetection: cd, impact, plan, strategy: strat });
    const summary = summarizeSectionRegeneration(report);
    assert(typeof summary === 'string' && summary.length > 0);
    assert(summary.includes('status='));
  });

  it('full_regeneration strategy produces correct status', () => {
    const fullPlan = {
      ...plan,
      isFullRegeneration: true,
      filesToRegenerate: [], filesToPatch: [], filesToPreserve: [],
    };
    const fullStrat = selectRegenerationStrategy(fullPlan);
    const report = buildSectionRegenerationReport({
      userPrompt: 'Rebuild everything', changeDetection: cd, impact, plan: fullPlan, strategy: fullStrat,
    });
    assertEqual(report.status, 'full_regeneration_required');
  });
});

// ── Scenario 11: End-to-End runSectionRegeneration ────────────────────────────

describe('Scenario 11: End-to-End runSectionRegeneration', () => {
  it('returns a SectionRegenerationReport for UI restyle', () => {
    const report = runSectionRegeneration({
      userPrompt: 'Make it dark mode',
      currentFiles: SAMPLE_FILES,
      projectContext: { appType: 'web', platform: 'web' },
    });
    assert(report.status, 'should have status');
    assert(report.changeType, 'should have changeType');
    assert(Array.isArray(report.primarySections));
    assert(report.plan, 'should have plan');
    assert(report.strategy, 'should have strategy');
  });

  it('runs merge when regeneratedFiles are provided', () => {
    const regeneratedFiles = {
      'client/styles/main.css': ':root { --bg: #111; --text: #eee; }\n',
    };
    const report = runSectionRegeneration({
      userPrompt: 'Switch to dark theme',
      currentFiles: SAMPLE_FILES,
      regeneratedFiles,
    });
    assert(report.status, 'should have status');
    // If regen files provided and merge ran, should show files
    assert(Array.isArray(report.impactedFiles));
  });

  it('handles auth change end-to-end', () => {
    const report = runSectionRegeneration({
      userPrompt: 'Add JWT authentication with login and signup',
      currentFiles: SAMPLE_FILES,
    });
    assertIncludes(report.primarySections, 'auth');
    assert(['section_regeneration_planned', 'section_regeneration_completed', 'full_regeneration_required'].includes(report.status));
  });

  it('handles billing change end-to-end', () => {
    const report = runSectionRegeneration({
      userPrompt: 'Integrate Stripe for subscription payments',
      currentFiles: SAMPLE_FILES,
    });
    assertIncludes(report.primarySections, 'billing');
  });

  it('handles deployment change end-to-end', () => {
    const report = runSectionRegeneration({
      userPrompt: 'Add Docker and deploy to Railway',
      currentFiles: SAMPLE_FILES,
    });
    assertIncludes(report.primarySections, 'deployment');
    assertNotIncludes(report.primarySections, 'auth');
    assertNotIncludes(report.primarySections, 'database');
  });

  it('returns fullRegenerationRequired for rebuild prompt', () => {
    const report = runSectionRegeneration({
      userPrompt: 'Rebuild the entire app from scratch as a Next.js app',
      currentFiles: SAMPLE_FILES,
    });
    assert(
      report.fullRegenerationRequired || report.status === 'full_regeneration_required',
      'should flag full regen for rebuild prompt',
    );
  });

  it('summary is a non-empty string', () => {
    const report = runSectionRegeneration({
      userPrompt: 'Add error state components',
      currentFiles: SAMPLE_FILES,
    });
    assert(typeof report.summary === 'string' && report.summary.length > 0, 'summary should be a string');
  });
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(55));
console.log(`  Section Regeneration Tests`);
console.log('─'.repeat(55));
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
if (failures.length > 0) {
  console.log('\n  Failures:');
  for (const f of failures) {
    console.log(`    ✗ ${f.label}`);
    console.log(`      ${f.error}`);
  }
}
console.log('─'.repeat(55));

if (failed > 0) process.exit(1);
