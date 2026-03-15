'use strict';

/**
 * Quality-First Generation Pipeline Orchestrator
 *
 * Coordinates the 7-stage pipeline that transforms a user prompt into a complete,
 * validated, deployable web application. Optimised for output quality and
 * architectural correctness — not generation speed.
 *
 * Stage model choices (all Sonnet — Haiku is not used anywhere in this pipeline):
 *   1. Intent Analysis    (Sonnet, 1500 tok)  — explicit + implicit requirements, real copy
 *   2. Product Planning   (Sonnet, 2500 tok)  — complete page specs, forms, data models
 *   3. Architecture       (Sonnet, 1500 tok)  — file plan, CSS/JS architecture
 *   4. Blueprint          (Sonnet, 4000 tok)  — full design system, per-file contracts
 *   5a. [medium+] HTML scaffold      (Sonnet, 8-16k tok) — all HTML pages
 *   5b. [medium+] CSS design system  (Sonnet, 6-12k tok) — complete stylesheet from real HTML
 *   5c. [medium+] JavaScript core    (Sonnet, 8-20k tok) — data layer + all feature logic
 *   5d. [conditional] Admin/ops      (Sonnet, 6-10k tok) — admin pages + management UI
 *   5e. [conditional] Billing/integrations (Sonnet, 6-8k tok) — payments + third-party stubs
 *   5f. [advanced+] Polish/deployment (Sonnet, 4-6k tok) — README + .env.example
 *       [simple] Two-pass fallback   — HTML pass (16k) + CSS/JS pass (28k)
 *   6. Validation         (static)             — semantic + structural checks
 *   7. Repair             (Sonnet, 12000 tok)  — targeted fix of all issues found
 *
 * Activation criteria: mode !== 'fast' && complexity.level !== 'simple'
 */

const { analyzeIntent }             = require('./stages/intentAnalyzer');
const { planProduct }               = require('./stages/productPlanner');
const { planStack }                 = require('./stages/stackPlanner');
const { generateBlueprint }         = require('./stages/blueprintGenerator');
const { generateCode }              = require('./stages/codeGenerator');
const { validateOutput }            = require('./stages/validator');
const { repairFiles }               = require('./stages/repairEngine');
const { inferMissingRequirements }  = require('../lib/inference');
const { scoreAppComplexity, mergeComplexityIntoSpec } = require('../lib/complexity');
const { runMultiPassGeneration }    = require('../lib/generation/passes');
const { buildGeneratedProjectFiles } = require('../lib/file-generator');
const { validateGeneratedProject, summarizeValidationReport } = require('../lib/validator');
const { repairGeneratedProject, summarizeRepairReport }     = require('../lib/repair');
const { withTimeout }       = require('../utils/withTimeout');
const { slugify }           = require('../utils/slugify');
const limits                = require('../config/limits');
const logger                = require('../utils/logger');

/**
 * Returns true when the advanced pipeline should replace the legacy planner+coder flow.
 *
 * @param {string} mode
 * @param {{ level: string }} complexity
 * @returns {boolean}
 */
function shouldUseAdvancedPipeline(mode, complexity) {
  if (mode === 'fast')               return false; // user explicitly chose speed
  if (complexity.level === 'simple') return false; // templates handle simple prompts well
  return true; // all medium/complex prompts in balanced/quality mode
}

/**
 * Runs the full quality-first 7-stage pipeline.
 *
 * @param {string} userPrompt
 * @param {string} mode             - 'balanced' | 'quality'
 * @param {{ level: string, appType: string }} complexity
 * @param {object} cost             - cost tracker instance
 * @param {Function} [onProgress]   - (progress: { current, total, stage }) => void
 * @param {Function} [log]          - async (msg: string) => void — job log stream
 * @returns {Promise<import('./types').AdvancedGenerationResult>}
 */
