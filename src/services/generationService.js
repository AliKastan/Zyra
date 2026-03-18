const { v4: uuidv4 } = require('uuid');
const { slugify } = require('../utils/slugify');
const { now } = require('../utils/timestamps');
const { formatElapsed } = require('../utils/generationTimer');
const { classifyComplexity, isNonGameRequest } = require('../utils/complexity');
const { withTimeout } = require('../utils/withTimeout');
const { assertProviderAvailable } = require('./orchestrator');
const { runPlanner } = require('./plannerService');
const { runCoder, injectBackendSDK, injectEnvLoader, injectViewportNormalize, injectRuntimeErrorCatcher } = require('./coderService');
const { runAdvancedPipeline, shouldUseAdvancedPipeline } = require('../generation/orchestrator');
const { generateFallback } = require('../generators/fallbackGenerator');
const { runReviewer } = require('./reviewerService');
const { generateProject } = require('../generators/projectGenerator');
const { createCostTracker } = require('../utils/costTracker');
const {
  createJob, updateJob, appendJobLog,
  setJobStage, completeJobStage,
  markJobTimedOut, isJobAborted,
} = require('../storage/jobStore');
const { saveProject, storeProjectFiles } = require('../storage/projectStore');
const { updateIntentMemory, getIntentSummary, buildUiIntentPayload } = require('../lib/intent-memory');
const limits = require('../config/limits');
const logger = require('../utils/logger');

// Per-user concurrency tracking:
// Each authenticated user has their own active job slot.
// Anonymous/unauthenticated requests share a single global slot.
const activeJobsByUser = new Map(); // userId → Set<jobId>
const activeJobsAnon   = new Set(); // fallback for unauthenticated requests

let chargeUsage;
try { chargeUsage = require('../billing/meter').chargeUsage; } catch (_) { chargeUsage = null; }

function getActiveJobCount(userId) {
  if (userId) return activeJobsByUser.get(userId)?.size || 0;
  return activeJobsAnon.size;
}

function _addActive(jobId, userId) {
  if (userId) {
    if (!activeJobsByUser.has(userId)) activeJobsByUser.set(userId, new Set());
    activeJobsByUser.get(userId).add(jobId);
  }
  activeJobsAnon.add(jobId); // always track globally for admin visibility
}

function _removeActive(jobId, userId) {
  if (userId) activeJobsByUser.get(userId)?.delete(jobId);
  activeJobsAnon.delete(jobId);
}

/**
 * Force-removes a job from all active tracking maps regardless of userId.
 * Called by the cancel endpoint so the slot is freed immediately — without
 * waiting for the pipeline's .finally() to fire (which may be blocked on
 * a long-running API call).
 */
function forceReleaseJob(jobId) {
  activeJobsAnon.delete(jobId);
  for (const [, set] of activeJobsByUser) set.delete(jobId);
}

class CancelledError extends Error {
  constructor() { super('Generation was cancelled by user'); this.type = 'cancelled'; }
}
class DeadlineError extends Error {
  constructor(msg) { super(msg); this.type = 'timed_out'; }
}

/**
 * Starts a heartbeat that appends a progress log every `intervalMs`.
 * Prevents the UI log stream from appearing frozen during long AI calls.
 * Returns a stop function — MUST be called after the stage completes.
 */
function startHeartbeat(log, stageStart, intervalMs = 20_000) {
  const timer = setInterval(async () => {
    const elapsed = Math.round((Date.now() - stageStart) / 1000);
    const mins    = Math.floor(elapsed / 60);
    const secs    = elapsed % 60;
    const label   = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    try { await log(`Still generating... (${label} elapsed)`); } catch (_) {}
  }, intervalMs);
  return () => clearInterval(timer);
}

// ── Public entry point ────────────────────────────────────────────────────────

