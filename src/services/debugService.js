/**
 * debugService.js — async debug pipeline using the existing job infrastructure.
 *
 * Pipeline stages: loading → analyzing → diagnosing → completed
 * Local analysis runs first (free). If confidence >= 0.88, applies local patch.
 * Otherwise calls the AI debug model.
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

const DEBUG_MAX_TOKENS = 2500;
const DEBUG_TIMEOUT_MS = 60_000;

// ── File loading (mirrors editService.js) ─────────────────────────────────────

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

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Start a debug job. Returns immediately with a jobId.
 * The pipeline runs asynchronously.
 *
 * @param {string} projectSlug
 * @param {object} signals - { consoleErrors, previewState, userDescription, previewUrl }
 * @param {string} mode    - 'fast' | 'balanced' | 'quality'
 * @returns {Promise<string>} jobId
 */
async function startDebug(projectSlug, signals = {}, mode = 'balanced') {
  const jobId     = uuidv4();
  const startedAt = now();

  await createJob(jobId, {
    projectSlug,
    mode,
    isDebug: true,
    status: 'queued',
    startedAt,
    signals,
  });

  logger.info(`debugService: job ${jobId} — debugging "${projectSlug}" mode="${mode}"`);

  runDebugPipeline(jobId, projectSlug, signals, mode, startedAt)
    .catch((err) => logger.error(`debugService: unhandled error for job ${jobId}`, { error: err.message }));

  return jobId;
}

// ── Debug pipeline ────────────────────────────────────────────────────────────

