/**
 * debugService.js — async debug pipeline using the existing job infrastructure.
 *
 * Pipeline stages: loading → analyzing → diagnosing → completed
 *
 * Now integrates:
 *  - logNormalizer   (structured error normalization)
 *  - ruleEngine      (fast rule-based detection before AI)
 *  - errorClassifier (dedup/cluster for token efficiency)
 *  - contextBuilder  (compact AI context)
 *  - secretMasker    (redact secrets before AI)
 *  - healPlanner     (multi-iteration repair plan)
 *  - incidentAnalyzer (production incident mode)
 *  - visualDebugger  (screenshot/DOM visual analysis)
 */

const path = require('path');
const fse  = require('fs-extra');
const { v4: uuidv4 }            = require('uuid');
const { now }                   = require('../utils/timestamps');
const { formatElapsed }         = require('../utils/generationTimer');
const { withTimeout }           = require('../utils/withTimeout');
const { callClaude }            = require('../providers/anthropicProvider');
const { callOpenAI }            = require('../providers/openaiProvider');
const { buildDebugPrompt, selectRelevantFiles } = require('../generators/debugPromptBuilder');
const { safeJsonParse }         = require('../utils/safeJsonParse');
const { analyzeProject, generateLocalPatch } = require('../utils/debugAnalyzer');
const { writeFiles }            = require('../generators/fileWriter');
const { createCostTracker }     = require('../utils/costTracker');
const { getProject, updateProject } = require('../storage/projectStore');
const {
  createJob, updateJob, appendJobLog,
  setJobStage, completeJobStage,
} = require('../storage/jobStore');
const { GENERATED_PROJECTS_DIR } = require('../generators/projectGenerator');
const { env }    = require('../config/env');
const logger     = require('../utils/logger');

// ── New debug subsystem modules ───────────────────────────────────────────────
const { normalizeSignals }   = require('../debug/logNormalizer');
const { runRules }           = require('../debug/ruleEngine');
const { buildErrorSummary }  = require('../debug/errorClassifier');
const { buildDebugContext }  = require('../debug/contextBuilder');
const { maskString }         = require('../debug/secretMasker');
const { planHeal }           = require('../debug/healPlanner');
const { analyzeIncident }    = require('../debug/incidentAnalyzer');
const { analyzeVisualBug }   = require('../debug/visualDebugger');

const DEBUG_MAX_TOKENS = 2500;
const DEBUG_TIMEOUT_MS = 60_000;

// ── File loading ──────────────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.ts', '.jsx', '.tsx',
  '.json', '.md', '.txt', '.svg',
]);

async function walk(dir, rootDir, result) {
  const entries = await fse.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    if (entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, rootDir, result);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      try {
        const content = await fse.readFile(fullPath, 'utf8');
        const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        result.push({ path: relativePath, content });
      } catch (_) {}
    }
  }
}

async function loadProjectFiles(projectDir) {
  if (!(await fse.pathExists(projectDir))) return [];
  const files = [];
  await walk(projectDir, projectDir, files);
  return files;
}

// ── Public entry points ───────────────────────────────────────────────────────

/**
 * Start a standard debug job (Fix My App).
 */
async function startDebug(projectSlug, signals = {}, mode = 'balanced', options = {}) {
  const { autoApply = false } = options;
  const jobId     = uuidv4();
  const startedAt = now();

  await createJob(jobId, {
    projectSlug,
    mode,
    isDebug: true,
    debugMode: 'standard',
    status: 'queued',
    startedAt,
    signals,
    autoApply,
  });

  logger.info(`debugService: job ${jobId} — fixing "${projectSlug}" mode="${mode}"`);

  runDebugPipeline(jobId, projectSlug, signals, mode, startedAt, { autoApply })
    .catch((err) => logger.error(`debugService: unhandled error for job ${jobId}`, { error: err.message }));

  return jobId;
}

/**
 * Start a self-healing plan job.
 * Generates a multi-iteration repair plan; does NOT auto-apply.
 */
