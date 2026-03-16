'use strict';

/**
 * Advanced AI Cost Optimizer — Test Suite
 *
 * Covers all 11 modules and 16 optimization strategies:
 *   1.  Prompt deduplication
 *   2.  Prompt compression
 *   3.  Context window pruning
 *   4.  Cache manager (stage result caching)
 *   5.  Smart pass skipping
 *   6.  Token budget management
 *   7.  Model tier selection
 *   8.  Intent diff analysis
 *   9.  Pipeline cost tracking
 *   10. Optimizer session (createOptimizerSession)
 *   11. UI cost payload (buildUiCostPayload)
 */

const {
  // Prompt optimization
  estimatePromptTokens, compressPrompt, compressIfNeeded, truncateToTokenLimit,
  // Deduplication
  hashPrompt, getDedupResult, cacheDedupResult, hasDedupResult, clearDedupCache, getDeduplicationStats,
  // Context pruning
  pruneContextForTask, slicePromptByTask, estimateContextSize, pruneFileContext,
  // Cache manager
  CacheManager, getCachedResult, setCachedResult, hasCachedResult, sharedCache,
  // Pass skipping
  shouldSkipPass, markPassComplete, isPassComplete, getPassOutput, resetPassTracker, getSkippableStages,
  // Token budget
  getBudgetForStage, isWithinBudget, getTotalPipelineBudget, enforceTokenBudget, buildBudgetSummary,
  // Model selection
  MODEL_TIERS, STAGE_TIER_MAP, selectModelForStage, selectModelForTask, getModelInfo, calculateModelSavings,
  // Intent diff
  computeIntentDiff, isIntentChanged, getAffectedStages, summarizeIntentDiff, GENERATIVE_FIELDS,
  // Cost tracking
  createPipelineCostTracker, STAGE_BASELINE_TOKENS,
  // Primary API
  createOptimizerSession, buildUiCostPayload,
} = require('../../src/lib/cost-optimizer');

// ── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function describe(label, fn) { console.log(`\n  ${label}`); fn(); }

