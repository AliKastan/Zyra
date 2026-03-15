'use strict';

/**
 * Unit tests for the Multi-Pass Generation system.
 * Tests only deterministic parts (pass selection, plan structure) — no Claude API calls.
 * Run with: node test/generation/multipass.test.js
 */

const {
  planGenerationPasses,
  summarizeMultiPassPlan,
  getFilesTouchedByPass,
  summarizeMultiPassExecution,
} = require('../../src/lib/generation/passes');

const { selectPasses, TOKEN_BUDGETS } = require('../../src/lib/generation/passes/selectPasses');

// ── Minimal test harness ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${label}`);
    failed++;
  }
}

function describe(title, fn) {
  console.log(`\n── ${title}`);
  fn();
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** @returns {import('../../src/lib/generation/types').AppBlueprint} */
function makeBlueprint(overrides = {}) {
  return {
    projectName: 'test-project',
    fileList: [],
    fileSpecs: [],
    cssComponents: [],
    navigation: {},
    designSystem: {},
    dataFlow: {},
    ...overrides,
  };
}

/** @returns {import('../../src/lib/complexity/types').AppComplexityReport} */
function makeComplexityReport(tier, signals = {}) {
  return {
    complexityTier: tier,
    signals: {
      hasAuth: false,
      hasPayments: false,
      hasAI: false,
      hasAdmin: false,
      hasAnalytics: false,
      hasRealTime: false,
      hasBackgroundJobs: false,
      hasMobile: false,
      featureCount: 3,
      roleCount: 1,
      integrationCount: 1,
      ...signals,
    },
    totalScore: 0,
    confidence: 0.9,
    llmRefined: false,
    recommendedStrategy: { generationMode: 'compact' },
  };
}

// ── Scenario 1: Simple landing page ──────────────────────────────────────────

describe('Scenario 1 — Simple landing page', () => {
  const blueprint = makeBlueprint();
  const report = makeComplexityReport('simple', {
    hasAdmin: false,
    hasPayments: false,
    hasAI: false,
    integrationCount: 1,
    roleCount: 1,
  });

  const plan = selectPasses(blueprint, report);
  const passNames = plan.passes.map(p => p.name);

  assert(plan.tier === 'simple', `tier is "simple" (got "${plan.tier}")`);
  assert(passNames.includes('scaffold_html'), 'scaffold_html pass is included');
  assert(passNames.includes('css_design_system'), 'css_design_system pass is included');
  assert(passNames.includes('javascript_core'), 'javascript_core pass is included');
  assert(!passNames.includes('admin_ops'), 'admin_ops pass is NOT included');
  assert(!passNames.includes('billing_integrations'), 'billing_integrations pass is NOT included');
  assert(!passNames.includes('polish_deployment'), 'polish_deployment pass is NOT included');
  assert(plan.passes.length === 3, `exactly 3 passes (got ${plan.passes.length})`);
  assert(plan.totalEstimatedTokens === 22000, `totalEstimatedTokens is 22000 (got ${plan.totalEstimatedTokens})`);
  assert(Array.isArray(plan.rationale) && plan.rationale.length > 0, 'rationale is non-empty array');
});

// ── Scenario 2: Booking app (medium) ─────────────────────────────────────────

describe('Scenario 2 — Booking app (medium tier, admin required)', () => {
  const blueprint = makeBlueprint();
  const report = makeComplexityReport('medium', {
    hasAdmin: true,
    hasPayments: false,
    hasAI: false,
    integrationCount: 2,
    roleCount: 3,
  });

  const plan = selectPasses(blueprint, report);
  const passNames = plan.passes.map(p => p.name);

  assert(plan.tier === 'medium', `tier is "medium" (got "${plan.tier}")`);
  assert(passNames.includes('scaffold_html'), 'scaffold_html pass is included');
  assert(passNames.includes('css_design_system'), 'css_design_system pass is included');
  assert(passNames.includes('javascript_core'), 'javascript_core pass is included');
  assert(passNames.includes('admin_ops'), 'admin_ops pass IS included (hasAdmin=true)');
  assert(!passNames.includes('billing_integrations'), 'billing_integrations NOT included (no payments/AI, integrationCount<3)');
  assert(!passNames.includes('polish_deployment'), 'polish_deployment NOT included (medium tier)');
  assert(plan.passes.length === 4, `exactly 4 passes (got ${plan.passes.length})`);

  const adminPass = plan.passes.find(p => p.name === 'admin_ops');
  assert(adminPass !== undefined, 'admin_ops pass object exists');
  assert(adminPass.tokenBudget === TOKEN_BUDGETS.medium.admin_ops, `admin_ops tokenBudget matches medium budget (${adminPass?.tokenBudget})`);
  assert(adminPass.conditional === true, 'admin_ops is marked as conditional');
  assert(adminPass.enabled === true, 'admin_ops is enabled');
});

// ── Scenario 3: AI SaaS (advanced) ───────────────────────────────────────────

describe('Scenario 3 — AI SaaS (advanced tier, all features)', () => {
  const blueprint = makeBlueprint();
  const report = makeComplexityReport('advanced', {
    hasAdmin: true,
    hasPayments: true,
    hasAI: true,
    integrationCount: 4,
    roleCount: 3,
  });

  const plan = selectPasses(blueprint, report);
  const passNames = plan.passes.map(p => p.name);

  assert(plan.tier === 'advanced', `tier is "advanced" (got "${plan.tier}")`);
  assert(passNames.includes('scaffold_html'), 'scaffold_html included');
  assert(passNames.includes('css_design_system'), 'css_design_system included');
  assert(passNames.includes('javascript_core'), 'javascript_core included');
  assert(passNames.includes('admin_ops'), 'admin_ops included (hasAdmin=true)');
  assert(passNames.includes('billing_integrations'), 'billing_integrations included (hasPayments + hasAI)');
  assert(passNames.includes('polish_deployment'), 'polish_deployment included (advanced tier)');
  assert(plan.passes.length === 6, `all 6 passes run (got ${plan.passes.length})`);

  const billingPass = plan.passes.find(p => p.name === 'billing_integrations');
  assert(billingPass !== undefined, 'billing_integrations pass object exists');
  assert(billingPass.tokenBudget === TOKEN_BUDGETS.advanced.billing_integrations, `billing tokenBudget matches advanced (${billingPass?.tokenBudget})`);

  const polishPass = plan.passes.find(p => p.name === 'polish_deployment');
  assert(polishPass !== undefined, 'polish_deployment pass object exists');
  assert(polishPass.tokenBudget === TOKEN_BUDGETS.advanced.polish_deployment, `polish tokenBudget matches advanced (${polishPass?.tokenBudget})`);
});

// ── Scenario 4: Multi-role marketplace (production_heavy) ────────────────────

describe('Scenario 4 — Multi-role marketplace (production_heavy)', () => {
  const blueprint = makeBlueprint();
  const report = makeComplexityReport('production_heavy', {
    hasAdmin: true,
    hasPayments: true,
    hasAI: false,
    integrationCount: 5,
    roleCount: 4,
  });

  const plan = selectPasses(blueprint, report);
  const passNames = plan.passes.map(p => p.name);

  assert(plan.tier === 'production_heavy', `tier is "production_heavy" (got "${plan.tier}")`);
  assert(plan.passes.length === 6, `all 6 passes run (got ${plan.passes.length})`);
  assert(passNames.includes('admin_ops'), 'admin_ops included');
  assert(passNames.includes('billing_integrations'), 'billing_integrations included (integrationCount=5 >= 3)');
  assert(passNames.includes('polish_deployment'), 'polish_deployment included');

  // Verify production_heavy budgets are larger than advanced for all passes
  const passMap = Object.fromEntries(plan.passes.map(p => [p.name, p.tokenBudget]));
  assert(passMap.scaffold_html > TOKEN_BUDGETS.advanced.scaffold_html,
    `production_heavy scaffold_html (${passMap.scaffold_html}) > advanced (${TOKEN_BUDGETS.advanced.scaffold_html})`);
  assert(passMap.css_design_system > TOKEN_BUDGETS.advanced.css_design_system,
    `production_heavy css_design_system (${passMap.css_design_system}) > advanced (${TOKEN_BUDGETS.advanced.css_design_system})`);
  assert(passMap.javascript_core > TOKEN_BUDGETS.advanced.javascript_core,
    `production_heavy javascript_core (${passMap.javascript_core}) > advanced (${TOKEN_BUDGETS.advanced.javascript_core})`);
  assert(passMap.admin_ops > TOKEN_BUDGETS.advanced.admin_ops,
    `production_heavy admin_ops (${passMap.admin_ops}) > advanced (${TOKEN_BUDGETS.advanced.admin_ops})`);
  assert(passMap.billing_integrations > TOKEN_BUDGETS.advanced.billing_integrations,
    `production_heavy billing_integrations (${passMap.billing_integrations}) > advanced (${TOKEN_BUDGETS.advanced.billing_integrations})`);
  assert(passMap.polish_deployment > TOKEN_BUDGETS.advanced.polish_deployment,
    `production_heavy polish_deployment (${passMap.polish_deployment}) > advanced (${TOKEN_BUDGETS.advanced.polish_deployment})`);

  // Verify total is sum of all 6 budgets
  const expectedTotal = Object.values(TOKEN_BUDGETS.production_heavy).reduce((a, b) => a + b, 0);
  assert(plan.totalEstimatedTokens === expectedTotal,
    `totalEstimatedTokens = ${plan.totalEstimatedTokens} matches sum of all production_heavy budgets (${expectedTotal})`);
});

// ── Scenario 5: Helper functions ─────────────────────────────────────────────

describe('Scenario 5 — Helper functions', () => {
  // summarizeMultiPassPlan
  const blueprint = makeBlueprint();
  const advancedReport = makeComplexityReport('advanced', {
    hasAdmin: true, hasPayments: true, hasAI: true, integrationCount: 4, roleCount: 3,
  });
  const plan = selectPasses(blueprint, advancedReport);

  const summary = summarizeMultiPassPlan(plan);
  assert(typeof summary === 'string' && summary.length > 0, 'summarizeMultiPassPlan returns non-empty string');
  assert(summary.includes('advanced'), `summary includes tier "advanced" (got: "${summary.slice(0, 120)}")`);
  assert(summary.includes('6 passes'), `summary mentions 6 passes (got: "${summary.slice(0, 120)}")`);

  // getFilesTouchedByPass — mock result
  const mockResult = {
    projectName: 'test-project',
    files: [
      { path: 'index.html', content: '' },
      { path: 'style.css', content: '' },
      { path: 'app.js', content: '' },
      { path: 'admin.html', content: '' },
      { path: 'admin.js', content: '' },
    ],
    passReports: [
      { passName: 'scaffold_html',     label: 'HTML scaffold',    files: [{ path: 'index.html', content: '' }], warnings: [], filesProduced: 1, skipped: false, tokenBudget: 14000, unresolvedItems: [], summary: '' },
      { passName: 'css_design_system', label: 'CSS design system', files: [{ path: 'style.css', content: '' }], warnings: [], filesProduced: 1, skipped: false, tokenBudget: 10000, unresolvedItems: [], summary: '' },
      { passName: 'javascript_core',   label: 'JavaScript core',  files: [{ path: 'app.js', content: '' }], warnings: [], filesProduced: 1, skipped: false, tokenBudget: 16000, unresolvedItems: [], summary: '' },
      { passName: 'admin_ops',         label: 'Admin & operations', files: [{ path: 'admin.html', content: '' }, { path: 'admin.js', content: '' }], warnings: [], filesProduced: 2, skipped: false, tokenBudget: 8000, unresolvedItems: [], summary: '' },
      { passName: 'billing_integrations', label: 'Billing & integrations', files: [], warnings: ['no output'], filesProduced: 0, skipped: true, tokenBudget: 6000, unresolvedItems: [], summary: '' },
      { passName: 'polish_deployment', label: 'Polish & deployment', files: [], warnings: [], filesProduced: 0, skipped: false, tokenBudget: 4000, unresolvedItems: [], summary: '' },
    ],
    plan,
    summary: 'test summary',
  };

  const scaffoldFiles = getFilesTouchedByPass(mockResult, 'scaffold_html');
  assert(Array.isArray(scaffoldFiles), 'getFilesTouchedByPass returns array');
  assert(scaffoldFiles.length === 1, `scaffold_html touched 1 file (got ${scaffoldFiles.length})`);
  assert(scaffoldFiles[0] === 'index.html', `scaffold file is index.html (got "${scaffoldFiles[0]}")`);

  const adminFiles = getFilesTouchedByPass(mockResult, 'admin_ops');
  assert(adminFiles.length === 2, `admin_ops touched 2 files (got ${adminFiles.length})`);
  assert(adminFiles.includes('admin.html'), 'admin files includes admin.html');
  assert(adminFiles.includes('admin.js'), 'admin files includes admin.js');

  const unknownFiles = getFilesTouchedByPass(mockResult, 'billing_integrations');
  assert(unknownFiles.length === 0, 'billing_integrations (skipped) returns empty array (0 files)');

  const missingPassFiles = getFilesTouchedByPass(mockResult, 'nonexistent_pass');
  assert(Array.isArray(missingPassFiles) && missingPassFiles.length === 0, 'unknown pass name returns empty array');

  // summarizeMultiPassExecution
  const execSummary = summarizeMultiPassExecution(mockResult);
  assert(typeof execSummary === 'string' && execSummary.length > 0, 'summarizeMultiPassExecution returns non-empty string');
  assert(execSummary.includes('5 files'), `execution summary mentions file count (got: "${execSummary.slice(0, 200)}")`);
  assert(execSummary.includes('HTML scaffold'), 'execution summary mentions HTML scaffold pass');
  assert(execSummary.includes('Admin & operations'), 'execution summary mentions Admin & operations pass');
});

// ── Scenario 6: planGenerationPasses API ─────────────────────────────────────

describe('Scenario 6 — planGenerationPasses API surface', () => {
  const blueprint = makeBlueprint({ projectName: 'api-test' });
  const report = makeComplexityReport('medium', { hasAdmin: false, roleCount: 2 });

  const plan = planGenerationPasses(blueprint, report);

  assert(typeof plan === 'object' && plan !== null, 'planGenerationPasses returns an object');
  assert(Array.isArray(plan.passes), 'plan.passes is an array');
  assert(typeof plan.tier === 'string', 'plan.tier is a string');
  assert(typeof plan.totalEstimatedTokens === 'number', 'plan.totalEstimatedTokens is a number');
  assert(Array.isArray(plan.rationale), 'plan.rationale is an array');

  // All passes have required fields
  for (const pass of plan.passes) {
    assert(typeof pass.name === 'string', `pass "${pass.name}" has string .name`);
    assert(typeof pass.label === 'string', `pass "${pass.name}" has string .label`);
    assert(typeof pass.tokenBudget === 'number', `pass "${pass.name}" has numeric .tokenBudget`);
    assert(typeof pass.enabled === 'boolean', `pass "${pass.name}" has boolean .enabled`);
    assert(typeof pass.conditional === 'boolean', `pass "${pass.name}" has boolean .conditional`);
  }

  // planGenerationPasses with null complexityReport should still work (defaults to medium)
  const planNull = planGenerationPasses(blueprint, null);
  assert(planNull !== null && typeof planNull === 'object', 'planGenerationPasses handles null complexityReport');
  assert(planNull.tier === 'medium', `null report defaults to medium tier (got "${planNull.tier}")`);
  assert(planNull.passes.length >= 3, `null report produces at least 3 passes (got ${planNull.passes.length})`);
});

// ── Edge case: simple tier + roleCount=3 → admin_ops NOT included ─────────────

describe('Edge case — simple tier, roleCount=3: admin_ops must be excluded', () => {
  const blueprint = makeBlueprint();
  const report = makeComplexityReport('simple', {
    hasAdmin: false,
    hasPayments: false,
    hasAI: false,
    integrationCount: 1,
    roleCount: 3, // would trigger admin_ops in medium+, but simple budget is 0
  });

  const plan = selectPasses(blueprint, report);
  const passNames = plan.passes.map(p => p.name);

  assert(!passNames.includes('admin_ops'),
    'admin_ops NOT included for simple tier even when roleCount=3 (budget=0 blocks it)');
  assert(plan.passes.length === 3, `simple tier still has exactly 3 passes (got ${plan.passes.length})`);
  assert(plan.totalEstimatedTokens === 22000,
    `simple tier tokens remain 22000 with roleCount=3 (got ${plan.totalEstimatedTokens})`);
});

// ── Edge case: admin triggered via blueprint fileList ─────────────────────────

describe('Edge case — admin triggered via blueprint fileList', () => {
  const blueprint = makeBlueprint({ fileList: ['index.html', 'admin.html', 'app.js'] });
  const report = makeComplexityReport('medium', {
    hasAdmin: false,
    roleCount: 1,
    integrationCount: 1,
  });

  const plan = selectPasses(blueprint, report);
  const passNames = plan.passes.map(p => p.name);

  assert(passNames.includes('admin_ops'),
    'admin_ops included when blueprint fileList contains "admin.html" (even without hasAdmin signal)');
});

// ── Summary ───────────────────────────────────────────────────────────────────

Promise.resolve().then(() => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nAll tests passed.');
  }
});