async function startHealPlan(projectSlug, signals = {}, mode = 'balanced') {
  const jobId     = uuidv4();
  const startedAt = now();

  await createJob(jobId, {
    projectSlug,
    mode,
    isDebug: true,
    debugMode: 'heal',
    status: 'queued',
    startedAt,
    signals,
  });

  logger.info(`debugService: heal job ${jobId} — planning repair for "${projectSlug}"`);

  runHealPipeline(jobId, projectSlug, signals, mode, startedAt)
    .catch((err) => logger.error(`debugService: unhandled heal error for job ${jobId}`, { error: err.message }));

  return jobId;
}

/**
 * Start a production incident analysis job.
 */
async function startIncidentAnalysis(projectSlug, signals = {}, deployHistory = []) {
  const jobId     = uuidv4();
  const startedAt = now();

  await createJob(jobId, {
    projectSlug,
    isDebug: true,
    debugMode: 'incident',
    status: 'queued',
    startedAt,
    signals,
    deployHistory,
  });

  logger.info(`debugService: incident job ${jobId} — investigating "${projectSlug}"`);

  runIncidentPipeline(jobId, projectSlug, signals, deployHistory, startedAt)
    .catch((err) => logger.error(`debugService: unhandled incident error for job ${jobId}`, { error: err.message }));

  return jobId;
}

/**
 * Start a visual bug analysis job.
 */
async function startVisualDebug(projectSlug, signals = {}, screenshotBase64 = null, screenshotUrl = null) {
  const jobId     = uuidv4();
  const startedAt = now();

  await createJob(jobId, {
    projectSlug,
    isDebug: true,
    debugMode: 'visual',
    status: 'queued',
    startedAt,
    signals,
    hasScreenshot: !!(screenshotBase64 || screenshotUrl),
  });

  logger.info(`debugService: visual job ${jobId} — analyzing "${projectSlug}" (screenshot=${!!(screenshotBase64 || screenshotUrl)})`);

  runVisualPipeline(jobId, projectSlug, signals, screenshotBase64, screenshotUrl, startedAt)
    .catch((err) => logger.error(`debugService: unhandled visual error for job ${jobId}`, { error: err.message }));

  return jobId;
}

// ── Standard debug pipeline ───────────────────────────────────────────────────