function it(label, fn) {
  try {
    fn();
    console.log(`    ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`    ✗ ${label}\n      ${err.message}`);
    failed++;
    failures.push({ label, error: err.message });
  }
}

function assert(cond, msg)    { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, m) { if (a !== b) throw new Error(m || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertGt(a, b, m)    { if (a <= b) throw new Error(m || `Expected ${a} > ${b}`); }
function assertLt(a, b, m)    { if (a >= b) throw new Error(m || `Expected ${a} < ${b}`); }
function assertRange(v, lo, hi, m) { assert(v >= lo && v <= hi, m || `Expected ${v} in [${lo}, ${hi}]`); }
function assertIncludes(arr, v, m) { assert(Array.isArray(arr) && arr.includes(v), m || `Expected array to include ${v}`); }

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 1 — Prompt token estimation', () => {
  it('empty string returns 0', () => {
    assertEqual(estimatePromptTokens(''), 0);
  });

  it('null / undefined returns 0', () => {
    assertEqual(estimatePromptTokens(null),      0);
    assertEqual(estimatePromptTokens(undefined),  0);
  });

  it('estimates ~1 token per 4 chars', () => {
    const text = 'a'.repeat(400);
    assertEqual(estimatePromptTokens(text), 100);
  });

  it('longer prompts produce higher estimates', () => {
    const short = 'Hello world';
    const long  = 'Hello world '.repeat(100);
    assertGt(estimatePromptTokens(long), estimatePromptTokens(short));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 2 — Prompt compression', () => {
  it('returns original tokens and compressed tokens', () => {
    const result = compressPrompt('Please ensure that you write clean code.');
    assert(result.originalTokens > 0, 'originalTokens should be > 0');
    assert(result.compressedTokens > 0, 'compressedTokens should be > 0');
    assert('saved' in result, 'result should have saved field');
  });

  it('strips filler phrases and reduces token count', () => {
    const padded = 'Please ensure that you note that Please note that the app must have auth. Make sure to add login.';
    const result = compressPrompt(padded);
    assertGt(result.originalTokens, result.compressedTokens, 'compression should reduce tokens');
    assertGt(result.saved, 0, 'saved should be > 0');
  });

  it('deduplicates adjacent identical lines', () => {
    const text = 'Add a login page.\nAdd a login page.\nAdd a login page.';
    const result = compressPrompt(text);
    assertGt(result.saved, 0, 'should save tokens by deduplicating lines');
  });

  it('does not change semantically significant content', () => {
    const important = 'Build a booking platform with authentication, payments, and email.';
    const result    = compressPrompt(important);
    assert(result.compressed.includes('booking'), 'core content preserved');
    assert(result.compressed.includes('authentication'), 'auth preserved');
    assert(result.compressed.includes('payments'), 'payments preserved');
  });

  it('compressIfNeeded: skips compression if already within limit', () => {
    const short  = 'Short prompt.';
    const result = compressIfNeeded(short, 10000);
    assertEqual(result.wasCompressed, false, 'should not compress short prompts');
    assertEqual(result.prompt, short);
  });

  it('compressIfNeeded: compresses when over limit', () => {
    const long   = 'Make sure to ' + 'a'.repeat(5000);
    const result = compressIfNeeded(long, 100);
    assertEqual(result.wasCompressed, true, 'should compress large prompts');
  });

  it('truncateToTokenLimit: truncates oversize prompts and appends notice', () => {
    const big       = 'word '.repeat(5000);
    const truncated = truncateToTokenLimit(big, 50);
    assert(truncated.includes('[...truncated'), 'should include truncation notice');
    assertLt(estimatePromptTokens(truncated), estimatePromptTokens(big), 'should be smaller');
  });

  it('large prompt triggers compression — strategy confirmed', () => {
    // Simulates: large prompt → compression triggered
    const bigPrompt = 'Please ensure that you ' + 'build a complex SaaS app. '.repeat(200);
    const { wasCompressed, tokensSaved } = compressIfNeeded(bigPrompt, 500);
    assertEqual(wasCompressed, true, 'large prompt should trigger compression');
    assertGt(tokensSaved, 0, 'tokens should be saved');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 3 — Prompt deduplication (cache hit on repeated prompt)', () => {
  it('hashPrompt returns 16-char hex string', () => {
    const h = hashPrompt('Hello world');
    assertEqual(h.length, 16, 'hash should be 16 chars');
    assert(/^[0-9a-f]+$/.test(h), 'hash should be hex');
  });

  it('identical prompts produce the same hash', () => {
    assertEqual(hashPrompt('build a todo app'), hashPrompt('build a todo app'));
  });

  it('different prompts produce different hashes', () => {
    assert(hashPrompt('todo app') !== hashPrompt('booking app'), 'hashes should differ');
  });

  it('prompt repeated → cache used (core dedup scenario)', () => {
    clearDedupCache();
    const prompt = 'Build me a landing page for my startup.';
    const result = { files: { 'index.html': '<html/>' } };

    // First lookup — should be a miss
    const miss = getDedupResult(prompt);
    assertEqual(miss, null, 'first lookup should be a miss');

    // Store the result
    cacheDedupResult(prompt, result);

    // Second lookup — should be a hit
    const hit = getDedupResult(prompt);
    assert(hit !== null, 'second lookup should be a hit');
    assertEqual(hit.fromCache, true, 'hit should have fromCache=true');
    assertEqual(hit.result, result, 'cached result should match stored value');
  });

  it('hasDedupResult returns false before caching, true after', () => {
    clearDedupCache();
    const p = 'unique-prompt-' + Date.now();
    assertEqual(hasDedupResult(p), false, 'should be false before caching');
    cacheDedupResult(p, { ok: true });
    assertEqual(hasDedupResult(p), true, 'should be true after caching');
  });

  it('getDeduplicationStats returns hit rate stats', () => {
    clearDedupCache();
    const stats = getDeduplicationStats();
    assert('totalLookups' in stats, 'should have totalLookups');
    assert('cacheHits'    in stats, 'should have cacheHits');
    assert('hitRate'      in stats, 'should have hitRate');
    assert('cacheSize'    in stats, 'should have cacheSize');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 4 — Context pruning', () => {
  it('pruneContextForTask removes irrelevant keys', () => {
    const ctx = {
      designSystem: 'fonts and colors',
      components:   'button, nav',
      apiRoutes:    '/api/users',
      dbSchema:     'users table',
    };
    const { pruned, removedKeys } = pruneContextForTask(ctx, 'ui');
    assert('designSystem' in pruned, 'design key should be kept for ui task');
    assert('components'   in pruned, 'components key should be kept');
    assert(removedKeys.length > 0,   'should have removed backend keys');
  });

  it('pruneContextForTask for backend removes ui keys', () => {
    const ctx = {
      apiRoutes:  '/api/users GET',
      dbSchema:   'users table',
      colorTheme: 'blue and white',
      fonts:      'Inter',
    };
    const { pruned } = pruneContextForTask(ctx, 'backend');
    assert('apiRoutes' in pruned, 'api routes kept for backend');
    assert(!('colorTheme' in pruned), 'color theme removed for backend task');
  });

  it('tokensSaved is > 0 when content is pruned', () => {
    const ctx = {
      designSystem: 'a'.repeat(4000),
      apiRoutes:    '/api/data',
      models:       'User model',
    };
    const { tokensSaved } = pruneContextForTask(ctx, 'backend');
    assertGt(tokensSaved, 0, 'should save tokens by removing design context');
  });

  it('pruneFileContext stubs large files and tracks savings', () => {
    const files = {
      'big.js':   'x'.repeat(10000),
      'small.js': 'console.log("hi");',
    };
    const { pruned, stubCount, tokensSaved } = pruneFileContext(files, 500);
    assertEqual(stubCount, 1, 'one file should be stubbed');
    assertGt(tokensSaved, 0,  'tokens should be saved');
    assert(pruned['big.js'].includes('[big.js:'), 'stub should reference filename');
    assertEqual(pruned['small.js'], 'console.log("hi");', 'small file unchanged');
  });

  it('estimateContextSize returns token count for objects', () => {
    const ctx    = { key: 'a'.repeat(400) };
    const tokens = estimateContextSize(ctx);
    assertGt(tokens, 90, 'should count tokens in serialized JSON');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 5 — Stage cache (generation result caching)', () => {
  it('getCachedResult returns null for unknown stage+input', () => {
    const result = getCachedResult('complexity', { prompt: 'unique-' + Date.now() });
    assertEqual(result, null, 'unknown key should return null');
  });

  it('setCachedResult + getCachedResult round-trips correctly', () => {
    const inputs = { prompt: 'build a calculator', mode: 'balanced' };
    const value  = { level: 'simple', score: 0 };
    setCachedResult('complexity', inputs, value);
    const retrieved = getCachedResult('complexity', inputs);
    assert(retrieved !== null,                 'should retrieve cached value');
    assertEqual(retrieved.level, 'simple',     'level should match');
    assertEqual(retrieved.score, 0,            'score should match');
  });

  it('hasCachedResult returns true after storing', () => {
    const inputs = { prompt: 'test-' + Date.now() };
    assertEqual(hasCachedResult('blueprint', inputs), false, 'should be false initially');
    setCachedResult('blueprint', inputs, { ok: true });
    assertEqual(hasCachedResult('blueprint', inputs), true, 'should be true after storing');
  });

  it('CacheManager.stats tracks hits and misses', () => {
    const cm  = new CacheManager();
    const key = cm.buildKey('test', { x: 1 });
    cm.get(key);  // miss
    cm.set(key, 'value', 'default');
    cm.get(key);  // hit
    const stats = cm.stats();
    assertEqual(stats.hits,   1, 'should count 1 hit');
    assertEqual(stats.misses, 1, 'should count 1 miss');
    assertEqual(stats.size,   1, 'should have 1 entry');
  });

  it('CacheManager respects TTL and expires entries', () => {
    const cm  = new CacheManager();
    const key = cm.buildKey('test', { x: 2 });
    // Set with 1ms TTL
    cm.set(key, 'temp', 'default', 1);
    // Manually expire
    const entry = cm._store.get(key);
    if (entry) entry.expiresAt = Date.now() - 1;
    const val = cm.get(key);
    assertEqual(val, null, 'expired entry should return null');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 6 — Smart pass skipping', () => {
  it('intent unchanged → pass skipped (core skip scenario)', () => {
    const emptyDiff = { changedFields: [], addedFeatures: [], removedFeatures: [], isFirstPrompt: false, affectedStages: [] };
    const result = shouldSkipPass('css-design', emptyDiff, { hasCached: true, mode: 'balanced' });
    assertEqual(result.skip, true, 'should skip when intent unchanged and cached');
  });

  it('no cache → no skip even if intent unchanged', () => {
    const emptyDiff = { changedFields: [], addedFeatures: [], removedFeatures: [], isFirstPrompt: false, affectedStages: [] };
    const result = shouldSkipPass('css-design', emptyDiff, { hasCached: false, mode: 'balanced' });
    assertEqual(result.skip, false, 'cannot skip without a cached output');
  });

  it('intent changed in relevant field → no skip', () => {
    const diff = { changedFields: ['designIntent'], addedFeatures: [], removedFeatures: [], isFirstPrompt: false, affectedStages: ['css-design'] };
    const result = shouldSkipPass('css-design', diff, { hasCached: true, mode: 'balanced' });
    assertEqual(result.skip, false, 'should not skip when design intent changed');
  });

  it('intent changed in irrelevant field → still skip', () => {
    // billingRequired does NOT affect css-design
    const diff = { changedFields: ['billingRequired'], addedFeatures: [], removedFeatures: [], isFirstPrompt: false, affectedStages: ['js-core', 'billing'] };
    const result = shouldSkipPass('css-design', diff, { hasCached: true, mode: 'balanced' });
    assertEqual(result.skip, true, 'css-design unaffected by billing change');
  });

  it('mandatory stages (validation, repair, ranking) are never skipped', () => {
    const emptyDiff = { changedFields: [], addedFeatures: [], removedFeatures: [], isFirstPrompt: false, affectedStages: [] };
    for (const stage of ['validation', 'repair', 'ranking']) {
      const result = shouldSkipPass(stage, emptyDiff, { hasCached: true });
      assertEqual(result.skip, false, `${stage} should never be skipped`);
    }
  });

  it('fast mode skips non-core stages when cached', () => {
    const emptyDiff = { changedFields: [], addedFeatures: [], removedFeatures: [], isFirstPrompt: false, affectedStages: [] };
    const result = shouldSkipPass('polish', emptyDiff, { hasCached: true, mode: 'fast' });
    assertEqual(result.skip, true, 'polish should be skipped in fast mode');
  });

  it('markPassComplete / isPassComplete / getPassOutput round-trip', () => {
    resetPassTracker();
    assertEqual(isPassComplete('blueprint'), false, 'not complete before marking');
    markPassComplete('blueprint', { files: [] });
    assertEqual(isPassComplete('blueprint'),   true,    'complete after marking');
    assert(getPassOutput('blueprint') !== null,          'output retrievable');
  });

  it('getSkippableStages returns list when intent unchanged', () => {
    const emptyDiff = { changedFields: [], addedFeatures: [], removedFeatures: [], isFirstPrompt: false, affectedStages: [] };
    const allStages = ['intent-analysis', 'css-design', 'product-planning', 'blueprint'];
    const skippable = getSkippableStages('balanced', emptyDiff, allStages);
    assert(skippable.includes('css-design'), 'css-design should be skippable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 7 — Token budget management', () => {
  it('getBudgetForStage returns non-negative values for all modes', () => {
    for (const mode of ['fast', 'balanced', 'quality']) {
      const { maxOutputTokens, scaledTokens } = getBudgetForStage('html-scaffold', mode, 'medium');
      assert(maxOutputTokens >= 0, `maxOutputTokens should be >= 0 for ${mode}`);
      assert(scaledTokens >= 0,    `scaledTokens should be >= 0 for ${mode}`);
    }
  });

  it('quality mode has higher budgets than fast mode', () => {
    const fast    = getBudgetForStage('html-scaffold', 'fast',    'medium');
    const quality = getBudgetForStage('html-scaffold', 'quality', 'medium');
    assertGt(quality.scaledTokens, fast.scaledTokens, 'quality should have larger budget');
  });

  it('complex projects get larger budgets than simple ones', () => {
    const simple  = getBudgetForStage('js-core', 'balanced', 'simple');
    const complex = getBudgetForStage('js-core', 'balanced', 'complex');
    assertGt(complex.scaledTokens, simple.scaledTokens, 'complex should have bigger budget');
  });

  it('isWithinBudget returns true for small token counts', () => {
    assertEqual(isWithinBudget(100, 'html-scaffold', 'balanced', 'medium'), true);
  });

  it('isWithinBudget returns false for oversized counts on small stages', () => {
    assertEqual(isWithinBudget(99999, 'normalization', 'balanced', 'medium'), false);
  });

  it('static stages (validation, ranking) have zero budget (no LLM)', () => {
    const { maxOutputTokens: v } = getBudgetForStage('validation', 'balanced', 'medium');
    const { maxOutputTokens: r } = getBudgetForStage('ranking',    'balanced', 'medium');
    assertEqual(v, 0, 'validation has no LLM budget');
    assertEqual(r, 0, 'ranking has no LLM budget');
  });

  it('enforceTokenBudget truncates and appends notice', () => {
    const text     = 'word '.repeat(2000);
    const { text: out, wasTruncated } = enforceTokenBudget(text, 100);
    assertEqual(wasTruncated, true, 'should truncate');
    assert(out.includes('[truncated]'), 'should include truncation notice');
    assertLt(estimatePromptTokens(out), estimatePromptTokens(text), 'output is smaller');
  });

  it('getTotalPipelineBudget increases with mode', () => {
    const fast    = getTotalPipelineBudget('fast',    'medium');
    const quality = getTotalPipelineBudget('quality', 'medium');
    assertGt(quality, fast, 'quality total should be higher');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 8 — Model tier selection (small task → small model)', () => {
  it('normalization uses small model in balanced mode', () => {
    const result = selectModelForStage('normalization', { mode: 'balanced', complexityLevel: 'medium' });
    assertEqual(result.tier, 'small', 'normalization should use haiku');
    assertEqual(result.modelId, MODEL_TIERS.small.id);
  });

  it('code generation uses medium model in balanced mode', () => {
    const result = selectModelForStage('html-scaffold', { mode: 'balanced', complexityLevel: 'medium' });
    assertEqual(result.tier, 'medium', 'html-scaffold should use sonnet');
    assertEqual(result.modelId, MODEL_TIERS.medium.id);
  });

  it('quality mode enforces medium minimum across all stages', () => {
    const result = selectModelForStage('normalization', { mode: 'quality' });
    assert(result.tier === 'medium' || result.tier === 'large', 'should be at least medium in quality mode');
  });

  it('fast mode: code stages stay medium, others use small', () => {
    const code   = selectModelForStage('js-core',       { mode: 'fast' });
    const norm   = selectModelForStage('normalization', { mode: 'fast' });
    assertEqual(code.tier,  'medium', 'js-core stays medium in fast mode');
    assertEqual(norm.tier,  'small',  'normalization uses small in fast mode');
  });

  it('selectModelForTask returns small model for classification tasks', () => {
    const model = selectModelForTask('complexity classification', 'simple');
    assertEqual(model, MODEL_TIERS.small.id, 'classification should use haiku');
  });

  it('selectModelForTask returns medium model for code generation tasks', () => {
    const model = selectModelForTask('generate React components', 'medium');
    assertEqual(model, MODEL_TIERS.medium.id, 'code generation should use sonnet');
  });

  it('calculateModelSavings shows savings when using small vs medium', () => {
    const { savings, savingsPercent } = calculateModelSavings('normalization', 1000, 300, 'small');
    assertGt(savings, 0,        'should save money using smaller model');
    assertGt(savingsPercent, 0, 'savings percent should be > 0');
  });

  it('getModelInfo returns correct pricing for each tier', () => {
    const small  = getModelInfo('small');
    const medium = getModelInfo('medium');
    const large  = getModelInfo('large');
    assertGt(medium.inputCostPer1M,  small.inputCostPer1M,  'medium costs more than small');
    assertGt(large.inputCostPer1M,   medium.inputCostPer1M, 'large costs more than medium');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 9 — Intent diff analysis', () => {
  it('first prompt (no prev) returns isFirstPrompt=true with all fields changed', () => {
    const diff = computeIntentDiff(null, { appType: 'todo', coreFeatures: ['tasks'] });
    assertEqual(diff.isFirstPrompt, true, 'should be first prompt');
    assertGt(diff.changedFields.length, 0, 'should show all fields as changed');
  });

  it('identical intent → no changes → isIntentChanged returns false', () => {
    const intent = { appType: 'todo', appGoal: 'manage tasks', coreFeatures: ['tasks', 'auth'] };
    assertEqual(isIntentChanged(intent, { ...intent }), false, 'identical intent should not differ');
  });

  it('added feature detected in diff', () => {
    const prev    = { coreFeatures: ['tasks'] };
    const current = { coreFeatures: ['tasks', 'auth'] };
    const diff    = computeIntentDiff(prev, current);
    assertIncludes(diff.addedFeatures, 'auth', 'auth should appear in addedFeatures');
    assertIncludes(diff.changedFields, 'coreFeatures', 'coreFeatures should be in changedFields');
  });

  it('removed feature detected in diff', () => {
    const prev    = { coreFeatures: ['tasks', 'billing'] };
    const current = { coreFeatures: ['tasks'] };
    const diff    = computeIntentDiff(prev, current);
    assertIncludes(diff.removedFeatures, 'billing', 'billing should appear in removedFeatures');
  });

  it('design change flags designChanged', () => {
    const diff = computeIntentDiff({ designIntent: 'minimal' }, { designIntent: 'luxury' });
    assertEqual(diff.designChanged, true, 'designChanged should be true');
  });

  it('auth change flags authChanged', () => {
    const diff = computeIntentDiff({ authRequired: false }, { authRequired: true });
    assertEqual(diff.authChanged, true, 'authChanged should be true');
  });

  it('getAffectedStages returns css-design when designIntent changes', () => {
    const stages = getAffectedStages(['designIntent']);
    assertIncludes(stages, 'css-design',    'css-design affected by design change');
    assertIncludes(stages, 'blueprint',     'blueprint affected by design change');
  });

  it('getAffectedStages returns billing stage when billingRequired changes', () => {
    const stages = getAffectedStages(['billingRequired']);
    assertIncludes(stages, 'billing',   'billing stage affected');
    assertIncludes(stages, 'js-core',   'js-core affected by billing');
  });

  it('summarizeIntentDiff returns informative string for changes', () => {
    const diff = computeIntentDiff({ coreFeatures: ['tasks'] }, { coreFeatures: ['tasks', 'auth'] });
    const str  = summarizeIntentDiff(diff);
    assert(typeof str === 'string' && str.length > 0, 'summary should be non-empty string');
    assert(str.includes('auth'), 'summary should mention auth feature');
  });

  it('summarizeIntentDiff returns no-change message for identical intents', () => {
    const intent = { appType: 'todo', coreFeatures: ['tasks'] };
    const str    = summarizeIntentDiff(computeIntentDiff(intent, { ...intent }));
    assertEqual(str, 'No intent changes detected');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 10 — Pipeline cost tracking', () => {
  it('trackStage accumulates actual tokens', () => {
    const tracker = createPipelineCostTracker();
    tracker.trackStage('html-scaffold', 6000);
    tracker.trackStage('js-core',       8000);
    const report = tracker.buildCostReport();
    assertEqual(report.totalTokensUsed, 14000, 'total should be sum of stage tokens');
  });

  it('recordSavings reduces relative cost', () => {
    const tracker = createPipelineCostTracker();
    tracker.trackStage('css-design',   4000);
    tracker.recordSavings('css-design', 2000, 'prompt-compression');
    const report = tracker.buildCostReport();
    assertGt(report.tokensSaved, 0, 'should report saved tokens');
  });

  it('recordSkip uses baseline estimate for savings', () => {
    const tracker  = createPipelineCostTracker();
    const baseline = STAGE_BASELINE_TOKENS['admin-ops'] || 0;
    tracker.recordSkip('admin-ops', 'admin not required');
    const report = tracker.buildCostReport();
    assertEqual(report.tokensSaved, baseline, 'skip savings should match baseline');
  });

  it('buildCostReport includes all tracked stages', () => {
    const tracker = createPipelineCostTracker();
    tracker.trackStage('blueprint',    2000);
    tracker.recordSkip('admin-ops',    'not needed');
    const report = tracker.buildCostReport();
    assert('blueprint'  in report.costByStage, 'blueprint in report');
    assert('admin-ops'  in report.costByStage, 'admin-ops in report');
  });

  it('savingsPercent is 0–100', () => {
    const tracker = createPipelineCostTracker();
    tracker.trackStage('js-core', 8000);
    tracker.recordSavings('js-core', 2000, 'cache-hit');
    const report = tracker.buildCostReport();
    assertRange(report.savingsPercent, 0, 100, 'savingsPercent should be 0–100');
  });

  it('strategiesApplied lists unique strategy names', () => {
    const tracker = createPipelineCostTracker();
    tracker.trackStage('html-scaffold', 5000, { strategies: ['prompt-compression'] });
    tracker.recordSavings('css-design', 1000, 'context-pruning');
    const report = tracker.buildCostReport();
    assert(Array.isArray(report.strategiesApplied), 'strategiesApplied should be array');
    assertIncludes(report.strategiesApplied, 'prompt-compression');
    assertIncludes(report.strategiesApplied, 'context-pruning');
  });

  it('getSavingsSoFar returns running totals', () => {
    const tracker = createPipelineCostTracker();
    tracker.trackStage('blueprint', 2000);
    tracker.recordSavings('blueprint', 500, 'compression');
    const { totalSaved, totalActual } = tracker.getSavingsSoFar();
    assertEqual(totalActual, 2000, 'actual tokens tracked');
    assertEqual(totalSaved,   500, 'saved tokens tracked');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 11 — Optimizer session (createOptimizerSession)', () => {
  it('session is created without error', () => {
    const session = createOptimizerSession({ mode: 'balanced', complexityLevel: 'medium' });
    assert(session !== null, 'session should not be null');
    assertEqual(session.mode, 'balanced');
    assertEqual(session.complexityLevel, 'medium');
  });

  it('session exposes intentDiff', () => {
    const prev    = { appType: 'todo', coreFeatures: ['tasks'] };
    const current = { appType: 'todo', coreFeatures: ['tasks', 'auth'] };
    const session = createOptimizerSession({ prevIntentMemory: prev, currentIntentMemory: current });
    assert(session.intentDiff !== null, 'intentDiff should be computed');
    assertIncludes(session.intentDiff.addedFeatures, 'auth', 'auth added');
  });

  it('session.selectModel returns correct tier for stage', () => {
    const session = createOptimizerSession({ mode: 'balanced' });
    const model   = session.selectModel('normalization');
    assertEqual(model.tier, 'small', 'normalization should use small model');
  });

  it('session.shouldSkip returns skip=true when intent unchanged and cached', () => {
    const session = createOptimizerSession({
      prevIntentMemory:    { appType: 'todo' },
      currentIntentMemory: { appType: 'todo' },
    });
    const { skip } = session.shouldSkip('css-design', { hasCached: true });
    assertEqual(skip, true, 'css-design skippable when unchanged');
  });

  it('session.budget returns positive budget for code stages', () => {
    const session = createOptimizerSession({ mode: 'quality', complexityLevel: 'complex' });
    const { scaledTokens } = session.budget('html-scaffold');
    assertGt(scaledTokens, 0, 'quality+complex should have large budget');
  });

  it('session.buildCostReport is callable and returns valid shape', () => {
    const session = createOptimizerSession();
    session.trackStage('blueprint',  2000);
    session.recordSavings('blueprint', 500, 'compression');
    const report = session.buildCostReport();
    assert('totalTokensUsed'     in report, 'has totalTokensUsed');
    assert('totalCostEstimate'   in report, 'has totalCostEstimate');
    assert('optimizationSavings' in report, 'has optimizationSavings');
    assert('savingsPercent'      in report, 'has savingsPercent');
    assert('strategiesApplied'   in report, 'has strategiesApplied');
  });

  it('session.intentDiffSummary returns string', () => {
    const session = createOptimizerSession({
      prevIntentMemory:    { coreFeatures: ['tasks'] },
      currentIntentMemory: { coreFeatures: ['tasks', 'billing'] },
    });
    const summary = session.intentDiffSummary();
    assert(typeof summary === 'string' && summary.length > 0, 'should return non-empty summary');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 12 — buildUiCostPayload', () => {
  it('returns null for null input', () => {
    assertEqual(buildUiCostPayload(null), null);
  });

  it('returns expected shape for valid report', () => {
    const tracker = createPipelineCostTracker();
    tracker.trackStage('html-scaffold', 6000, { strategies: ['context-pruning'] });
    tracker.recordSavings('css-design',  2000, 'prompt-compression');
    tracker.recordSkip('admin-ops', 'admin not required');
    const report  = tracker.buildCostReport();
    const payload = buildUiCostPayload(report);

    assert('totalTokens'       in payload, 'has totalTokens');
    assert('estimatedCostUSD'  in payload, 'has estimatedCostUSD');
    assert('savingsUSD'        in payload, 'has savingsUSD');
    assert('savingsPercent'    in payload, 'has savingsPercent');
    assert('tokensSaved'       in payload, 'has tokensSaved');
    assert('strategiesApplied' in payload, 'has strategiesApplied');
    assert('stageBreakdown'    in payload, 'has stageBreakdown');
  });

  it('stageBreakdown has correct shape per stage', () => {
    const tracker = createPipelineCostTracker();
    tracker.trackStage('js-core', 8000);
    const payload = buildUiCostPayload(tracker.buildCostReport());
    const stage   = payload.stageBreakdown['js-core'];
    assert(stage !== undefined,           'js-core should be in stageBreakdown');
    assert('tokens'  in stage,            'should have tokens');
    assert('saved'   in stage,            'should have saved');
    assert('skipped' in stage,            'should have skipped');
  });

  it('savingsPercent is 0–100', () => {
    const tracker = createPipelineCostTracker();
    tracker.trackStage('html-scaffold', 5000);
    tracker.recordSavings('html-scaffold', 1000, 'context-pruning');
    const payload = buildUiCostPayload(tracker.buildCostReport());
    assertRange(payload.savingsPercent, 0, 100, 'savingsPercent in range');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 13 — End-to-end optimization scenario', () => {
  it('full pipeline: compression + cache + skip + cost tracking', () => {
    clearDedupCache();

    // Step 1: user sends a large repeated prompt
    const prompt = 'Please ensure that you build a SaaS booking platform. ' +
                   'Make sure to add authentication. Note that it should have payments. '
                     .repeat(10);

    // Step 2: compress the prompt
    const { compressed, saved } = compressPrompt(prompt);
    assertGt(saved, 0, 'compression should save tokens');

    // Step 3: cache the compressed result (simulating first run)
    cacheDedupResult(compressed, { appType: 'booking', score: 72 });

    // Step 4: identical prompt on next request → cache hit
    const hit = getDedupResult(compressed);
    assert(hit !== null,        'cache should return a result');
    assertEqual(hit.fromCache, true, 'result should come from cache');

    // Step 5: intent is unchanged → css-design can be skipped
    const diff    = { changedFields: [], addedFeatures: [], removedFeatures: [], isFirstPrompt: false, affectedStages: [] };
    const { skip } = shouldSkipPass('css-design', diff, { hasCached: true, mode: 'balanced' });
    assertEqual(skip, true, 'css-design should be skippable');

    // Step 6: model selection for normalization → small model
    const model = selectModelForStage('normalization', { mode: 'balanced' });
    assertEqual(model.tier, 'small', 'normalization should use small model');

    // Step 7: cost tracker records everything
    const tracker = createPipelineCostTracker();
    tracker.recordSavings('normalization', saved,    'prompt-compression');
    tracker.recordSkip('css-design',                 'intent-unchanged');
    tracker.trackStage('html-scaffold',  5500, { strategies: ['context-pruning'] });

    const report = tracker.buildCostReport();
    assertGt(report.tokensSaved, 0,                         'tokens should be saved overall');
    assertGt(report.strategiesApplied.length, 0,            'strategies should be recorded');
    assert(report.tokensSaved >= saved,                      'savings >= compression savings');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

// Final summary
console.log('\n' + '─'.repeat(50));
if (failed === 0) {
  console.log(`  All ${passed} tests passed.`);
} else {
  console.log(`  ${passed} passed, ${failed} failed.`);
  failures.forEach(f => console.error(`    ✗ ${f.label}: ${f.error}`));
  process.exit(1);
}
console.log('─'.repeat(50) + '\n');
