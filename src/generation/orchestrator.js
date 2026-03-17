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
const { assembleFinalProjectPackage, summarizeFinalPackage } = require('../lib/packaging');
const { runDesignSystemStage }      = require('../lib/design-system');
const { checkProductionReadiness, summarizeReadinessReport, buildUiReadinessPayload } = require('../lib/readiness');
const { runErrorPreventionPreflight, runInFlightPreventionChecks, summarizePreventionReport, buildUiPreventionPayload } = require('../lib/error-prevention');
const { checkBackendAuthenticity, summarizeAuthenticity, buildUiAuthenticityPayload } = require('../lib/backend-authenticity');
const { rankSingleCandidate, summarizeRanking, buildUiRankingPayload }               = require('../lib/ranking');
const { createOptimizerSession, buildUiCostPayload }                                 = require('../lib/cost-optimizer');
let businessLogicRegistry;
try { businessLogicRegistry = require('../lib/business-logic/module-registry'); } catch (_) { businessLogicRegistry = null; }
let platformAware;
try { platformAware = require('../lib/platform-aware'); } catch (_) { platformAware = null; }
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
async function runAdvancedPipeline(userPrompt, mode, complexity, cost, onProgress, log, options = {}) {
  const emit = async (msg) => { try { if (log) await log(msg); } catch (_) {} };

  // Intent memory from Stage 0 (passed in from generationService)
  const intentMemory = options.intentMemory || null;

  // ── Cost Optimizer Session ─────────────────────────────────────────────────
  // Non-fatal. Tracks token savings, model tier suggestions, and optimization
  // strategies across the pipeline. Results returned as costOptimizationReport.
  let optimizer = null;
  try {
    optimizer = createOptimizerSession({
      mode,
      complexityLevel: complexity?.level || 'medium',
      prevIntentMemory:    options.prevIntentMemory    || null,
      currentIntentMemory: options.currentIntentMemory || intentMemory || null,
    });
    // Static stages produce zero LLM cost — record as savings vs unoptimized baseline
    optimizer.recordSkip('validation', 'static analysis — no LLM');
    optimizer.recordSkip('complexity', 'local scoring — no LLM');
    optimizer.recordSkip('ranking',    'static evaluation — no LLM');
  } catch (optErr) {
    logger.warn(`advancedPipeline: cost optimizer init failed (${optErr.message})`);
  }

  // ── Platform Detection ────────────────────────────────────────────────────
  // Non-fatal. Detect target platform and select stack from user prompt.
  // Results stored in job output for UI display and downstream hint injection.
  let platformConfig = null;
  let platformPayload = null;
  try {
    if (platformAware) {
      platformConfig  = platformAware.buildPlatformConfig(userPrompt, intentMemory);
      platformPayload = platformAware.buildUiPlatformPayload(platformConfig);
      logger.info(`advancedPipeline: ${platformAware.summarizePlatformConfig(platformConfig)}`);
    }
  } catch (paErr) {
    logger.warn(`advancedPipeline: platform detection failed (${paErr.message})`);
  }

  // ── Business Logic Module Selection ───────────────────────────────────────
  // Non-fatal. Detect which business modules apply to this app. Results stored
  // in job output for UI display and future prompt enrichment.
  let businessModules = null;
  let businessModulesPayload = null;
  try {
    if (businessLogicRegistry) {
      const { modules, sources } = businessLogicRegistry.selectModules(
        complexity?.appType || 'generic',
        userPrompt,
      );
      businessModules        = modules;
      businessModulesPayload = businessLogicRegistry.buildModulesPayload(modules, sources);
      if (modules.length > 0) {
        logger.info(`advancedPipeline: business modules selected: ${modules.join(', ')}`);
      }
    }
  } catch (blErr) {
    logger.warn(`advancedPipeline: business logic module selection failed (${blErr.message})`);
  }

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
  let scoredIntent = complexityReport
    ? mergeComplexityIntoSpec(enrichedIntent, complexityReport)
    : enrichedIntent;
  if (complexityReport) {
    logger.info(`advancedPipeline[1.8/7] complexity: score=${complexityReport.totalScore} tier="${complexityReport.complexityTier}" strategy="${complexityReport.recommendedStrategy.generationMode}"`);
    await emit(`Complexity: ${complexityReport.complexityTier} (${complexityReport.totalScore}/90)`);
  }

  // ── Stage 1.9: Intent Memory Enrichment ─────────────────────────────────────
  // Merge session-level intent signals into the scored intent so downstream
  // stages (blueprint, design system, error prevention) have the full picture.
  if (intentMemory && intentMemory.promptCount > 1) {
    const memoryHints = {
      _intentMemory:    intentMemory,
      _sessionFeatures: intentMemory.coreFeatures,
      _sessionGoal:     intentMemory.appGoal,
    };

    // Promote session flags that the intent analyser may have missed
    if (intentMemory.authRequired    && !scoredIntent.authRequired)    scoredIntent = { ...scoredIntent, authRequired: true, ...memoryHints };
    if (intentMemory.billingRequired && !scoredIntent.billingRequired) scoredIntent = { ...scoredIntent, billingRequired: true };
    if (intentMemory.adminRequired   && !scoredIntent.adminRequired)   scoredIntent = { ...scoredIntent, adminRequired: true };
    if (intentMemory.mobileRequired  && scoredIntent.appType !== 'mobile') scoredIntent = { ...scoredIntent, ...memoryHints };

    // Merge session design intent into scored intent
    if (intentMemory.designIntent && !scoredIntent.designIntent) {
      scoredIntent = { ...scoredIntent, designIntent: intentMemory.designIntent };
    }

    scoredIntent = { ...scoredIntent, ...memoryHints };
    logger.info(`advancedPipeline[1.9/7] intent-memory: ${intentMemory.promptCount} prompts, features=[${intentMemory.coreFeatures.slice(0, 5).join(',')}]`);
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

  // ── Stage 4.5: Design System Selection + Token Injection ────────────────────
  await emit('Selecting design system...');
  let enrichedBlueprint = blueprint;
  try {
    const designCtx = {
      intent:          scoredIntent,
      product,
      blueprint,
      complexityReport: complexityReport || null,
      overrides:       scoredIntent?.designOverrides || {},
    };
    const dsResult = runDesignSystemStage(designCtx, blueprint);
    enrichedBlueprint = dsResult.enrichedBlueprint || blueprint;
    logger.info(`advancedPipeline[4.5/7] design: ${dsResult.summary}`);
  } catch (dsErr) {
    logger.warn(`advancedPipeline[4.5/7] design system failed (${dsErr.message}), using blueprint as-is`);
  }

  // ── Stage 7: Error Prevention Preflight ─────────────────────────────────────
  // Proactively detects structural, deployment, and integration gaps in the plan.
  // Injects safe defaults into enrichedBlueprint before generation. Non-fatal.
  let preventionReport = null;
  try {
    await emit('Running error prevention preflight...');
    const preflightResult = runErrorPreventionPreflight({
      intent:          scoredIntent,
      product,
      stack,
      blueprint:       enrichedBlueprint,
      complexityReport: complexityReport || null,
    });
    enrichedBlueprint = preflightResult.blueprint;
    preventionReport  = preflightResult.preventionReport;
    logger.info(`advancedPipeline[7/12] prevention: ${summarizePreventionReport(preventionReport)}`);
  } catch (epErr) {
    logger.warn(`advancedPipeline[7/12] error prevention preflight failed (${epErr.message}), continuing`);
  }

  // ── Stage 5: Code Generation ────────────────────────────────────────────────
  // medium/advanced/production_heavy → multi-pass (6 focused passes)
  // simple → legacy two-pass HTML→CSS/JS (kept for fast simple apps)
  // Both paths are wrapped in a try/catch: if multi-pass fails, fall back to two-pass.
  const useMultiPass = complexityReport && complexityReport.complexityTier !== 'simple';
  let files, projectName;

  if (useMultiPass) {
    logger.info(`advancedPipeline[5/7] using multi-pass generation (tier="${complexityReport.complexityTier}")`);
    try {
      const mpResult = await runMultiPassGeneration(enrichedBlueprint, scoredIntent, complexityReport, cost, onProgress, log);
      files       = mpResult.files;
      projectName = mpResult.projectName;
      logger.info(`advancedPipeline[5/7] multi-pass: ${files.length} files across ${mpResult.passReports.length} passes`);
    } catch (mpErr) {
      logger.warn(`advancedPipeline[5/7] multi-pass failed (${mpErr.message}), falling back to two-pass`);
      await emit('Switching to two-pass generation...');
      ({ files, projectName } = await generateCode(enrichedBlueprint, cost, onProgress, log));
      logger.info(`advancedPipeline[5/7] two-pass fallback: ${files.length} files generated`);
    }
  } else {
    logger.info(`advancedPipeline[5/7] using two-pass generation (simple tier)`);
    ({ files, projectName } = await generateCode(enrichedBlueprint, cost, onProgress, log));
    logger.info(`advancedPipeline[5/7] two-pass: ${files.length} files generated`);
  }

  // ── Stage 5.5: File Artifact Enrichment ─────────────────────────────────────
  const fileGeneratorContext = {
    blueprint: enrichedBlueprint,
    intent:          scoredIntent,
    complexityReport: complexityReport || null,
    existingPaths:   new Set(),
  };
  const projectFiles = buildGeneratedProjectFiles(files, fileGeneratorContext);
  logger.info(`advancedPipeline[5.5/7] artifacts: ${projectFiles.totalFiles} files, ${projectFiles.issues.length} issues`);

  // ── Stage 6: Semantic Validation (HTML/CSS/JS structural) ──────────────────
  await emit('Validating output...');
  const stageValidationReport = validateOutput(files, enrichedBlueprint);

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
        blueprint: enrichedBlueprint,
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
      blueprint: enrichedBlueprint,
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
      repairFiles(filesAfterStructuralRepair, validationReport, enrichedBlueprint, cost),
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

  // ── Stage 10: Final Packaging / Output Assembly / Delivery ──────────────────
  // Assembles all pipeline outputs into a clean, structured final deliverable.
  // Non-fatal — pipeline result is returned even if packaging fails.
  await emit('Assembling final package...');
  let finalPackage = null;

  const packagingResult = await _safe(
    Promise.resolve(assembleFinalProjectPackage({
      intent:                scoredIntent,
      product,
      stack,
      blueprint: enrichedBlueprint,
      complexityReport:      complexityReport || null,
      files:                 finalFiles,
      fileArtifacts:         projectFiles,
      validationReport,
      structuralRepairReport: structuralRepairReport || null,
      repairReport,
      projectName,
      generatedAt:           new Date().toISOString(),
    })),
    null,
    'finalPackaging',
  );

  if (packagingResult) {
    finalPackage = packagingResult;
    logger.info(`advancedPipeline[10/10] ${summarizeFinalPackage(finalPackage)}`);
    await emit(`Package ready: ${finalPackage.packageStatus}`);
  } else {
    logger.warn('advancedPipeline[10/10] final packaging failed — returning raw pipeline output');
  }

  // ── Stage 10.5: In-Flight Error Prevention ───────────────────────────────
  // Checks actual generated files for hardcoded ports, localhost URLs, missing
  // env examples, missing error handling, localStorage in mobile, etc.
  // Merges discovered issues into the existing preventionReport. Non-fatal.
  try {
    const inFlightFiles = finalFiles instanceof Map
      ? Object.fromEntries(finalFiles)
      : (Array.isArray(finalFiles)
          ? Object.fromEntries(finalFiles.map(f => [f.path || f.filename, f.content || '']))
          : finalFiles);

    const inFlightIssues = runInFlightPreventionChecks({
      files:    inFlightFiles,
      blueprint: enrichedBlueprint,
      intent:   scoredIntent,
      stack,
    });

    if (inFlightIssues.length > 0) {
      logger.info(`advancedPipeline[10.5/12] in-flight prevention: ${inFlightIssues.length} issue(s) detected`);
    }

    if (preventionReport && inFlightIssues.length > 0) {
      // Merge in-flight issues into the existing prevention report
      const { buildPreventionReport } = require('../lib/error-prevention');
      preventionReport = buildPreventionReport(
        preventionReport.preventedIssues,
        preventionReport.injectedDefaults,
        preventionReport.generationAdjustments,
        inFlightIssues,
      );
    } else if (!preventionReport && inFlightIssues.length > 0) {
      const { buildPreventionReport } = require('../lib/error-prevention');
      preventionReport = buildPreventionReport([], [], [], inFlightIssues);
    }
  } catch (ifErr) {
    logger.warn(`advancedPipeline[10.5/12] in-flight prevention failed (${ifErr.message}), skipping`);
  }

  // ── Stage 12: Production Readiness Check ─────────────────────────────────
  // Evaluates deployability: runtime, env, integrations, port config, security.
  // Non-fatal — pipeline result is returned even if this check fails.
  await emit('Checking production readiness...');
  let readinessReport = null;

  try {
    // Normalize files to a plain object (may be a Map from generation passes)
    const readinessFiles = finalFiles instanceof Map
      ? Object.fromEntries(finalFiles)
      : (Array.isArray(finalFiles)
          ? Object.fromEntries(finalFiles.map(f => [f.path || f.filename, f.content || '']))
          : finalFiles);

    readinessReport = checkProductionReadiness({
      files:           readinessFiles,
      blueprint:       enrichedBlueprint,
      intent:          scoredIntent,
      stack,
      complexityReport: complexityReport || null,
      validationReport,
      finalPackage:    finalPackage || null,
      projectName,
    });
    logger.info(`advancedPipeline[12/12] ${summarizeReadinessReport(readinessReport)}`);
    await emit(`Readiness: ${readinessReport.status} (score: ${readinessReport.score.total}/100)`);
  } catch (rdErr) {
    logger.warn(`advancedPipeline[12/12] readiness check failed (${rdErr.message})`);
  }

  // ── Stage 13: Backend Authenticity Check ─────────────────────────────────
  // Scans generated code for fake backend patterns: hardcoded data, missing
  // API routes, fake auth, fake billing, stub integrations, unguarded admin.
  // Non-fatal — informs repair system and UI. Does not block delivery.
  let authenticityReport = null;
  try {
    const authenticityFiles = finalFiles instanceof Map
      ? Object.fromEntries(finalFiles)
      : (Array.isArray(finalFiles)
          ? Object.fromEntries(finalFiles.map(f => [f.path || f.filename, f.content || '']))
          : finalFiles);

    authenticityReport = checkBackendAuthenticity({
      files:           authenticityFiles,
      blueprint:       enrichedBlueprint,
      intent:          scoredIntent,
      stack,
      complexityReport: complexityReport || null,
    });
    logger.info(`advancedPipeline[13/14] authenticity: ${summarizeAuthenticity(authenticityReport)}`);
    if (authenticityReport.status === 'fake_backend_detected') {
      await emit(`Authenticity: fake backend patterns detected (${authenticityReport.fakeBackendIssues.length} issue(s))`);
    }
  } catch (authErr) {
    logger.warn(`advancedPipeline[13/14] authenticity check failed (${authErr.message})`);
  }

  // ── Stage 14: Generation Ranking ──────────────────────────────────────────
  // Scores the generated output across 7 quality dimensions and produces a
  // structured RankingResult. In single-candidate mode (current default) this
  // attaches quality scores to the output without changing file selection.
  // Non-fatal — never blocks delivery.
  let rankingResult = null;
  try {
    const rankingFiles = finalFiles instanceof Map
      ? Object.fromEntries(finalFiles)
      : (Array.isArray(finalFiles)
          ? Object.fromEntries(finalFiles.map(f => [f.path || f.filename, f.content || '']))
          : finalFiles);

    rankingResult = rankSingleCandidate({
      candidateId:      'candidate_a',
      files:            rankingFiles,
      blueprint:        enrichedBlueprint,
      validationReport: validationReport   || null,
      readinessReport:  readinessReport    || null,
      authenticityReport: authenticityReport || null,
      preventionReport: preventionReport   || null,
      intent:           scoredIntent,
    });
    logger.info(`advancedPipeline[14/14] ranking: ${summarizeRanking(rankingResult)}`);
  } catch (rankErr) {
    logger.warn(`advancedPipeline[14/14] ranking failed (${rankErr.message})`);
  }

  return {
    projectName,
    files:                  finalFiles,
    blueprint: enrichedBlueprint,
    validationReport,                         // comprehensive architectural report (Stage 6.5)
    stageValidationReport,                    // HTML/CSS/JS structural report (Stage 6)
    repairReport,
    complexityReport:         complexityReport || null,
    fileArtifacts:            projectFiles,
    structuralRepairReport:   structuralRepairReport || null,
    finalPackage:             finalPackage || null,           // Stage 11 output
    readinessReport:          readinessReport || null,        // Stage 12 output
    readinessPayload:         readinessReport ? buildUiReadinessPayload(readinessReport) : null,
    preventionReport:         preventionReport || null,       // Stage 7 + 10.5 output
    preventionPayload:        preventionReport ? buildUiPreventionPayload(preventionReport) : null,
    authenticityReport:       authenticityReport || null,     // Stage 13 output
    authenticityPayload:      authenticityReport ? buildUiAuthenticityPayload(authenticityReport) : null,
    rankingResult:            rankingResult || null,           // Stage 14 output
    rankingPayload:           rankingResult ? buildUiRankingPayload(rankingResult) : null,
    costOptimizationReport:   optimizer ? optimizer.buildCostReport() : null,   // Cost optimizer
    costOptimizationPayload:  optimizer ? buildUiCostPayload(optimizer.buildCostReport()) : null,
    businessModules:          businessModules || [],                             // Business logic modules
    businessModulesPayload:   businessModulesPayload || null,
    platformConfig:           platformConfig || null,                            // Platform-aware detection
    platformPayload:          platformPayload || null,
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