async function runDebugPipeline(jobId, projectSlug, signals, mode, startedAt) {
  const cost = createCostTracker();

  const log = async (msg) => {
    logger.info(`[debug:${jobId}] ${msg}`);
    await appendJobLog(jobId, msg);
  };

  try {
    // ── Stage 1: loading — read project files ─────────────────────────────
    await setJobStage(jobId, 'loading');
    await log(`Debugging "${projectSlug}" — loading project files`);

    // Gracefully handle missing project metadata
    const project = await getProject(projectSlug).catch(() => null);
    const projectDir = path.join(GENERATED_PROJECTS_DIR, projectSlug);

    if (!(await fse.pathExists(projectDir))) {
      throw Object.assign(
        new Error(`Project directory not found: ${projectSlug}`),
        { type: 'failed' }
      );
    }

    const allFiles = await loadProjectFiles(projectDir);
    await log(`Loaded ${allFiles.length} project files`);
    await completeJobStage(jobId, 'loading');

    // ── Stage 2: analyzing — local heuristic checks ───────────────────────
    await setJobStage(jobId, 'analyzing');
    await log('Running local heuristic analysis...');

    const { issues, best } = analyzeProject(allFiles, signals);
    await log(`Local analysis found ${issues.length} potential issue(s)${best ? ` — best: ${best.type} (conf: ${best.confidence})` : ''}`);
    await completeJobStage(jobId, 'analyzing');

    // ── Fast path: local patch if high-confidence ─────────────────────────
    if (best && best.confidence >= 0.88) {
      const localPatch = generateLocalPatch(best, allFiles);
      if (localPatch && localPatch.length > 0) {
        await log(`Local auto-fix available for ${best.type} — applying`);

        const debugResult = {
          rootCause:    best.message,
          explanation:  best.message,
          confidence:   best.confidence,
          affectedFiles: best.affectedFiles || [],
          patch:        localPatch,
          issueType:    best.type,
          canAutoApply: true,
          severity:     best.severity,
          suggestion:   null,
          diagnosedBy:  'local',
          issueCount:   issues.length,
        };

        cost.recordLocal('debug-local', best.type);
        await completeDebug(jobId, projectSlug, debugResult, cost, startedAt, log);
        return;
      }

      // High-confidence but no local patch — still report with AI confirmation skipped
      await log(`High-confidence local finding: ${best.type} — proceeding to AI for patch generation`);
    }

    // ── Stage 3: diagnosing — AI analysis ────────────────────────────────
    await setJobStage(jobId, 'diagnosing');
    await log('Calling AI debugger...');

    const relevantFiles = selectRelevantFiles(allFiles, signals, issues);
    await log(`Selected ${relevantFiles.length} files for AI context`);

    const projectMeta = {
      slug:    projectSlug,
      appType: project?.appType || null,
      prompt:  project?.prompt || project?.originalPrompt || null,
    };

    const { system, user, contextChars } = buildDebugPrompt(signals, relevantFiles, projectMeta);

    const modelName = env.DEFAULT_CODER_MODEL;
    let raw;
    try {
      const call = modelName === 'openai'
        ? callOpenAI(system, user, { maxTokens: DEBUG_MAX_TOKENS })
        : callClaude(system, user, { maxTokens: DEBUG_MAX_TOKENS });

      raw = await withTimeout(call, DEBUG_TIMEOUT_MS, 'DebugDiagnoser');
    } catch (err) {
      logger.error(`debugService: AI call failed for job ${jobId}`, { error: err.message });
      // Fall back to best local finding if AI fails
      if (best) {
        await log(`AI call failed — using local finding as fallback`);
        const debugResult = {
          rootCause:    best.message,
          explanation:  `${best.message} (AI diagnosis unavailable: ${err.message})`,
          confidence:   best.confidence * 0.8,
          affectedFiles: best.affectedFiles || [],
          patch:        null,
          issueType:    best.type,
          canAutoApply: false,
          severity:     best.severity,
          suggestion:   'Check the affected files manually for this issue.',
          diagnosedBy:  'local-fallback',
          issueCount:   issues.length,
        };
        await completeDebug(jobId, projectSlug, debugResult, cost, startedAt, log);
        return;
      }
      throw Object.assign(new Error(`AI debugger failed: ${err.message}`), { type: 'failed' });
    }

    cost.record('debug-ai', system, user, raw, { contextChars, filesInContext: relevantFiles.length });

    // Parse AI response
    const { success, data } = safeJsonParse(raw);
    if (!success || !data) {
      logger.warn(`debugService: AI returned invalid JSON for job ${jobId}`);
      throw Object.assign(new Error('AI debug response was not valid JSON'), { type: 'failed' });
    }

    // Validate and sanitize AI response
    const debugResult = {
      rootCause:    String(data.rootCause || 'Unknown issue'),
      explanation:  String(data.explanation || data.rootCause || ''),
      confidence:   typeof data.confidence === 'number' ? Math.min(1, Math.max(0, data.confidence)) : 0.5,
      affectedFiles: Array.isArray(data.affectedFiles) ? data.affectedFiles.filter(f => typeof f === 'string') : [],
      patch:        validatePatch(data.patch),
      issueType:    String(data.issueType || 'other'),
      canAutoApply: Boolean(data.canAutoApply),
      severity:     ['high', 'medium', 'low'].includes(data.severity) ? data.severity : 'medium',
      suggestion:   data.suggestion ? String(data.suggestion) : null,
      diagnosedBy:  'ai',
      issueCount:   issues.length,
      localIssues:  issues.slice(0, 3).map(i => ({ type: i.type, confidence: i.confidence })),
    };

    await log(`AI diagnosis: ${debugResult.rootCause} (confidence: ${Math.round(debugResult.confidence * 100)}%)`);
    await completeDebug(jobId, projectSlug, debugResult, cost, startedAt, log);

  } catch (err) {
    const elapsed = formatElapsed(startedAt);
    const type    = err.type || 'failed';

    logger.error(`debugService: job ${jobId} → ${type} after ${elapsed}`, { error: err.message });

    await updateJob(jobId, {
      status:    'failed',
      error:     err.message,
      duration:  elapsed,
      failedAt:  now(),
    }, { force: true });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate the patch array from AI: must be [{path, content}] with string values.
 */
function validatePatch(patch) {
  if (!Array.isArray(patch)) return null;
  const valid = patch.filter(p =>
    p && typeof p.path === 'string' && p.path.trim() &&
    typeof p.content === 'string'
  ).map(p => ({ path: p.path.trim(), content: p.content }));
  return valid.length > 0 ? valid : null;
}

/**
 * Finalize a debug job: write result, cost, and status.
 */
async function completeDebug(jobId, projectSlug, debugResult, cost, startedAt, log) {
  const duration    = formatElapsed(startedAt);
  const costSummary = cost.summary();

  await log(`Debug complete in ${duration} — ${debugResult.diagnosedBy} diagnosis`);
  logger.info(`debugService: job ${jobId} cost: ${costSummary.calls} calls, ~${costSummary.totalTokens} tokens, ~$${costSummary.estimatedCostUSD}`);

  await updateJob(jobId, {
    status:      'completed',
    projectSlug,
    debugResult,
    cost:        costSummary,
    completedAt: now(),
    duration,
  });

  logger.success(`debugService: job ${jobId} completed — debugged "${projectSlug}" in ${duration}`);
}

// ── Apply / rollback ──────────────────────────────────────────────────────────

/**
 * Apply a debug fix patch to the project files.
 * Creates a backup of the original file contents for rollback.
 *
 * @param {string} projectSlug
 * @param {Array<{path: string, content: string}>} patch
 * @returns {Promise<{ written: string[], failed: string[], backup: Array<{path, original}> }>}
 */
async function applyDebugFix(projectSlug, patch) {
  if (!Array.isArray(patch) || patch.length === 0) {
    throw new Error('Patch is empty or invalid');
  }

  const projectDir = path.join(GENERATED_PROJECTS_DIR, projectSlug);

  if (!(await fse.pathExists(projectDir))) {
    throw new Error(`Project directory not found: ${projectSlug}`);
  }

  // Build backup of current file contents
  const backup = [];
  for (const patchFile of patch) {
    const filePath = path.join(projectDir, patchFile.path);
    let originalContent = null;
    try {
      if (await fse.pathExists(filePath)) {
        originalContent = await fse.readFile(filePath, 'utf8');
      }
    } catch (_) {}
    backup.push({ path: patchFile.path, original: originalContent });
  }

  // Apply the patch
  const { written, failed } = await writeFiles(projectDir, patch);

  // Update project metadata
  await updateProject(projectSlug, {
    lastDebugFix: {
      appliedAt:   now(),
      filesPatched: written,
      patchCount:  patch.length,
    },
  }).catch(() => {}); // non-fatal

  logger.info(`debugService: applied debug fix to "${projectSlug}" — ${written.length} written, ${failed.length} failed`);

  return { written, failed, backup };
}

/**
 * Roll back a previously applied debug fix using a backup.
 *
 * @param {string} projectSlug
 * @param {Array<{path: string, original: string|null}>} backup
 * @returns {Promise<{ written: string[], failed: string[] }>}
 */
async function rollbackDebugFix(projectSlug, backup) {
  if (!Array.isArray(backup) || backup.length === 0) {
    throw new Error('Backup is empty or invalid');
  }

  const projectDir = path.join(GENERATED_PROJECTS_DIR, projectSlug);

  if (!(await fse.pathExists(projectDir))) {
    throw new Error(`Project directory not found: ${projectSlug}`);
  }

  // Restore original file contents; skip files that didn't exist originally
  const restoreFiles = backup
    .filter(b => b.original !== null)
    .map(b => ({ path: b.path, content: b.original }));

  if (restoreFiles.length === 0) {
    // All files were new — just delete them
    const written = [];
    const failed  = [];
    for (const b of backup) {
      try {
        await fse.remove(path.join(projectDir, b.path));
        written.push(b.path);
      } catch (err) {
        failed.push(b.path);
      }
    }
    return { written, failed };
  }

  const { written, failed } = await writeFiles(projectDir, restoreFiles);

  logger.info(`debugService: rolled back debug fix for "${projectSlug}" — ${written.length} restored`);

  return { written, failed };
}

module.exports = { startDebug, applyDebugFix, rollbackDebugFix };