async function runAdvancedPipeline(userPrompt, mode, complexity, cost, onProgress, log) {
  const emit = async (msg) => { try { if (log) await log(msg); } catch (_) {} };

  // ── Stage 1: Deep Intent Analysis ──────────────────────────────────────────
  await emit('Analysing requirements...');
  const intent = await _safe(
    withTimeout(
      analyzeIntent(userPrompt, cost, complexity),
      limits.INTENT_TIMEOUT_MS,
      'Intent analysis',
    ),
    _fallbackIntent(complexity),
    'intentAnalyzer',
  );
  logger.info(`advancedPipeline[1/7] intent: appType="${intent.appType}" features=${intent.features?.length} flows=${intent.userFlows?.length}`);

  // ── Stage 1.5: Missing Requirement Inference ────────────────────────────────
  const enrichedIntent = await _safe(
    withTimeout(
      inferMissingRequirements(intent, cost),
      limits.INFERENCE_TIMEOUT_MS,
      'Requirement inference',
    ),
    intent,
    'requirementInferrer',
  );
  logger.info(`advancedPipeline[1.5/7] inference: features=${enrichedIntent.features?.length} flows=${enrichedIntent.userFlows?.length}`);

  // ── Stage 1.8: App Complexity Scoring ───────────────────────────────────────
  const complexityReport = await _safe(
    withTimeout(
      scoreAppComplexity(enrichedIntent, cost),
      limits.COMPLEXITY_TIMEOUT_MS,
      'Complexity scoring',
    ),
    null,
    'complexityScorer',
  );
  const scoredIntent = complexityReport
    ? mergeComplexityIntoSpec(enrichedIntent, complexityReport)
    : enrichedIntent;
  if (complexityReport) {
    logger.info(`advancedPipeline[1.8/7] complexity: score=${complexityReport.totalScore} tier="${complexityReport.complexityTier}" strategy="${complexityReport.recommendedStrategy.generationMode}"`);
    await emit(`Complexity: ${complexityReport.complexityTier} (${complexityReport.totalScore}/90)`);
  }

  // ── Stage 2: Product Specification ─────────────────────────────────────────
  await emit('Defining product structure...');
  const product = await _safe(
    withTimeout(
      planProduct(scoredIntent, cost),
      limits.PRODUCT_TIMEOUT_MS,
      'Product planning',
    ),
    _fallbackProduct(scoredIntent),
    'productPlanner',
  );
  logger.info(`advancedPipeline[2/7] product: appName="${product.appName}" pages=${product.pages?.length} models=${product.dataModels?.length}`);

  // ── Stage 3: Architecture + File Plan ──────────────────────────────────────
  await emit('Planning architecture...');
  const stack = await _safe(
    withTimeout(
      planStack(scoredIntent, product, cost),
      limits.STACK_TIMEOUT_MS,
      'Stack planning',
    ),
    _fallbackStack(product),
    'stackPlanner',
  );
  logger.info(`advancedPipeline[3/7] stack: files=${stack.files.length} storage="${stack.tech?.storage}"`);

  // ── Stage 4: Implementation Blueprint ──────────────────────────────────────
  await emit('Writing implementation blueprint...');
  const blueprint = await _safe(
    withTimeout(
      generateBlueprint(scoredIntent, product, stack, cost),
      limits.BLUEPRINT_TIMEOUT_MS,
      'Blueprint generation',
    ),
    _fallbackBlueprint(product, stack),
    'blueprintGenerator',
  );
  logger.info(`advancedPipeline[4/7] blueprint: projectName="${blueprint.projectName}" files=${blueprint.fileList?.length} cssComponents=${blueprint.cssComponents?.length}`);

  // ── Stage 5: Code Generation ────────────────────────────────────────────────
  // medium/advanced/production_heavy → multi-pass (6 focused passes)
  // simple → legacy two-pass HTML→CSS/JS (kept for fast simple apps)
  const useMultiPass = complexityReport && complexityReport.complexityTier !== 'simple';
  let files, projectName;

  if (useMultiPass) {
    logger.info(`advancedPipeline[5/7] using multi-pass generation (tier="${complexityReport.complexityTier}")`);
    const mpResult = await runMultiPassGeneration(blueprint, scoredIntent, complexityReport, cost, onProgress, log);
    files       = mpResult.files;
    projectName = mpResult.projectName;
    logger.info(`advancedPipeline[5/7] multi-pass: ${files.length} files across ${mpResult.passReports.length} passes`);
  } else {
    logger.info(`advancedPipeline[5/7] using two-pass generation (simple tier)`);
    ({ files, projectName } = await generateCode(blueprint, cost, onProgress, log));
    logger.info(`advancedPipeline[5/7] two-pass: ${files.length} files generated`);
  }

  // ── Stage 5.5: File Artifact Enrichment ─────────────────────────────────────
  const fileGeneratorContext = {
    blueprint,
    intent:          scoredIntent,
    complexityReport: complexityReport || null,
    existingPaths:   new Set(),
  };
  const projectFiles = buildGeneratedProjectFiles(files, fileGeneratorContext);
  logger.info(`advancedPipeline[5.5/7] artifacts: ${projectFiles.totalFiles} files, ${projectFiles.issues.length} issues`);

  // ── Stage 6: Semantic Validation (HTML/CSS/JS structural) ──────────────────
  await emit('Validating output...');
  const stageValidationReport = validateOutput(files, blueprint);

  const stageWarningCount = stageValidationReport.issues.filter(i => i.severity === 'warning').length;
  logger.info(`advancedPipeline[6/7] validation: score=${stageValidationReport.score} critical=${stageValidationReport.issues.filter(i => i.severity === 'critical').length} warnings=${stageWarningCount}`);

  if (stageWarningCount > 0) {
    logger.debug(`advancedPipeline: warnings — ${stageValidationReport.warnings.slice(0, 4).join('; ')}`);
  }

  // ── Stage 6.5: Comprehensive Architectural Validation ───────────────────────
  await emit('Running architectural validation...');
  const comprehensiveReport = await _safe(
    withTimeout(
      Promise.resolve(validateGeneratedProject({
        files,
        blueprint,
        intent:           scoredIntent,
        complexityReport: complexityReport || null,
        fileArtifacts:    projectFiles,
      })),
      limits.VALIDATOR_TIMEOUT_MS,
      'Generation validator',
    ),
    stageValidationReport,   // fallback to stage-6 report if validator throws
    'generationValidator',
  );
  logger.info(`advancedPipeline[6.5/7] ${summarizeValidationReport(comprehensiveReport)}`);

  // Use the comprehensive report as the canonical validation report going forward
  const validationReport = comprehensiveReport;

  // ── Stage 7.1: Deterministic Structural Repair ──────────────────────────────
  // Runs always — applies safe auto-repairs, creates missing scaffold files,
  // injects env vars / health routes / dependency declarations etc.
  await emit('Applying structural repairs...');
  let structuralRepairReport;
  let filesAfterStructuralRepair = files;

  const structuralRepairResult = await _safe(
    Promise.resolve(repairGeneratedProject({
      files,
      validationReport,
      blueprint,
      intent:          scoredIntent,
      complexityReport: complexityReport || null,
    })),
    null,
    'structuralRepair',
  );

  if (structuralRepairResult) {
    filesAfterStructuralRepair = structuralRepairResult.repairedFiles;
    structuralRepairReport     = structuralRepairResult.repairReport;
    logger.info(`advancedPipeline[7.1/7] ${summarizeRepairReport(structuralRepairReport)}`);
    if (structuralRepairReport.repairedCount > 0) {
      await emit(`Structural repairs: ${structuralRepairReport.repairedCount} issues fixed, score +${structuralRepairReport.scoreDelta}`);
    }
  } else {
    logger.info('advancedPipeline[7.1/7] structural repair skipped (module error)');
  }

  // ── Stage 7: Repair Pass ────────────────────────────────────────────────────
  // Runs when: any critical issues exist, OR score is below acceptable threshold
  const QUALITY_SCORE_THRESHOLD = parseInt(process.env.QUALITY_SCORE_THRESHOLD || '75', 10);
  let finalFiles   = filesAfterStructuralRepair;
  let repairReport;

  const criticalCount = validationReport.criticalIssues
    ? validationReport.criticalIssues.length
    : validationReport.issues.filter(i => i.severity === 'critical').length;

  const needsRepair = criticalCount > 0 || validationReport.score < QUALITY_SCORE_THRESHOLD;

  if (needsRepair) {
    const repairDesc = [
      criticalCount > 0                                     ? `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''}` : '',
      validationReport.score < QUALITY_SCORE_THRESHOLD ? `quality score ${validationReport.score}/100` : '',
    ].filter(Boolean).join(', ');

    await emit(`Repairing: ${repairDesc}...`);

    const result = await _safe(
      repairFiles(filesAfterStructuralRepair, validationReport, blueprint, cost),
      { files, repairReport: { repairsApplied: [], allRepaired: false } },
      'repairEngine',
    );
    finalFiles   = result.files;
    repairReport = result.repairReport;

    logger.info(`advancedPipeline[7/7] repair: applied=${repairReport.repairsApplied.length} allRepaired=${repairReport.allRepaired}`);
    if (repairReport.repairsApplied.length > 0) {
      await emit(`Repaired: ${repairReport.repairsApplied.join(', ')}`);
    }
  } else {
    logger.info(`advancedPipeline[7/7] repair: skipped (score=${validationReport.score} ≥ ${QUALITY_SCORE_THRESHOLD}, no critical issues)`);
    repairReport = { repairsApplied: [], allRepaired: true };
  }

  return {
    projectName,
    files:                  finalFiles,
    blueprint,
    validationReport,                         // comprehensive architectural report (Stage 6.5)
    stageValidationReport,                    // HTML/CSS/JS structural report (Stage 6)
    repairReport,
    complexityReport:         complexityReport || null,
    fileArtifacts:            projectFiles,
    structuralRepairReport:   structuralRepairReport || null,
    _advanced:                true,
  };
}

