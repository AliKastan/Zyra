/**
 * Edit Service — modifies an existing generated project in-place.
 *
 * Pipeline:
 *   1. Load existing project files from disk
 *   2. Call the edit coder (AI returns only changed files)
 *   3. Patch changed files (writeFiles — no directory wipe)
 *   4. Update project metadata
 *   5. Complete job with same projectSlug so frontend refreshes the preview
 */

const path   = require('path');
const fse    = require('fs-extra');
const { v4: uuidv4 }        = require('uuid');
const { now }               = require('../utils/timestamps');
const { formatElapsed }     = require('../utils/generationTimer');
const { withTimeout }       = require('../utils/withTimeout');
const { callClaude, callClaudeStream, HAIKU_MODEL, SONNET_MODEL } = require('../providers/anthropicProvider');
const { callOpenAI }        = require('../providers/openaiProvider');
const { buildEditCoderPrompt } = require('../generators/promptBuilder');
const { safeJsonParse }     = require('../utils/safeJsonParse');
const { parseFileDelimited } = require('../utils/parseFileDelimited');
const { classifyEditType, hasStyleOnlyWords } = require('../utils/intentClassifier');
const { getEditTier, filterFilesForEdit, applyLocalTransform, TIER_BUDGETS } = require('../utils/editTier');
const { writeFiles }        = require('../generators/fileWriter');
const { createCostTracker } = require('../utils/costTracker');
const { getProject, updateProject } = require('../storage/projectStore');
const {
  createJob, updateJob, appendJobLog,
  setJobStage, completeJobStage,
  isJobAborted, markJobTimedOut,
} = require('../storage/jobStore');
const { GENERATED_PROJECTS_DIR } = require('../generators/projectGenerator');
const { env }    = require('../config/env');
const limits     = require('../config/limits');
const logger     = require('../utils/logger');

// Section regeneration planning (non-fatal)
let sectionRegen;
try { sectionRegen = require('../lib/section-regeneration'); } catch (_) { sectionRegen = null; }

// Shared concurrency guard with generationService
const activeJobs = new Set();
let chargeUsage;
try { chargeUsage = require('../billing/meter').chargeUsage; } catch (_) { chargeUsage = null; }
function getActiveEditCount() { return activeJobs.size; }

class CancelledError extends Error {
  constructor() { super('Edit was cancelled by user'); this.type = 'cancelled'; }
}
class DeadlineError extends Error {
  constructor(msg) { super(msg); this.type = 'timed_out'; }
}

// ── Public entry point ────────────────────────────────────────────────────────