async function startGeneration(userPrompt, mode = 'balanced', options = {}) {
  const { userId, sessionId } = options;

  if (getActiveJobCount(userId) >= limits.MAX_CONCURRENT_JOBS) {
    const err = new Error('A generation is already in progress. Please wait for it to complete or cancel it.');
    err.code = 'JOB_IN_PROGRESS';
    throw err;
  }

  // Redirect non-game requests — Zyra is specialized for mobile games
  if (isNonGameRequest(userPrompt)) {
    const err = new Error(
      'Zyra is specialized for mobile game generation. It looks like you might be describing a website, SaaS, or app instead of a game. ' +
      'Try rephrasing your idea as a mobile game — for example: "Make a mobile game where the player dodges falling objects."'
    );
    err.code = 'NOT_A_GAME';
    throw err;
  }

  const jobId = uuidv4();
  const startedAt  = now();
  const complexity = classifyComplexity(userPrompt);

  await createJob(jobId, { prompt: userPrompt, mode, complexity, status: 'queued', startedAt });
  _addActive(jobId, userId);

  logger.info(`generationService: job ${jobId} — mode="${mode}" complexity="${complexity.level}" gameType="${complexity.appType}"`);

  runPipeline(jobId, userPrompt, mode, complexity, startedAt, userId, sessionId)
    .catch((err) => logger.error(`generationService: unhandled error for job ${jobId}`, { error: err.message }))
    .finally(() => _removeActive(jobId, userId));

  return jobId;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function runPipeline(jobId, userPrompt, mode, complexity, startedAt, userId, sessionId) {
  const pipelineStart = startedAt ? new Date(startedAt).getTime() : Date.now();
  const deadline      = pipelineStart + limits.MAX_JOB_DURATION_MS;
  const cost          = createCostTracker();

  const log = async (msg) => {
    logger.info(`[job:${jobId}] ${msg}`);
    await appendJobLog(jobId, msg);
  };

  async function checkpoint(label) {
    if (await isJobAborted(jobId)) throw new CancelledError();
    if (Date.now() > deadline) {
      throw new DeadlineError(`Generation exceeded maximum duration (${limits.MAX_JOB_DURATION_MS / 60000} min)`);
    }
    logger.debug(`[job:${jobId}] checkpoint: ${label}`);
  }

  // ── Stage 0: Intent Memory Update ────────────────────────────────────────
  // Evolve the session's product vision before requirement normalisation.
  // Non-fatal — pipeline continues even if intent memory fails.
  let intentMemory = null;
  let intentSummary = '';
  const effectiveSessionId = sessionId || userId || jobId;
  try {
    const intentResult = updateIntentMemory(effectiveSessionId, userPrompt);
    intentMemory  = intentResult.intentMemory;
    intentSummary = getIntentSummary(intentMemory);
    logger.info(`[job:${jobId}] intent: session="${effectiveSessionId}" prompts=${intentMemory.promptCount} features=[${intentMemory.coreFeatures.join(',')}]`);
    if (intentResult.wasReset) {
      logger.info(`[job:${jobId}] intent: session reset — new project started`);
    }
  } catch (imErr) {
    logger.warn(`[job:${jobId}] intent memory update failed (${imErr.message}), continuing`);
  }

  try {
    await log(`Job started — mode=${mode}, complexity=${complexity.level}, appType=${complexity.appType}`);

    // ── Planning + Coding ─────────────────────────────────────────────────────
    await checkpoint('before planning');
    await setJobStage(jobId, 'planning');

    // Progress callback: update job record as each file streams in.
    let lastProgressUpdate = 0;
    const onProgress = async (progress) => {
      const now = Date.now();
      if (now - lastProgressUpdate < 800) return; // throttle to 1 update/0.8s max
      lastProgressUpdate = now;
      try { await updateJob(jobId, { progress }); } catch (_) {}
    };

    let codeOutput;
    let plan;

    // Inner try/catch: any pipeline error (API down, parse failure, timeout, etc.)
    // falls back to the template generator so the job ALWAYS completes with output.
    // Cancellation and deadline errors are re-thrown — user explicitly stopped it.
    try {
      assertProviderAvailable('plan');
      assertProviderAvailable('code');

      if (shouldUseAdvancedPipeline(mode, complexity)) {
        // ── Advanced 7-stage pipeline (medium/complex + balanced/quality) ───────
        logger.info(`[job:${jobId}] using advanced pipeline`);

        const codingStart   = Date.now();
        const stopHeartbeat = startHeartbeat(log, codingStart, 20_000);

        let advResult;
        try {
          advResult = await runAdvancedPipeline(
            userPrompt, mode, complexity, cost, onProgress,
            async (msg) => { await log(msg); },
            { intentMemory },
          );
        } finally {
          stopHeartbeat();
        }

        await completeJobStage(jobId, 'planning');
        await updateJob(jobId, { plan: { _source: 'advanced', files: advResult.blueprint.fileList } });

        await setJobStage(jobId, 'coding');
        await updateJob(jobId, { progress: null });
        await completeJobStage(jobId, 'coding');

        codeOutput = {
          projectName:  advResult.projectName,
          files:        advResult.files,
          _advanced:    true,
          _blueprint:   advResult.blueprint,
          _validation:  advResult.validationReport,
          _repair:      advResult.repairReport,
        };

        const note = `Advanced pipeline complete — ${advResult.files.length} files (score: ${advResult.validationReport.score})`;
        await log(note);

      } else {
        // ── Legacy pipeline (fast mode or simple prompts) ────────────────────────
        const willSkip = complexity.level === 'simple' || mode === 'fast';
        await log(willSkip ? 'Quick planning...' : 'Planning app structure...');

        const planT0 = Date.now();
        plan   = await runPlanner(userPrompt, mode, complexity);
        const planMs = Date.now() - planT0;

        logger.info(`[job:${jobId}] planner: source=${plan._source} files=${plan.files?.length} ms=${planMs}`);
        if (plan._source === 'inline')   await log(`Using quick plan — ${plan.files?.length} files (${planMs}ms)`);
        if (plan._source === 'fallback') await log(`Using fallback plan (${planMs}ms)`);
        if (plan._source === 'api')      await log(`Planning complete — ${plan.files?.length} files (${planMs}ms)`);

        await completeJobStage(jobId, 'planning');
        await updateJob(jobId, { plan });

        await checkpoint('before coding');
        await setJobStage(jobId, 'coding');

        const { TEMPLATE_TYPES } = require('../generators/templateSystem');
        const isWebsitePrompt = /website|web site|landing|homepage|home page|page for|site for/i.test(userPrompt);
        const isTemplate = willSkip &&
          (TEMPLATE_TYPES.has(complexity.appType) || (complexity.appType === 'generic' && isWebsitePrompt)) &&
          mode !== 'quality';
        await log(isTemplate ? 'Building from template...' : 'Generating project files...');

        const codingStart   = Date.now();
        const stopHeartbeat = isTemplate ? () => {} : startHeartbeat(log, codingStart, 20_000);

        try {
          codeOutput = await runCoder(
            userPrompt,
            plan,
            mode,
            async (attempt) => { await log(`Retry ${attempt} — adjusting approach...`); },
            cost,
            complexity,
            onProgress,
          );
        } finally {
          stopHeartbeat();
        }

        await updateJob(jobId, { progress: null });
        await completeJobStage(jobId, 'coding');
      }

    } catch (pipelineErr) {
      // Re-throw intentional stops — these are not failures
      if (pipelineErr instanceof CancelledError || pipelineErr instanceof DeadlineError) throw pipelineErr;

      // Everything else: log it and fall back to the template generator.
      // generateFallback never throws — it always produces a working landing page.
      logger.warn(`[job:${jobId}] pipeline error — using fallback (${pipelineErr.message})`);
      await log('Encountered an issue — generating from template...');
      codeOutput = generateFallback(userPrompt, null);
      await completeJobStage(jobId, 'planning').catch(() => {});
      await setJobStage(jobId, 'coding').catch(() => {});
      await completeJobStage(jobId, 'coding').catch(() => {});
    }

    // Final safety net: if codeOutput is still empty for any reason, use fallback
    if (!codeOutput || !Array.isArray(codeOutput.files) || codeOutput.files.length === 0) {
      logger.warn(`[job:${jobId}] codeOutput empty after all attempts — last-resort fallback`);
      await log('Using last-resort fallback...');
      codeOutput = generateFallback(userPrompt, null);
    }

    if (!codeOutput._advanced) {
      const genNote = codeOutput._template
        ? `Built from template — ${codeOutput.files.length} files`
        : codeOutput._fallback
          ? `Used fallback template — ${codeOutput.files.length} files`
          : `Generation complete — ${codeOutput.files.length} files`;
      await log(genNote);
    }

    if (codeOutput._template)  await updateJob(jobId, { _usedTemplate: true });
    if (codeOutput._fallback)  await updateJob(jobId, { _usedFallback: true });
    if (codeOutput._advanced)  await updateJob(jobId, { _usedAdvanced: true });

    const rawSlug     = codeOutput.projectName || slugify(userPrompt);
    const projectSlug = slugify(rawSlug) || `project-${jobId.slice(0, 8)}`;

    // Inject ZyraApp SDK into HTML files if backend is needed
    if (codeOutput._needsBackend) {
      await log('Injecting backend SDK...');
      codeOutput = { ...codeOutput, files: injectBackendSDK(codeOutput.files, projectSlug) };
      await updateJob(jobId, { _usedBackend: true });
    }

    // Inject viewport normalize into all HTML files (must be first — before app styles)
    codeOutput = { ...codeOutput, files: injectViewportNormalize(codeOutput.files) };

    // Inject env vars loader into all HTML files (window.__ENV__ pattern)
    codeOutput = { ...codeOutput, files: injectEnvLoader(codeOutput.files, projectSlug) };

    // Inject runtime error catcher into all HTML files
    codeOutput = { ...codeOutput, files: injectRuntimeErrorCatcher(codeOutput.files) };

    // ── Writing files ─────────────────────────────────────────────────────────
    await checkpoint('before writing files');
    await log(`Saving → generated-projects/${projectSlug}/`);

    const { projectDir, written, failed } = await withTimeout(
      generateProject(projectSlug, codeOutput.files),
      limits.FINALIZE_TIMEOUT_MS,
      'File writing',
    );
    await log(`${written.length} files saved${failed.length ? `, ${failed.length} failed` : ''}`);

    // Persist file contents so the project can be restored if disk artifacts are lost
    storeProjectFiles(projectSlug, codeOutput.files).catch(e =>
      logger.warn(`[job:${jobId}] storeProjectFiles failed (non-fatal): ${e.message}`)
    );

    // ── Post-generation auto-debug (non-blocking, non-fatal) ─────────────────
    // Runs a quick static check on the written files; if significant issues are
    // found, fires an auto-fix job so the preview loads cleanly.
    try {
      const { validateGeneratedCode } = require('../utils/codeValidator');
      const staticErrors = validateGeneratedCode(codeOutput.files || []);
      const criticalErrors = staticErrors.filter(e => e.type === 'syntax' || e.type === 'error');
      if (criticalErrors.length > 0) {
        logger.info(`[job:${jobId}] post-gen static check: ${criticalErrors.length} issue(s) — starting auto-fix`);
        const { startDebug } = require('./debugService');
        const errorSignals = criticalErrors.slice(0, 10).map(e => ({
          message: e.message,
          source:  e.file,
          level:   'error',
        }));
        startDebug(projectSlug, { consoleErrors: errorSignals, previewState: 'post_gen', trigger: 'post_gen' }, 'fast', { autoApply: true })
          .then(debugJobId => logger.info(`[job:${jobId}] post-gen auto-fix job: ${debugJobId}`))
          .catch(e => logger.warn(`[job:${jobId}] post-gen auto-fix start failed (non-fatal): ${e.message}`));
      }
    } catch (postDebugErr) {
      logger.warn(`[job:${jobId}] post-gen debug check failed (non-fatal): ${postDebugErr.message}`);
    }

    // ── Reviewing ─────────────────────────────────────────────────────────────
    await checkpoint('before reviewing');
    await setJobStage(jobId, 'reviewing');

    let review;
    // Skip reviewer unless: quality mode AND complex/medium AND not template/fallback/advanced.
    // The advanced pipeline has its own validation stage, so review is redundant.
    // Review adds meaningful value only for high-complexity quality-mode legacy-pipeline projects.
    const skipReview = mode !== 'quality' || codeOutput._template || codeOutput._fallback ||
                       codeOutput._advanced || complexity.level === 'simple';
    if (skipReview) {
      const reason = mode === 'fast' ? 'fast mode' : codeOutput._template ? 'template' :
                     codeOutput._fallback ? 'fallback' : codeOutput._advanced ? 'advanced pipeline' :
                     mode === 'balanced' ? 'balanced mode' : 'simple request';
      await log(`Skipping review (${reason})`);
      review = { passed: null, skipped: true, summary: `Skipped — ${reason}` };
    } else {
      await log('Reviewing generated code...');
      review = await runReviewer(projectSlug, codeOutput.files, mode);
      await log(`Review complete — ${review.passed ? 'passed' : 'issues found'}`);
    }
    await completeJobStage(jobId, 'reviewing');

    // ── Finalizing ────────────────────────────────────────────────────────────
    await checkpoint('before finalizing');
    await setJobStage(jobId, 'finalizing');
    await log('Finalizing project...');

    const generatedBy = codeOutput._advanced ? 'advanced' : codeOutput._template ? 'template' : codeOutput._fallback ? 'fallback' : 'coder';
    await withTimeout(
      saveProject(projectSlug, {
        jobId, prompt: userPrompt, mode, complexity,
        plan:         codeOutput._advanced
                        ? { _source: 'advanced', files: codeOutput._blueprint?.fileList }
                        : plan,
        filesWritten: written, filesFailed: failed,
        projectDir, review, generatedBy,
        appType:      complexity.appType,
        blueprint:    codeOutput._blueprint   || undefined,
        validation:   codeOutput._validation  || undefined,
      }),
      limits.FINALIZE_TIMEOUT_MS,
      'Project save',
    );

    await checkpoint('before completing');
    const duration = formatElapsed(startedAt);
    await log(`Done in ${duration}`);

    // Log cost summary
    const costSummary = cost.summary();
    logger.info(`[job:${jobId}] cost: ${costSummary.calls} calls, ~${costSummary.totalTokens} tokens, ~$${costSummary.estimatedCostUSD}`);

    await updateJob(jobId, {
      status:        'completed',
      projectSlug,
      projectDir,
      filesWritten:  written,
      filesFailed:   failed,
      review,
      completedAt:   now(),
      duration,
      cost:          costSummary,
      intentPayload: intentMemory ? buildUiIntentPayload(intentMemory) : null,
      sessionId:     effectiveSessionId,
    });

    logger.success(`generationService: job ${jobId} completed — "${projectSlug}" in ${duration}`);

    // ── Charge usage (non-fatal) ──────────────────────────────────────────────
    if (userId && chargeUsage) {
      const cs = costSummary;
      chargeUsage(userId, jobId, {
        eventType:    'generation',
        model:        cs.breakdown?.[0]?.model || 'claude-sonnet-4-6',
        inputTokens:  cs.promptTokens   || 0,
        outputTokens: cs.completionTokens || 0,
        toolCalls:    0,
        metadata:     { slug: projectSlug, mode, appType: complexity.appType },
      }).catch((e) => logger.warn(`[job:${jobId}] billing chargeUsage failed (non-fatal): ${e.message}`));
    }

  } catch (err) {
    const elapsed = formatElapsed(startedAt);
    const type    = err.type || 'failed';

    logger.error(`generationService: job ${jobId} → ${type} after ${elapsed}`, {
      error: err.message, errorType: err.errorType,
    });

    const userMsg = categoriseError(err, type);
    await log(`${type === 'cancelled' ? 'Cancelled' : type === 'timed_out' ? 'Timed out' : 'Failed'}: ${userMsg}`);

    const terminalUpdate = {
      status:    type,
      error:     userMsg,
      errorType: err.errorType,
      duration:  elapsed,
    };
    if (type === 'cancelled')  terminalUpdate.cancelledAt = now();
    if (type === 'timed_out')  terminalUpdate.timedOutAt  = now();
    if (type === 'failed')     terminalUpdate.failedAt    = now();

    await updateJob(jobId, terminalUpdate, { force: true });
    if (type === 'timed_out') await markJobTimedOut(jobId, err.message);
  }
}

function categoriseError(err, type) {
  if (type === 'cancelled')                             return 'Generation cancelled by user';
  if (type === 'timed_out')                            return 'Generation timed out — try a simpler prompt or fast mode';
  if (err.errorType === 'timeout_error')               return 'Code generation timed out — model took too long';
  if (err.errorType === 'api_error')                   return 'AI provider error — check your API key and try again';
  if (err.errorType === 'parse_error')                 return 'Code generation produced an unexpected format (retries exhausted)';
  if (err.errorType === 'schema_error')                return 'Generated output was missing required fields';
  if (err.message?.includes('ANTHROPIC_API_KEY') ||
      err.message?.includes('OPENAI_API_KEY'))         return 'API key not configured — check your .env.local file';
  if (err.message?.includes('File writing'))           return 'Failed to write project files — check disk space';
  return err.message;
}

module.exports = { startGeneration, getActiveJobCount, forceReleaseJob };