// ── Stage fallback values ────────────────────────────────────────────────────

async function _safe(promise, fallback, stageName) {
  try {
    return await promise;
  } catch (err) {
    logger.warn(`advancedPipeline: ${stageName} failed (${err.message}), using fallback`);
    return fallback;
  }
}

function _fallbackIntent(complexity) {
  return {
    appType:           complexity?.appType || 'generic',
    category:          'Web application',
    coreEntity:        'Item',
    features:          [],
    userFlows:         [],
    uiStates:          ['empty state', 'loading', 'error'],
    realContent:       { appName: 'My App', tagline: '', primaryCTA: 'Get started', emptyStateMessages: {}, sectionHeadings: [], bodyParagraphs: [] },
    interactions:      [],
    needsAuth:         false,
    needsDatabase:     true,
    needsPayments:     false,
    isMultiUser:       false,
    tone:              'professional',
    target:            'General users',
    potentialPitfalls: [],
  };
}

function _fallbackProduct(intent) {
  const appName    = intent.realContent?.appName || (intent.appType !== 'generic' ? intent.appType : 'my-app');
  const kebabName  = appName.toLowerCase().replace(/\s+/g, '-');
  return {
    appName:      kebabName,
    displayName:  appName,
    summary:      intent.category || 'Web application',
    pages:        [{ name: 'Home', path: 'index.html', title: appName, description: 'Main page', layout: 'single column', sections: [], forms: [] }],
    navigation:   { type: 'none', links: [] },
    dataModels:   [],
    stateDesign:  { description: 'localStorage-backed state', globalState: [], localStorage: [] },
    envVars:      [],
    integrations: [],
  };
}

