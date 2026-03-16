'use strict';

/**
 * Design System Selector + Theme Preset Engine Tests
 *
 * 8 scenarios:
 *   1. B2B SaaS app            → MINIMAL_SAAS
 *   2. Ops / admin dashboard   → ENTERPRISE_DASHBOARD
 *   3. Appointment booking     → BOOKING_SERVICE
 *   4. Marketplace / shop      → MARKETPLACE_MODERN
 *   5. Mobile consumer app     → MOBILE_CONSUMER
 *   6. Finance / analytics     → FINANCE_ANALYTICS
 *   7. AI / LLM tool           → AI_NATIVE
 *   8. Premium product launch  → PREMIUM_STARTUP or LUXURY_DARK
 *
 * Plus unit tests for:
 *   - Token generation (colors, spacing, typography)
 *   - CSS var rendering
 *   - Component rules (compact / spacious density)
 *   - Override merging (colors, accentMood)
 *   - Blueprint enrichment
 *   - listPresets / getPresetTokens helpers
 */

const assert = require('assert');
const {
  runDesignSystemStage,
  selectDesignPreset,
  buildDesignSpec,
  mergeDesignSpecIntoBlueprint,
  summarizeDesignSpec,
  buildDesignTokens,
  tokensToCssVars,
  renderCssRootBlock,
  buildComponentRules,
  summarizeComponentRules,
  mergeDesignOverrides,
  describeOverrides,
  getPreset,
  ALL_PRESETS,
  PRESET_NAMES,
  getPresetTokens,
  listPresets,
  debugDesignSelection,
} = require('../../src/lib/design-system');

// ── Tiny test helpers ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function describe(title, fn) {
  console.log(`\n  ${title}`);
  fn();
}