async function runDebugPipeline(jobId, projectSlug, signals, mode, startedAt, options = {}) {
  const { autoApply = false } = options;
  const cost = createCostTracker();

  const log = async (msg) => {
    logger.info(`[debug:${jobId}] ${msg}`);
    await appendJobLog(jobId, msg);
  };

  try {
    // Stage 1: loading
    await setJobStage(jobId, 'loading');
    await log(`Debugging "${projectSlug}" — loading project files`);

    const project    = await getProject(projectSlug).catch(() => null);
    const projectDir = path.join(GENERATED_PROJECTS_DIR, projectSlug);

    if (!(await fse.pathExists(projectDir))) {
      throw Object.assign(new Error(`Project directory not found: ${projectSlug}`), { type: 'failed' });
    }

    const allFiles = await loadProjectFiles(projectDir);
    await log(`Loaded ${allFiles.length} file(s)`);
    await completeJobStage(jobId, 'loading');

    // Stage 2: analyzing — normalize + rule engine + local heuristics
    await setJobStage(jobId, 'analyzing');
    await log('Normalizing signals and running rule engine...');

    const normalizedErrors = normalizeSignals(signals);
    const { matched, issue: ruleIssue, candidates } = runRules(normalizedErrors, allFiles, signals);
    const errorSummary = buildErrorSummary(normalizedErrors);

    await log(`Rule engine: ${candidates.length} candidate(s)${ruleIssue ? ` — best: ${ruleIssue.type} (${Math.round(ruleIssue.confidence * 100)}%)` : ''}`);

    // Also run legacy local heuristics for patch generation
    const { issues: localIssues, best: localBest } = analyzeProject(allFiles, signals);
    await log(`Heuristic analysis: ${localIssues.length} issue(s)`);
    await completeJobStage(jobId, 'analyzing');

    // Fast path: high-confidence local patch
    if (localBest && localBest.confidence >= 0.88) {
      const localPatch = generateLocalPatch(localBest, allFiles);
      if (localPatch && localPatch.length > 0) {
        await log(`Local auto-fix available for ${localBest.type}`);
        const debugResult = buildLocalResult(localBest, localIssues, ruleIssue, candidates, errorSummary);
        debugResult.patch = localPatch;
        cost.recordLocal('debug-local', localBest.type);
        await completeDebug(jobId, projectSlug, debugResult, cost, startedAt, log, { autoApply });
        return;
      }
    }

    // Fast path: high-confidence rule match with a specific suggestion
    if (matched && ruleIssue && ruleIssue.confidence >= 0.91) {
      await log(`High-confidence rule match: ${ruleIssue.type} — proceeding to AI for patch`);
    }

    // Stage 3: diagnosing — AI analysis
    await setJobStage(jobId, 'diagnosing');
    await log('Running AI debugger...');

    const projectMeta = {
      slug:    projectSlug,
      appType: project?.appType || null,
      prompt:  project?.prompt || project?.originalPrompt || null,
    };

    const relevantFiles  = selectRelevantFiles(allFiles, signals, localIssues);
    const debugCtx       = buildDebugContext(normalizedErrors, allFiles, signals, projectMeta);

    // Enrich signals with rule findings for the AI prompt
    const enrichedSignals = {
      ...signals,
      ruleFindings: candidates.slice(0, 3).map(c => ({ type: c.type, title: c.title, confidence: c.confidence })),
      errorClusters: errorSummary.clusters.slice(0, 5),
    };

    const { system, user, contextChars } = buildDebugPrompt(enrichedSignals, relevantFiles, projectMeta);

    const modelName = env.DEFAULT_CODER_MODEL;
    let raw;
    try {
      const call = modelName === 'openai'
        ? callOpenAI(system, user, { maxTokens: DEBUG_MAX_TOKENS })
        : callClaude(system, user, { maxTokens: DEBUG_MAX_TOKENS });
      raw = await withTimeout(call, DEBUG_TIMEOUT_MS, 'DebugDiagnoser');
    } catch (err) {
      logger.error(`debugService: AI call failed for job ${jobId}`, { error: err.message });
      if (localBest || ruleIssue) {
        const fallbackResult = buildLocalResult(localBest || null, localIssues, ruleIssue, candidates, errorSummary);
        fallbackResult.explanation += ` (AI diagnosis unavailable: ${maskString(err.message)})`;
        fallbackResult.diagnosedBy = 'local-fallback';
        await completeDebug(jobId, projectSlug, fallbackResult, cost, startedAt, log, { autoApply });
        return;
      }
      throw Object.assign(new Error(`AI debugger failed: ${maskString(err.message)}`), { type: 'failed' });
    }

    cost.record('debug-ai', system, user, raw, { contextChars, filesInContext: relevantFiles.length });

    const { success, data } = safeJsonParse(raw);
    if (!success || !data) {
      throw Object.assign(new Error('AI debug response was not valid JSON'), { type: 'failed' });
    }

    const debugResult = {
      rootCause:    maskString(String(data.rootCause || 'Unknown issue')),
      explanation:  maskString(String(data.explanation || data.rootCause || '')),
      confidence:   typeof data.confidence === 'number' ? Math.min(1, Math.max(0, data.confidence)) : 0.5,
      affectedFiles: Array.isArray(data.affectedFiles) ? data.affectedFiles.filter(f => typeof f === 'string') : [],
      patch:        validatePatch(data.patch),
      issueType:    String(data.issueType || 'other'),
      canAutoApply: Boolean(data.canAutoApply),
      severity:     ['high', 'medium', 'low'].includes(data.severity) ? data.severity : 'medium',
      suggestion:   data.suggestion ? maskString(String(data.suggestion)) : null,
      diagnosedBy:  'ai',
      issueCount:   localIssues.length,
      localIssues:  localIssues.slice(0, 3).map(i => ({ type: i.type, confidence: i.confidence })),
      ruleFindings: candidates.slice(0, 3).map(c => ({ type: c.type, title: c.title, confidence: c.confidence })),
      errorSummary: {
        total:    errorSummary.totalErrors,
        unique:   errorSummary.uniqueErrors,
        critical: errorSummary.criticalCount,
        high:     errorSummary.highCount,
      },
    };

    await log(`AI diagnosis: ${debugResult.rootCause} (confidence: ${Math.round(debugResult.confidence * 100)}%)`);
    await completeDebug(jobId, projectSlug, debugResult, cost, startedAt, log, { autoApply });

  } catch (err) {
    await failJob(jobId, err, startedAt);
  }
}