function _fallbackStack(product) {
  const pageFiles = (product.pages || []).map(p => p.path || 'index.html');
  const files     = [...new Set([...pageFiles, 'style.css', 'app.js'])];
  return {
    tech: {
      frontend: 'HTML5 + CSS3 + ES6 JavaScript',
      backend:  'none',
      storage:  'localStorage',
      auth:     'none',
      styling:  'CSS custom properties + BEM-like class naming',
    },
    files,
    entryPoint: files.find(f => f.endsWith('.html')) || 'index.html',
    cssArchitecture: {
      customProperties: ['--color-primary', '--color-background', '--color-text', '--space-md', '--radius-md'],
      components:       ['.btn', '.card', '.form-field', '.nav'],
      namingConvention: 'BEM-inspired',
    },
    jsArchitecture: {
      pattern:       'module pattern with DOMContentLoaded',
      modules:       [{ name: 'app', file: 'app.js', responsibility: 'all application logic' }],
      dataLayer:     'localStorage with JSON',
      renderPattern: 'innerHTML template literals',
    },
    rationale: 'Plain HTML/CSS/JS for zero build-step deployability.',
  };
}

function _fallbackBlueprint(product, stack) {
  const projectName = slugify(product.appName || 'my-app') || 'my-app';
  return {
    projectName,
    designSystem: {
      colors: { primary: '#4F46E5', primaryHover: '#4338CA', secondary: '#0EA5E9', background: '#F8FAFC', surface: '#FFFFFF', surfaceHover: '#F1F5F9', text: '#1E293B', textMuted: '#64748B', textOnPrimary: '#FFFFFF', border: '#E2E8F0', error: '#EF4444', success: '#22C55E', warning: '#F59E0B' },
      typography:   { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", scaleRem: {}, weights: { normal: 400, medium: 500, semibold: 600, bold: 700 }, lineHeights: { normal: 1.5 } },
      spacing:      { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '40px', '2xl': '64px', '3xl': '96px' },
      borderRadius: { sm: '4px', md: '8px', lg: '16px', full: '9999px' },
      shadows:      { sm: '0 1px 3px rgba(0,0,0,0.08)', md: '0 4px 12px rgba(0,0,0,0.10)', lg: '0 8px 24px rgba(0,0,0,0.14)' },
      transitions:  'all 0.15s ease',
    },
    cssComponents: [],
    fileList:  stack.files,
    fileSpecs: stack.files.map(f => ({ path: f, description: f, htmlStructure: '', sections: [], jsFunctions: [] })),
    dataFlow:  { description: product.summary || 'Client-side app', storageSchema: [], initialData: 'Empty on first load', updatePattern: 'Full re-render' },
    navigation: product.navigation || { type: 'none', links: [] },
    accessibilityRequirements: ['All inputs have labels', 'Focus indicators visible', 'Color contrast ≥ 4.5:1'],
    responsiveBreakpoints: { mobile: '< 640px', tablet: '640px–1024px', desktop: '> 1024px' },
    designNotes: 'Clean, professional design.',
  };
}

module.exports = { runAdvancedPipeline, shouldUseAdvancedPipeline };