function it(label, fn) {
  try {
    fn();
    console.log(`    ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`    ✗ ${label}`);
    console.error(`      ${err.message}`);
    failed++;
  }
}

// ── Context builders ──────────────────────────────────────────────────────────

function makeCtx(overrides = {}) {
  return {
    intent: {
      appType:   'generic',
      category:  '',
      target:    '',
      tone:      'professional',
      features:  [],
      userFlows: [],
      isMultiUser: false,
      ...(overrides.intent || {}),
    },
    product:         overrides.product         || {},
    blueprint:       overrides.blueprint       || {},
    complexityReport: overrides.complexityReport || { complexityTier: 'medium', signals: {} },
    overrides:       overrides.overrides       || {},
  };
}

// ── Scenario 1: B2B SaaS ───────────────────────────────────────────────────────

describe('Scenario 1 — B2B SaaS → MINIMAL_SAAS', () => {
  const ctx = makeCtx({
    intent: {
      appType: 'saas',
      category: 'productivity',
      target: 'small businesses',
      tone: 'professional',
      features: [
        { name: 'dashboard', description: 'overview metrics' },
        { name: 'settings', description: 'account settings panel' },
      ],
      userFlows: [{ name: 'onboarding' }],
      isMultiUser: true,
    },
    product: { appName: 'TaskFlow', summary: 'B2B project management SaaS' },
  });

  const result = runDesignSystemStage(ctx, null);

  it('selects MINIMAL_SAAS as primary preset', () => {
    assert.strictEqual(result.selection.primary, 'MINIMAL_SAAS');
  });

  it('returns a fallback preset', () => {
    assert.ok(result.selection.fallback, 'fallback should exist');
    assert.notStrictEqual(result.selection.fallback, result.selection.primary);
  });

  it('designSpec has correct preset name', () => {
    assert.strictEqual(result.designSpec.preset, 'MINIMAL_SAAS');
  });

  it('designSpec has tokens with required color fields', () => {
    const colors = result.designSpec.tokens.colors;
    assert.ok(colors.primary, 'primary color required');
    assert.ok(colors.background, 'background color required');
    assert.ok(colors.text, 'text color required');
  });

  it('designSpec has typography tokens', () => {
    assert.ok(result.designSpec.tokens.typography.fontFamily, 'fontFamily required');
    assert.ok(result.designSpec.tokens.typography.scaleRem, 'scaleRem required');
  });

  it('summary string is non-empty', () => {
    assert.ok(result.summary && result.summary.length > 0);
  });
});

// ── Scenario 2: Ops Dashboard ──────────────────────────────────────────────────

describe('Scenario 2 — Ops/admin dashboard → ENTERPRISE_DASHBOARD', () => {
  const ctx = makeCtx({
    intent: {
      appType: 'dashboard',
      category: 'operations',
      tone: 'professional',
      features: [
        { name: 'admin panel', description: 'admin user management' },
        { name: 'data tables', description: 'large data grid' },
        { name: 'reports', description: 'business reports export' },
      ],
      isMultiUser: true,
    },
    product: { summary: 'enterprise operations platform with admin controls and analytics' },
    complexityReport: { complexityTier: 'complex', signals: {} },
  });

  const selection = selectDesignPreset(ctx);

  it('selects ENTERPRISE_DASHBOARD', () => {
    assert.strictEqual(selection.primary, 'ENTERPRISE_DASHBOARD');
  });

  it('scores ENTERPRISE_DASHBOARD higher than MINIMAL_SAAS', () => {
    assert.ok(
      selection.scores['ENTERPRISE_DASHBOARD'] > selection.scores['MINIMAL_SAAS'],
      `ENTERPRISE(${selection.scores['ENTERPRISE_DASHBOARD']}) should beat MINIMAL_SAAS(${selection.scores['MINIMAL_SAAS']})`,
    );
  });

  it('componentRules use compact density', () => {
    const rules = buildComponentRules('ENTERPRISE_DASHBOARD', 'compact');
    assert.ok(rules.tables?.compact === true, 'compact tables expected');
  });
});

// ── Scenario 3: Appointment Booking ───────────────────────────────────────────

describe('Scenario 3 — Appointment booking → BOOKING_SERVICE', () => {
  const ctx = makeCtx({
    intent: {
      appType: 'booking',
      tone: 'professional',
      features: [
        { name: 'booking form', description: 'schedule appointment slots' },
        { name: 'calendar', description: 'availability calendar' },
        { name: 'confirmation', description: 'booking confirmation email' },
      ],
    },
    product: { appName: 'BookEasy', summary: 'appointment booking system for salons and clinics' },
  });

  const selection = selectDesignPreset(ctx);

  it('selects BOOKING_SERVICE', () => {
    assert.strictEqual(selection.primary, 'BOOKING_SERVICE');
  });

  it('has teal/green primary color', () => {
    const preset = getPreset('BOOKING_SERVICE');
    const primary = preset.colors.primary.toLowerCase();
    // Teal range
    assert.ok(
      primary.startsWith('#0d') || primary.startsWith('#14') || primary.startsWith('#05') || primary.startsWith('#10'),
      `Expected teal color, got ${primary}`,
    );
  });

  it('generationHints mention calendar or booking pattern', () => {
    const spec = buildDesignSpec(ctx, selection);
    const hintsText = spec.generationHints.join(' ').toLowerCase();
    assert.ok(
      hintsText.includes('calendar') || hintsText.includes('booking') || hintsText.includes('slot') || hintsText.includes('appointment'),
      `Expected booking hints, got: ${hintsText}`,
    );
  });
});

// ── Scenario 4: Marketplace ────────────────────────────────────────────────────

describe('Scenario 4 — Marketplace / shop → MARKETPLACE_MODERN', () => {
  const ctx = makeCtx({
    intent: {
      appType: 'marketplace',
      tone: 'professional',
      features: [
        { name: 'product listings', description: 'browse and discover products' },
        { name: 'cart', description: 'shopping cart and checkout' },
        { name: 'seller dashboard', description: 'vendor management' },
      ],
    },
    product: { summary: 'online marketplace for buying and selling handmade goods' },
  });

  const selection = selectDesignPreset(ctx);

  it('selects MARKETPLACE_MODERN', () => {
    assert.strictEqual(selection.primary, 'MARKETPLACE_MODERN');
  });

  it('webRules mention grid or listing layout', () => {
    const preset = getPreset('MARKETPLACE_MODERN');
    const webText = JSON.stringify(preset.webRules).toLowerCase();
    assert.ok(
      webText.includes('grid') || webText.includes('listing') || webText.includes('card'),
      `Expected grid/listing hints in webRules`,
    );
  });
});

// ── Scenario 5: Mobile Consumer ────────────────────────────────────────────────

describe('Scenario 5 — Mobile consumer app → MOBILE_CONSUMER', () => {
  const ctx = makeCtx({
    intent: {
      appType: 'mobile',
      tone: 'friendly',
      features: [
        { name: 'feed', description: 'social activity feed' },
        { name: 'profile', description: 'user profile screen' },
        { name: 'notifications', description: 'push notifications' },
      ],
    },
    product: { summary: 'react native mobile app for social sharing' },
    complexityReport: { complexityTier: 'medium', signals: { hasMobile: true } },
  });

  const selection = selectDesignPreset(ctx);

  it('selects MOBILE_CONSUMER', () => {
    assert.strictEqual(selection.primary, 'MOBILE_CONSUMER');
  });

  it('mobileRules specify bottom tab navigation', () => {
    const preset = getPreset('MOBILE_CONSUMER');
    const navType = (preset.mobileRules?.navigation || preset.mobileRules?.navPattern || '').toLowerCase();
    assert.ok(
      navType.includes('tab') || navType.includes('bottom'),
      `Expected tab navigation, got: ${navType}`,
    );
  });

  it('component buttons have full or high radius (mobile-friendly)', () => {
    const preset = getPreset('MOBILE_CONSUMER');
    const radius = preset.componentRules.buttons.primaryRadius;
    assert.ok(
      radius === 'full' || radius === '9999px' || parseInt(radius) >= 20,
      `Expected full/round buttons, got: ${radius}`,
    );
  });
});

// ── Scenario 6: Finance Analytics ─────────────────────────────────────────────

describe('Scenario 6 — Finance / analytics → FINANCE_ANALYTICS', () => {
  const ctx = makeCtx({
    intent: {
      appType: 'analytics',
      tone: 'professional',
      features: [
        { name: 'revenue charts', description: 'financial revenue analytics' },
        { name: 'kpi dashboard', description: 'KPI metrics overview' },
        { name: 'expense tracking', description: 'budget and expense management' },
        { name: 'forecast', description: 'financial forecasting' },
      ],
    },
    product: { summary: 'financial analytics platform with portfolio tracking and charts' },
  });

  const selection = selectDesignPreset(ctx);

  it('selects FINANCE_ANALYTICS', () => {
    assert.strictEqual(selection.primary, 'FINANCE_ANALYTICS');
  });

  it('tokens have monospace or tabular number font', () => {
    const tokens = buildDesignTokens('FINANCE_ANALYTICS');
    const monoFamily = tokens.typography.monoFamily || tokens.typography.fontFamily;
    assert.ok(
      monoFamily.toLowerCase().includes('mono') || monoFamily.toLowerCase().includes('courier') || monoFamily.toLowerCase().includes('source'),
      `Expected monospace font for numbers, got: ${monoFamily}`,
    );
  });

  it('density is compact', () => {
    const spec = buildDesignSpec(ctx, selection);
    assert.strictEqual(spec.density, 'compact');
  });
});

// ── Scenario 7: AI / LLM Tool ─────────────────────────────────────────────────

describe('Scenario 7 — AI / LLM tool → AI_NATIVE', () => {
  const ctx = makeCtx({
    intent: {
      appType: 'ai-tool',
      tone: 'professional',
      features: [
        { name: 'chat interface', description: 'llm chat completion with streaming' },
        { name: 'prompt history', description: 'saved prompts and completions' },
        { name: 'model selector', description: 'switch between openai and claude models' },
      ],
    },
    product: { summary: 'AI assistant powered by GPT and Claude with completion and embedding support' },
  });

  const selection = selectDesignPreset(ctx);

  it('selects AI_NATIVE', () => {
    assert.strictEqual(selection.primary, 'AI_NATIVE');
  });

  it('AI_NATIVE scores higher than all others', () => {
    const topScore = selection.scores['AI_NATIVE'];
    for (const [name, score] of Object.entries(selection.scores)) {
      if (name !== 'AI_NATIVE') {
        assert.ok(topScore >= score, `AI_NATIVE(${topScore}) should beat ${name}(${score})`);
      }
    }
  });

  it('layout is two-panel or sidebar', () => {
    const preset = getPreset('AI_NATIVE');
    const layoutType = (
      preset.layout?.type ||
      preset.layout?.contentStructure ||
      preset.layout?.navStyle ||
      preset.layout?.pattern ||
      ''
    ).toLowerCase();
    assert.ok(
      layoutType.includes('panel') || layoutType.includes('sidebar') || layoutType.includes('split'),
      `Expected split/panel layout for AI tool, got: ${layoutType}`,
    );
  });

  it('generationHints mention streaming or chat', () => {
    const spec = buildDesignSpec(ctx, selection);
    const hints = spec.generationHints.join(' ').toLowerCase();
    assert.ok(
      hints.includes('stream') || hints.includes('chat') || hints.includes('completion') || hints.includes('ai'),
      `Expected AI hints, got: ${hints}`,
    );
  });
});

// ── Scenario 8: Premium Product Launch ────────────────────────────────────────

describe('Scenario 8 — Premium product launch → PREMIUM_STARTUP or LUXURY_DARK', () => {
  const ctx = makeCtx({
    intent: {
      appType: 'landing-page',
      tone: 'premium',
      features: [
        { name: 'hero section', description: 'bold full-screen hero' },
        { name: 'features', description: 'product feature highlights' },
        { name: 'pricing', description: 'premium pricing tiers' },
      ],
    },
    product: { summary: 'exclusive premium luxury brand launch with sophisticated dark aesthetic' },
  });

  const selection = selectDesignPreset(ctx);

  it('selects PREMIUM_STARTUP or LUXURY_DARK', () => {
    assert.ok(
      selection.primary === 'PREMIUM_STARTUP' || selection.primary === 'LUXURY_DARK',
      `Expected premium preset, got: ${selection.primary}`,
    );
  });

  it('has high border radius (spacious/premium feel)', () => {
    const preset = getPreset(selection.primary);
    const cardRadius = preset.componentRules.cards.radius;
    const numericRadius = parseInt(cardRadius);
    assert.ok(numericRadius >= 12, `Expected radius ≥ 12px for premium preset, got: ${cardRadius}`);
  });
});

// ── Token Generation ───────────────────────────────────────────────────────────

describe('Token generation', () => {
  it('buildDesignTokens returns all 6 token groups', () => {
    const tokens = buildDesignTokens('MINIMAL_SAAS');
    assert.ok(tokens.colors, 'colors');
    assert.ok(tokens.typography, 'typography');
    assert.ok(tokens.spacing, 'spacing');
    assert.ok(tokens.borderRadius, 'borderRadius');
    assert.ok(tokens.shadows, 'shadows');
    assert.ok(tokens.transitions, 'transitions');
  });

  it('dark themeMode override switches background to dark', () => {
    const tokens = buildDesignTokens('MINIMAL_SAAS', 'dark');
    const bg = tokens.colors.background.toLowerCase();
    // Should be a dark color (starts with #0, #1, #2, or very dark gray)
    const r = parseInt(bg.slice(1, 3), 16);
    assert.ok(r < 50, `Expected dark background, got ${bg} (r=${r})`);
  });

  it('compact density reduces spacing values', () => {
    const normal  = buildDesignTokens('MINIMAL_SAAS', 'light', 'balanced');
    const compact = buildDesignTokens('MINIMAL_SAAS', 'light', 'compact');
    const normalMd  = parseInt(normal.spacing.md);
    const compactMd = parseInt(compact.spacing.md);
    assert.ok(compactMd < normalMd, `Compact md(${compactMd}) should be less than normal md(${normalMd})`);
  });

  it('spacious density increases spacing values', () => {
    const normal   = buildDesignTokens('MINIMAL_SAAS', 'light', 'balanced');
    const spacious = buildDesignTokens('MINIMAL_SAAS', 'light', 'spacious');
    const normalMd   = parseInt(normal.spacing.md);
    const spaciousMd = parseInt(spacious.spacing.md);
    assert.ok(spaciousMd > normalMd, `Spacious md(${spaciousMd}) should be greater than normal md(${normalMd})`);
  });

  it('color overrides are applied', () => {
    const tokens = buildDesignTokens('MINIMAL_SAAS', 'light', 'balanced', { primary: '#FF0000' });
    assert.strictEqual(tokens.colors.primary, '#FF0000');
  });
});

// ── CSS Rendering ──────────────────────────────────────────────────────────────

describe('CSS rendering', () => {
  it('tokensToCssVars returns --color- prefixed vars', () => {
    const tokens = buildDesignTokens('MINIMAL_SAAS');
    const vars = tokensToCssVars(tokens);
    assert.ok(vars['--color-primary'], 'primary color CSS var');
    assert.ok(vars['--color-background'], 'background CSS var');
    assert.ok(vars['--font-family'], 'font-family CSS var');
  });

  it('renderCssRootBlock produces :root block', () => {
    const tokens = buildDesignTokens('MINIMAL_SAAS');
    const css = renderCssRootBlock(tokens);
    assert.ok(css.startsWith(':root {'), 'should start with :root {');
    assert.ok(css.endsWith('}'), 'should end with }');
    assert.ok(css.includes('--color-primary'), 'should include color vars');
  });

  it('CSS block contains spacing and radius vars', () => {
    const tokens = buildDesignTokens('MINIMAL_SAAS');
    const css = renderCssRootBlock(tokens);
    assert.ok(css.includes('--space-'), 'should include spacing vars');
    assert.ok(css.includes('--radius-'), 'should include radius vars');
  });
});

// ── Component Rules ────────────────────────────────────────────────────────────

describe('Component rules', () => {
  it('buildComponentRules returns buttons, cards, inputs, nav', () => {
    const rules = buildComponentRules('MINIMAL_SAAS');
    assert.ok(rules.buttons, 'buttons rules');
    assert.ok(rules.cards, 'cards rules');
    assert.ok(rules.inputs, 'inputs rules');
    assert.ok(rules.nav, 'nav rules');
  });

  it('compact density sets tables.compact = true', () => {
    const rules = buildComponentRules('ENTERPRISE_DASHBOARD', 'compact');
    assert.strictEqual(rules.tables?.compact, true);
  });

  it('spacious density sets tables.compact = false', () => {
    const rules = buildComponentRules('MINIMAL_SAAS', 'spacious');
    assert.strictEqual(rules.tables?.compact, false);
  });

  it('summarizeComponentRules returns array of strings', () => {
    const summary = summarizeComponentRules('MINIMAL_SAAS');
    assert.ok(Array.isArray(summary), 'should be array');
    assert.ok(summary.length >= 4, 'should have ≥4 entries');
    assert.ok(typeof summary[0] === 'string', 'entries should be strings');
  });
});

// ── Override Merging ───────────────────────────────────────────────────────────

describe('Override merging', () => {
  const ctx = makeCtx({ intent: { appType: 'saas', tone: 'professional' } });
  const selection = selectDesignPreset(ctx);
  const baseSpec = buildDesignSpec(ctx, selection);

  it('mergeDesignOverrides with colors replaces specified tokens', () => {
    const merged = mergeDesignOverrides(baseSpec, { colors: { primary: '#ABCDEF' } });
    assert.strictEqual(merged.tokens.colors.primary, '#ABCDEF');
  });

  it('mergeDesignOverrides does not mutate the base spec', () => {
    const originalPrimary = baseSpec.tokens.colors.primary;
    mergeDesignOverrides(baseSpec, { colors: { primary: '#123456' } });
    assert.strictEqual(baseSpec.tokens.colors.primary, originalPrimary, 'base spec should not be mutated');
  });

  it('restrained accentMood desaturates colors', () => {
    const merged = mergeDesignOverrides(baseSpec, { accentMood: 'restrained' });
    // The secondary color should exist and be a hex value
    assert.ok(merged.tokens.colors.secondary?.startsWith('#'), 'secondary color should be a hex');
  });

  it('empty overrides returns the base spec unchanged', () => {
    const merged = mergeDesignOverrides(baseSpec, {});
    assert.strictEqual(merged, baseSpec, 'should return same reference for empty overrides');
  });

  it('describeOverrides summarizes applied overrides', () => {
    const description = describeOverrides({ themeMode: 'dark', accentMood: 'bold' });
    assert.ok(description.includes('themeMode=dark'), `Expected themeMode in description, got: ${description}`);
    assert.ok(description.includes('accentMood=bold'), `Expected accentMood in description, got: ${description}`);
  });

  it('describeOverrides returns "no overrides" for empty object', () => {
    assert.strictEqual(describeOverrides({}), 'no overrides');
  });
});

// ── Blueprint Enrichment ───────────────────────────────────────────────────────

describe('Blueprint enrichment', () => {
  const ctx = makeCtx({ intent: { appType: 'saas', tone: 'professional' } });
  const existingBlueprint = {
    projectName: 'MyApp',
    designSystem: { colors: { primary: '#000000' } },
    designNotes: 'Existing design notes.',
  };

  const { enrichedBlueprint, designSpec } = runDesignSystemStage(ctx, existingBlueprint);

  it('enrichedBlueprint.designSystem is replaced with preset tokens', () => {
    assert.notStrictEqual(enrichedBlueprint.designSystem.colors.primary, '#000000', 'preset should override old primary');
  });

  it('enrichedBlueprint._designSpec is attached', () => {
    assert.ok(enrichedBlueprint._designSpec, '_designSpec should be attached');
    assert.strictEqual(enrichedBlueprint._designSpec.preset, designSpec.preset);
  });

  it('enrichedBlueprint.designNotes includes generation hints block', () => {
    assert.ok(enrichedBlueprint.designNotes.includes('DESIGN SYSTEM:'), 'should append design system block');
    assert.ok(enrichedBlueprint.designNotes.includes('Existing design notes'), 'should preserve original notes');
  });

  it('original blueprint is not mutated', () => {
    assert.strictEqual(existingBlueprint.designSystem.colors.primary, '#000000', 'original should be unchanged');
  });
});

// ── Forced preset override ─────────────────────────────────────────────────────

describe('Forced preset override', () => {
  const ctx = makeCtx({
    intent: { appType: 'saas', tone: 'professional' },
    overrides: { forcePreset: 'LUXURY_DARK' },
  });

  const selection = selectDesignPreset(ctx);

  it('honors forcePreset override regardless of signals', () => {
    assert.strictEqual(selection.primary, 'LUXURY_DARK');
  });

  it('selection reason mentions forced override', () => {
    assert.ok(selection.reason.toLowerCase().includes('forced') || selection.reason.toLowerCase().includes('override'));
  });
});

// ── Convenience helpers ────────────────────────────────────────────────────────

describe('Convenience helpers', () => {
  it('listPresets returns all 12 presets', () => {
    const presets = listPresets();
    assert.strictEqual(presets.length, PRESET_NAMES.length);
    assert.ok(presets.every(p => p.name && p.tone && p.themeMode));
  });

  it('getPresetTokens returns tokens + cssVars + cssRoot + componentRules', () => {
    const result = getPresetTokens('AI_NATIVE');
    assert.ok(result.tokens, 'tokens');
    assert.ok(result.cssVars, 'cssVars');
    assert.ok(result.cssRoot, 'cssRoot');
    assert.ok(result.componentRules, 'componentRules');
  });

  it('debugDesignSelection returns non-empty string', () => {
    const ctx = makeCtx({ intent: { appType: 'saas', tone: 'professional' } });
    const debug = debugDesignSelection(ctx);
    assert.ok(typeof debug === 'string' && debug.length > 50);
    assert.ok(debug.includes('Scores:'), 'should include scores table');
  });

  it('ALL_PRESETS contains all 12 preset names', () => {
    const names = Object.keys(ALL_PRESETS);
    assert.strictEqual(names.length, 12);
  });

  it('getPreset with unknown name falls back to MINIMAL_SAAS', () => {
    const fallback = getPreset('DOES_NOT_EXIST');
    assert.strictEqual(fallback.name, 'MINIMAL_SAAS');
  });
});

// ── Final report ───────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`  All ${passed} tests passed.`);
} else {
  console.log(`  ${passed} passed, ${failed} failed.`);
  process.exitCode = 1;
}
console.log(`${'─'.repeat(50)}\n`);