// ── Self-heal pipeline ────────────────────────────────────────────────────────

async function runHealPipeline(jobId, projectSlug, signals, mode, startedAt) {
  const cost = createCostTracker();
  const log  = async (msg) => { logger.info(`[heal:${jobId}] ${msg}`); await appendJobLog(jobId, msg); };

  try {
    await setJobStage(jobId, 'loading');
    await log(`Loading "${projectSlug}" for self-healing analysis`);

    const project    = await getProject(projectSlug).catch(() => null);
    const projectDir = path.join(GENERATED_PROJECTS_DIR, projectSlug);

    if (!(await fse.pathExists(projectDir))) {
      throw Object.assign(new Error(`Project not found: ${projectSlug}`), { type: 'failed' });
    }

    const allFiles = await loadProjectFiles(projectDir);
    await log(`Loaded ${allFiles.length} file(s)`);
    await completeJobStage(jobId, 'loading');

    await setJobStage(jobId, 'analyzing');
    await log('Running rule engine and normalizing errors...');

    const normalizedErrors = normalizeSignals(signals);
    const { matched, issue: ruleIssue, candidates } = runRules(normalizedErrors, allFiles, signals);
    const errorSummary = buildErrorSummary(normalizedErrors);

    await log(`Rule candidates: ${candidates.length} — best: ${ruleIssue?.type || 'none'}`);
    await completeJobStage(jobId, 'analyzing');

    await setJobStage(jobId, 'diagnosing');
    await log('Building repair plan...');

    const projectMeta = {
      slug:    projectSlug,
      appType: project?.appType || null,
      prompt:  project?.prompt  || null,
    };

    const debugContext = buildDebugContext(normalizedErrors, allFiles, signals, projectMeta);

    const healPlan = await planHeal(debugContext, ruleIssue, allFiles, signals);

    cost.record('heal-ai', 'heal-plan', 'heal-request', JSON.stringify(healPlan), {});

    await log(`Heal plan: ${healPlan.iterations?.length || 0} iteration(s) — strategy: ${healPlan.strategy || 'unknown'}`);

    await updateJob(jobId, {
      status:      'completed',
      projectSlug,
      debugMode:   'heal',
      healPlan,
      ruleFindings: candidates.slice(0, 5),
      errorSummary: {
        total:    errorSummary.totalErrors,
        unique:   errorSummary.uniqueErrors,
        critical: errorSummary.criticalCount,
        high:     errorSummary.highCount,
      },
      cost:        cost.summary(),
      completedAt: now(),
      duration:    formatElapsed(startedAt),
    });

    logger.success(`debugService: heal job ${jobId} completed for "${projectSlug}"`);

  } catch (err) {
    await failJob(jobId, err, startedAt);
  }
}

// ── Incident pipeline ─────────────────────────────────────────────────────────

async function runIncidentPipeline(jobId, projectSlug, signals, deployHistory, startedAt) {
  const cost = createCostTracker();
  const log  = async (msg) => { logger.info(`[incident:${jobId}] ${msg}`); await appendJobLog(jobId, msg); };

  try {
    await setJobStage(jobId, 'loading');
    await log(`Investigating production incident for "${projectSlug}"`);

    const project    = await getProject(projectSlug).catch(() => null);
    const projectDir = path.join(GENERATED_PROJECTS_DIR, projectSlug);
    const allFiles   = (await fse.pathExists(projectDir)) ? await loadProjectFiles(projectDir) : [];

    await completeJobStage(jobId, 'loading');
    await setJobStage(jobId, 'analyzing');
    await log('Normalizing incident signals...');

    const normalizedErrors = normalizeSignals(signals);
    const errorSummary     = buildErrorSummary(normalizedErrors);

    await completeJobStage(jobId, 'analyzing');
    await setJobStage(jobId, 'diagnosing');
    await log('Running SRE incident analysis...');

    const projectMeta = { slug: projectSlug, appType: project?.appType || null };

    const incidentReport = await analyzeIncident({
      normalizedErrors,
      projectFiles: allFiles,
      signals,
      projectMeta,
      deployHistory: deployHistory || [],
    });

    cost.record('incident-ai', 'incident-analysis', 'incident-request', JSON.stringify(incidentReport), {});

    await log(`Incident analyzed: ${incidentReport.summary} (severity: ${incidentReport.severity})`);

    await updateJob(jobId, {
      status:        'completed',
      projectSlug,
      debugMode:     'incident',
      incidentReport,
      errorSummary: {
        total:    errorSummary.totalErrors,
        unique:   errorSummary.uniqueErrors,
        critical: errorSummary.criticalCount,
        high:     errorSummary.highCount,
      },
      cost:        cost.summary(),
      completedAt: now(),
      duration:    formatElapsed(startedAt),
    });

    logger.success(`debugService: incident job ${jobId} completed for "${projectSlug}"`);

  } catch (err) {
    await failJob(jobId, err, startedAt);
  }
}