async function startEdit(userPrompt, projectSlug, mode = 'balanced', options = {}) {
  const { userId } = options;
  const jobId     = uuidv4();
  const startedAt = now();

  await createJob(jobId, {
    prompt: userPrompt,
    mode,
    projectSlug,
    isEdit: true,
    status: 'queued',
    startedAt,
  });

  activeJobs.add(jobId);
  logger.info(`editService: job ${jobId} — editing "${projectSlug}" mode="${mode}"`);

  runEditPipeline(jobId, userPrompt, projectSlug, mode, startedAt, userId)
    .catch((err) => logger.error(`editService: unhandled error for job ${jobId}`, { error: err.message }))
    .finally(() => activeJobs.delete(jobId));

  return jobId;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function runEditPipeline(jobId, userPrompt, projectSlug, mode, startedAt, userId) {
  const deadline = new Date(startedAt).getTime() + (limits.MAX_JOB_DURATION_MS || 600_000);
  const cost     = createCostTracker();

  const log = async (msg) => {
    logger.info(`[edit:${jobId}] ${msg}`);
    await appendJobLog(jobId, msg);
  };

  async function checkpoint(label) {
    if (await isJobAborted(jobId)) throw new CancelledError();
    if (Date.now() > deadline) throw new DeadlineError('Edit exceeded maximum duration');
    logger.debug(`[edit:${jobId}] checkpoint: ${label}`);
  }

  try {
    await log(`Editing "${projectSlug}" — mode=${mode}`);

    // ── Load project context + metadata ───────────────────────────────────────
    const project = await getProject(projectSlug);
    const projectContext = project ? {
      originalPrompt: project.prompt || project.originalPrompt || null,
      appType:        project.appType || null,
      title:          project.title || null,
    } : {};
    const projectMeta = { generatedBy: project?.generatedBy || 'coder' };

    // ── Classify edit type + tier ──────────────────────────────────────────────
    const editType  = classifyEditType(userPrompt);
    const styleEdit = hasStyleOnlyWords(userPrompt);
    const tier      = getEditTier(editType);
    logger.info(`[edit:${jobId}] editType=${editType} tier=${tier} styleEdit=${styleEdit} generatedBy=${projectMeta.generatedBy}`);
    await log(`Edit: ${editType} tier=${tier}`);

    // ── Load existing project files ────────────────────────────────────────────
    await checkpoint('before loading');
    await setJobStage(jobId, 'loading');

    const projectDir    = path.join(GENERATED_PROJECTS_DIR, projectSlug);
    const allFiles      = await loadProjectFiles(projectDir);
    await log(`Loaded ${allFiles.length} files`);
    await completeJobStage(jobId, 'loading');

    // ── Section regeneration plan (non-fatal, planning only) ──────────────────
    let sectionRegenReport = null;
    let sectionRegenPayload = null;
    if (sectionRegen) {
      try {
        const filesMap = Object.fromEntries(allFiles.map(f => [f.path, f.content]));
        sectionRegenReport  = sectionRegen.runSectionRegeneration({
          userPrompt,
          currentFiles:   filesMap,
          projectContext: { ...projectContext, existingFiles: filesMap },
        });
        sectionRegenPayload = sectionRegen.buildUiSectionRegenerationPayload(sectionRegenReport);
        logger.info(`[edit:${jobId}] sectionRegen: ${sectionRegen.summarizeSectionRegeneration(sectionRegenReport)}`);
      } catch (srErr) {
        logger.warn(`[edit:${jobId}] sectionRegen planning failed (non-fatal): ${srErr.message}`);
      }
    }

    // ── Tier 0: local transform (0 model calls) ────────────────────────────────
    await checkpoint('before editing');
    await setJobStage(jobId, 'coding');

    const localResult = applyLocalTransform(userPrompt, editType, allFiles, projectMeta);
    if (localResult) {
      await log(`Local transform applied (0 tokens)`);
      cost.recordLocal('edit-local', `${editType} — ${userPrompt.slice(0, 60)}`);
      await completeJobStage(jobId, 'coding');

      // Patch files and complete
      await setJobStage(jobId, 'finalizing');
      await fse.ensureDir(projectDir);
      const result = await withTimeout(
        writeFiles(projectDir, localResult),
        limits.FINALIZE_TIMEOUT_MS || 30_000,
        'File patching (local)',
      );
      await updateProject(projectSlug, {
        lastEdit: { jobId, prompt: userPrompt, mode, filesChanged: result.written, editedAt: now(), tier: 0, editType },
      });
      const duration = formatElapsed(startedAt);
      const costSummary = cost.summary();
      logger.info(`[edit:${jobId}] local transform done in ${duration} — $0.0000`);
      await updateJob(jobId, {
        status: 'completed', projectSlug, projectDir,
        filesWritten: result.written, filesFailed: result.failed, isEdit: true,
        completedAt: now(), duration, cost: costSummary,
        editSummary: `Local transform: ${result.written.length} file(s) patched`,
        editTier: 0, editType,
        sectionRegenPayload,
      });
      logger.success(`editService: job ${jobId} completed (local) — patched "${projectSlug}" in ${duration}`);
      return;
    }

    // ── Tier 1–3: AI-assisted edit ─────────────────────────────────────────────
    // Filter files to only what this edit type actually needs
    const targetFiles = filterFilesForEdit(allFiles, editType);
    await log(`Applying ${editType.toLowerCase().replace(/_/g, ' ')} (tier ${tier}, ${targetFiles.length}/${allFiles.length} files)...`);

    let changedFiles = await runEditCoder(
      userPrompt, targetFiles, projectSlug, mode, cost, editType, projectContext, tier
    );

    // ── Validate: reject literal style-word interpretation ───────────────────
    if (styleEdit && changedFiles && changedFiles.length > 0) {
      const violation = detectLiteralInterpretation(userPrompt, changedFiles);
      if (violation) {
        await log(`Validation: literal style word "${violation}" detected as content — retrying`);
        logger.warn(`[edit:${jobId}] literal interpretation detected: "${violation}" — retrying`);
        changedFiles = await runEditCoder(
          userPrompt, targetFiles, projectSlug, mode, cost, editType, projectContext, tier,
          { forceDesignOnly: true }
        );
      }
    }

    await completeJobStage(jobId, 'coding');

    if (!changedFiles || changedFiles.length === 0) {
      await log('No files changed (nothing to patch)');
    } else {
      await log(`${changedFiles.length} file${changedFiles.length !== 1 ? 's' : ''} to update`);
    }

    // ── Patch files ───────────────────────────────────────────────────────────
    await checkpoint('before writing');
    await setJobStage(jobId, 'finalizing');
    await log('Saving changes...');

    let written = [];
    let failed  = [];

    if (changedFiles && changedFiles.length > 0) {
      await fse.ensureDir(projectDir);
      const result = await withTimeout(
        writeFiles(projectDir, changedFiles),
        limits.FINALIZE_TIMEOUT_MS || 30_000,
        'File patching',
      );
      written = result.written;
      failed  = result.failed;
      await log(`${written.length} file${written.length !== 1 ? 's' : ''} patched${failed.length ? `, ${failed.length} failed` : ''}`);
    }

    // ── Update project metadata ───────────────────────────────────────────────
    await updateProject(projectSlug, {
      lastEdit: {
        jobId, prompt: userPrompt, mode,
        filesChanged: written, editedAt: now(),
        editType, tier,
      },
    });

    // ── Complete ──────────────────────────────────────────────────────────────
    await checkpoint('before completing');
    const duration = formatElapsed(startedAt);
    await log(`Done in ${duration}`);

    const costSummary = cost.summary();
    logger.info(`[edit:${jobId}] cost: ${costSummary.calls} calls, ~${costSummary.totalTokens} tokens, ~$${costSummary.estimatedCostUSD} tier=${tier} contextChars=${costSummary.totalContextChars}`);

    await updateJob(jobId, {
      status:       'completed',
      projectSlug,
      projectDir,
      filesWritten: written,
      filesFailed:  failed,
      isEdit:       true,
      completedAt:  now(),
      duration,
      cost:         costSummary,
      editTier:     tier,
      editType,
      editSummary:  `Modified ${written.length} file${written.length !== 1 ? 's' : ''}: ${written.join(', ')}`,
      sectionRegenPayload,
    });

    logger.success(`editService: job ${jobId} completed — patched "${projectSlug}" in ${duration} (tier=${tier})`);

    // ── Charge usage (non-fatal) ──────────────────────────────────────────────
    if (userId && chargeUsage) {
      const cs = costSummary;
      chargeUsage(userId, jobId, {
        eventType:    'edit',
        model:        cs.breakdown?.[0]?.model || 'claude-sonnet-4-6',
        inputTokens:  cs.promptTokens    || 0,
        outputTokens: cs.completionTokens || 0,
        toolCalls:    0,
        metadata:     { slug: projectSlug, mode, tier, editType },
      }).catch((e) => logger.warn(`[edit:${jobId}] billing chargeUsage failed (non-fatal): ${e.message}`));
    }

  } catch (err) {
    const elapsed = formatElapsed(startedAt);
    const type    = err.type || 'failed';

    logger.error(`editService: job ${jobId} → ${type} after ${elapsed}`, { error: err.message });

    const terminalUpdate = { status: type, error: err.message, duration: elapsed };
    if (type === 'cancelled') terminalUpdate.cancelledAt = now();
    if (type === 'timed_out') terminalUpdate.timedOutAt  = now();
    if (type === 'failed')    terminalUpdate.failedAt    = now();

    await updateJob(jobId, terminalUpdate, { force: true });
    if (type === 'timed_out') await markJobTimedOut(jobId, err.message);
  }
}

// ── Edit coder ────────────────────────────────────────────────────────────────

async function runEditCoder(userPrompt, existingFiles, projectSlug, mode, costTracker, editType = 'GENERAL_EDIT', projectContext = {}, tier = 3, opts = {}) {
  const modelName = env.DEFAULT_CODER_MODEL;
  // Model tiering for edits:
  //   Tier 1 (CSS/copy, single file) → Haiku — simple targeted changes, very cheap
  //   Tier 2 (layout/component)      → Haiku — still focused, Haiku handles well
  //   Tier 3 (bug fix, new feature)  → Sonnet — complex reasoning needed
  const claudeModel = tier <= 2 ? HAIKU_MODEL : SONNET_MODEL;
  // Use tier-based token budget — much cheaper than full generation budget
  const maxTokens = TIER_BUDGETS[tier] || limits.MODE_TOKENS?.[mode]?.coder || 12_000;

  logger.info(`editService: edit-coder model="${modelName}" claude="${claudeModel}" tier=${tier} maxTokens=${maxTokens} files=${existingFiles.length} editType=${editType}`);

  let { system, user, contextChars } = buildEditCoderPrompt(
    userPrompt, existingFiles, projectSlug, editType, projectContext, tier
  );

  // Retry with reinforced anti-literal instruction (appended to keep prompt compact)
  if (opts.forceDesignOnly) {
    user = user + `\nREMINDER: Apply as CSS only. Style words must NEVER become page text/headings.`;
  }

  // Tier 3 uses streaming (Sonnet, up to 14K tokens — takes 3-5 min, streaming keeps connection alive)
  // Tier 1/2 use non-streaming (Haiku, small output, fast enough)
  const useStream = tier >= 3 && modelName !== 'openai';

  let raw;
  try {
    const call = modelName === 'openai'
      ? callOpenAI(system, user, { maxTokens })
      : (useStream
          ? callClaudeStream(system, user, { maxTokens, model: claudeModel })
          : callClaude(system, user, { maxTokens, model: claudeModel }));

    raw = await withTimeout(call, limits.CODER_TIMEOUT_MS || 300_000, 'EditCoder');
  } catch (err) {
    logger.error(`editService: edit-coder API/timeout error`, { error: err.message });
    throw Object.assign(new Error(`Edit coder failed: ${err.message}`), { type: 'failed' });
  }

  if (costTracker) costTracker.record('edit-coder', system, user, raw, { tier, editType, contextChars, filesInContext: existingFiles.length });

  // Tier 3 uses ---FILE--- delimiter format (no JSON escaping issues for large code outputs)
  // Tier 1/2 use JSON format (small controlled outputs)
  if (tier >= 3) {
    const { success, files } = parseFileDelimited(raw);
    if (!success || files.length === 0) {
      // Fallback: try JSON parse in case the model used JSON anyway
      const { success: jsonOk, data } = safeJsonParse(raw);
      if (jsonOk && data) {
        const jsonFiles = Array.isArray(data.files) ? data.files : [];
        return jsonFiles
          .filter((f) => f && typeof f.path === 'string' && f.path.trim())
          .map((f) => ({ path: f.path.trim(), content: typeof f.content === 'string' ? f.content : String(f.content || '') }));
      }
      logger.warn('editService: edit-coder (tier3) returned no parseable output, no changes applied');
      return [];
    }
    return files;
  }

  const { success, data } = safeJsonParse(raw);
  if (!success || !data) {
    logger.warn('editService: edit-coder returned invalid JSON, no changes applied');
    return [];
  }

  // Accept both { files: [...] } and { projectName, files: [...] }
  const jsonFiles = Array.isArray(data.files) ? data.files : [];
  return jsonFiles
    .filter((f) => f && typeof f.path === 'string' && f.path.trim())
    .map((f) => ({
      path:    f.path.trim(),
      content: typeof f.content === 'string' ? f.content : String(f.content || ''),
    }));
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Detect if the AI literally turned style/aesthetic words into visible page content.
 * Returns the offending word/phrase if found in an HTML file's body content, or null.
 *
 * @param {string} userPrompt
 * @param {Array<{path: string, content: string}>} changedFiles
 * @returns {string|null}
 */
function detectLiteralInterpretation(userPrompt, changedFiles) {
  // Extract potential style words from the prompt (2+ word sequences)
  const STYLE_INDICATORS = [
    /black and white/i, /monochrome/i, /grayscale/i, /minimalist/i, /minimal design/i,
    /dark mode/i, /light mode/i, /dark theme/i, /light theme/i,
    /modern design/i, /clean design/i, /elegant design/i, /bold design/i,
    /colorful/i, /vibrant/i, /retro design/i, /futuristic/i,
  ];

  // Only check HTML files
  const htmlFiles = changedFiles.filter(f => f.path.endsWith('.html') || f.path.endsWith('.htm'));
  if (!htmlFiles.length) return null;

  for (const indicator of STYLE_INDICATORS) {
    if (!indicator.test(userPrompt)) continue;

    // Extract the matched style phrase
    const matchArr = userPrompt.match(indicator);
    if (!matchArr) continue;
    const stylePhrase = matchArr[0];

    // Check if the style phrase now appears as visible text in an HTML heading/title
    const headingPattern = new RegExp(
      `<(h[1-6]|title|p|span|div)[^>]*>[^<]*${stylePhrase.replace(/\s+/g, '\\s*')}[^<]*<\/`,
      'i'
    );

    for (const file of htmlFiles) {
      if (headingPattern.test(file.content)) {
        return stylePhrase;
      }
    }
  }

  return null;
}

// ── File loader ───────────────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.ts', '.jsx', '.tsx',
  '.json', '.md', '.txt', '.svg', '.xml', '.yaml', '.yml',
  '.env', '.env.example', '.gitignore', '.sh',
]);

/**
 * Recursively reads all text files from a project directory.
 * Binary/unknown-extension files are skipped.
 *
 * @param {string} projectDir
 * @returns {Promise<Array<{path: string, content: string}>>}
 */
async function loadProjectFiles(projectDir) {
  if (!(await fse.pathExists(projectDir))) return [];

  const files = [];
  await walk(projectDir, projectDir, files);
  return files;
}

async function walk(dir, rootDir, result) {
  const entries = await fse.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore' && entry.name !== '.env.example') continue;
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

module.exports = { startEdit, getActiveEditCount };