// ── Visual pipeline ───────────────────────────────────────────────────────────

async function runVisualPipeline(jobId, projectSlug, signals, screenshotBase64, screenshotUrl, startedAt) {
  const cost = createCostTracker();
  const log  = async (msg) => { logger.info(`[visual:${jobId}] ${msg}`); await appendJobLog(jobId, msg); };

  try {
    await setJobStage(jobId, 'loading');
    await log(`Visual debugging "${projectSlug}"${screenshotBase64 ? ' with screenshot' : ''}`);

    const project    = await getProject(projectSlug).catch(() => null);
    const projectDir = path.join(GENERATED_PROJECTS_DIR, projectSlug);
    const allFiles   = (await fse.pathExists(projectDir)) ? await loadProjectFiles(projectDir) : [];

    await completeJobStage(jobId, 'loading');
    await setJobStage(jobId, 'analyzing');
    await log(screenshotBase64 || screenshotUrl ? 'Analyzing screenshot with vision AI...' : 'Analyzing project CSS/HTML for visual issues...');

    const projectMeta = { slug: projectSlug, appType: project?.appType || null };

    const visualFinding = await analyzeVisualBug({
      screenshotBase64,
      screenshotUrl,
      userDescription: signals.userDescription || null,
      projectFiles:    allFiles,
      projectMeta,
    });

    cost.record('visual-ai', 'visual-analysis', 'visual-request', JSON.stringify(visualFinding), {});

    await log(`Visual finding: ${visualFinding.summary} — screenshotAnalyzed=${visualFinding.screenshotAnalyzed}`);

    await updateJob(jobId, {
      status:        'completed',
      projectSlug,
      debugMode:     'visual',
      visualFinding,
      cost:          cost.summary(),
      completedAt:   now(),
      duration:      formatElapsed(startedAt),
    });

    logger.success(`debugService: visual job ${jobId} completed for "${projectSlug}"`);

  } catch (err) {
    await failJob(jobId, err, startedAt);
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function buildLocalResult(localBest, localIssues, ruleIssue, candidates, errorSummary) {
  const primary = localBest || ruleIssue;
  return {
    rootCause:    primary?.message || primary?.title || 'Issue detected by heuristics',
    explanation:  primary?.message || primary?.description || '',
    confidence:   primary?.confidence || 0.7,
    affectedFiles: primary?.affectedFiles || [],
    patch:        null,
    issueType:    primary?.type || 'other',
    canAutoApply: false,
    severity:     primary?.severity || 'medium',
    suggestion:   primary?.suggestion || 'Review the affected files manually.',
    diagnosedBy:  'local',
    issueCount:   localIssues.length,
    localIssues:  localIssues.slice(0, 3).map(i => ({ type: i.type, confidence: i.confidence })),
    ruleFindings: candidates.slice(0, 3).map(c => ({ type: c.type, title: c.title, confidence: c.confidence })),
    errorSummary: {
      total:    errorSummary.totalErrors,
      unique:   errorSummary.uniqueErrors,
      critical: errorSummary.criticalCount,
      high:     errorSummary.highCount,
    },
  };
}

function validatePatch(patch) {
  if (!Array.isArray(patch)) return null;
  const valid = patch.filter(p =>
    p && typeof p.path === 'string' && p.path.trim() &&
    typeof p.content === 'string'
  ).map(p => ({ path: p.path.trim(), content: p.content }));
  return valid.length > 0 ? valid : null;
}

async function completeDebug(jobId, projectSlug, debugResult, cost, startedAt, log, options = {}) {
  const { autoApply = false } = options;
  const duration    = formatElapsed(startedAt);
  const costSummary = cost.summary();

  let autoApplied = false;
  let autoApplyError = null;

  // Auto-apply the patch if requested, patch exists, and confidence is sufficient
  if (autoApply && debugResult.patch && debugResult.patch.length > 0 && debugResult.confidence >= 0.65) {
    try {
      await log(`Auto-applying fix (confidence: ${Math.round(debugResult.confidence * 100)}%)...`);
      await applyDebugFix(projectSlug, debugResult.patch);
      autoApplied = true;
      await log(`Fix applied — ${debugResult.patch.length} file(s) patched`);
    } catch (applyErr) {
      autoApplyError = applyErr.message;
      logger.warn(`[debug:${jobId}] auto-apply failed: ${applyErr.message}`);
    }
  }

  await log(`Debug complete in ${duration} — ${debugResult.diagnosedBy} diagnosis${autoApplied ? ' (auto-applied)' : ''}`);

  await updateJob(jobId, {
    status:      'completed',
    projectSlug,
    debugMode:   'standard',
    debugResult,
    autoApplied,
    autoApplyError: autoApplyError || undefined,
    cost:        costSummary,
    completedAt: now(),
    duration,
  });

  logger.success(`debugService: job ${jobId} completed for "${projectSlug}" in ${duration}${autoApplied ? ' (auto-applied)' : ''}`);
}

async function failJob(jobId, err, startedAt) {
  const elapsed = formatElapsed(startedAt);
  const type    = err.type || 'failed';
  logger.error(`debugService: job ${jobId} → ${type} after ${elapsed}`, { error: err.message });
  await updateJob(jobId, {
    status:   'failed',
    error:    maskString(err.message),
    duration: elapsed,
    failedAt: now(),
  }, { force: true });
}

// ── Apply / rollback (unchanged) ──────────────────────────────────────────────

async function applyDebugFix(projectSlug, patch) {
  if (!Array.isArray(patch) || patch.length === 0) throw new Error('Patch is empty or invalid');

  const projectDir = path.join(GENERATED_PROJECTS_DIR, projectSlug);
  if (!(await fse.pathExists(projectDir))) throw new Error(`Project directory not found: ${projectSlug}`);

  const backup = [];
  for (const patchFile of patch) {
    const filePath = path.join(projectDir, patchFile.path);
    let originalContent = null;
    try {
      if (await fse.pathExists(filePath)) originalContent = await fse.readFile(filePath, 'utf8');
    } catch (_) {}
    backup.push({ path: patchFile.path, original: originalContent });
  }

  const { written, failed } = await writeFiles(projectDir, patch);

  await updateProject(projectSlug, {
    lastDebugFix: { appliedAt: now(), filesPatched: written, patchCount: patch.length },
  }).catch(() => {});

  logger.info(`debugService: applied fix to "${projectSlug}" — ${written.length} written, ${failed.length} failed`);
  return { written, failed, backup };
}

async function rollbackDebugFix(projectSlug, backup) {
  if (!Array.isArray(backup) || backup.length === 0) throw new Error('Backup is empty or invalid');

  const projectDir = path.join(GENERATED_PROJECTS_DIR, projectSlug);
  if (!(await fse.pathExists(projectDir))) throw new Error(`Project directory not found: ${projectSlug}`);

  const restoreFiles = backup.filter(b => b.original !== null).map(b => ({ path: b.path, content: b.original }));

  if (restoreFiles.length === 0) {
    const written = [], failed = [];
    for (const b of backup) {
      try { await fse.remove(path.join(projectDir, b.path)); written.push(b.path); }
      catch (_) { failed.push(b.path); }
    }
    return { written, failed };
  }

  const { written, failed } = await writeFiles(projectDir, restoreFiles);
  logger.info(`debugService: rolled back fix for "${projectSlug}" — ${written.length} restored`);
  return { written, failed };
}

module.exports = {
  startDebug,
  startHealPlan,
  startIncidentAnalysis,
  startVisualDebug,
  applyDebugFix,
  rollbackDebugFix,
};
