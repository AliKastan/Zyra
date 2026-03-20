const { startGeneration, getActiveJobCount } = require('../services/generationService');
const { classifyComplexity } = require('../utils/complexity');
const limits = require('../config/limits');
const logger = require('../utils/logger');

const VALID_MODES = ['2d', '3d', 'balanced', 'quality'];

/**
 * POST /api/generate
 * Body: { prompt: string, mode?: '2d' | '3d', sessionId?: string }
 */
async function handleGenerate(req, res) {
  const { prompt, mode = '2d', sessionId } = req.body;
  const userId = req.user?.id;
  const isBeta = req.user?._beta === true;

  logger.info(`[GEN] api_route_entered user=${userId} mode=${mode} beta=${isBeta}`);

  // ── Validate prompt ───────────────────────────────────────────────────────
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    logger.warn('[GEN] request_payload_built=INVALID reason=empty_prompt');
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  const trimmed = prompt.trim();

  if (trimmed.length > limits.MAX_PROMPT_CHARS) {
    logger.warn(`[GEN] request_payload_built=INVALID reason=prompt_too_long chars=${trimmed.length}`);
    return res.status(400).json({
      error: `Prompt is too long (${trimmed.length} chars). Maximum is ${limits.MAX_PROMPT_CHARS} characters. Try simplifying your request.`,
    });
  }

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > limits.MAX_PROMPT_WORDS) {
    logger.warn(`[GEN] request_payload_built=INVALID reason=prompt_too_many_words words=${wordCount}`);
    return res.status(400).json({
      error: `Prompt is too long (${wordCount} words). Maximum is ${limits.MAX_PROMPT_WORDS} words.`,
    });
  }

  logger.info(`[GEN] request_payload_built mode=${mode} words=${wordCount} chars=${trimmed.length}`);

  // ── Validate mode ─────────────────────────────────────────────────────────
  if (!VALID_MODES.includes(mode)) {
    logger.warn(`[GEN] request_payload_built=INVALID reason=bad_mode mode=${mode}`);
    return res.status(400).json({
      error: `Invalid mode "${mode}". Valid modes: ${VALID_MODES.join(', ')}.`,
    });
  }

  // ── Concurrency guard (per-user) ──────────────────────────────────────────
  if (getActiveJobCount(userId) >= limits.MAX_CONCURRENT_JOBS) {
    logger.warn(`[GEN] billing_guard_result=BLOCKED reason=job_in_progress user=${userId}`);
    return res.status(429).json({
      error: 'A generation is already in progress.',
      code:  'JOB_IN_PROGRESS',
      hint:  'Cancel the running job to start a new one.',
    });
  }

  // ── Classify complexity ───────────────────────────────────────────────────
  const complexity = classifyComplexity(trimmed);
  logger.info(`[GEN] provider_selected complexity=${complexity.level} appType=${complexity.appType}`);

  try {
    const jobId = await startGeneration(trimmed, mode, { userId, sessionId: sessionId || userId });
    logger.info(`[GEN] response_sent_to_client jobId=${jobId} mode=${mode} complexity=${complexity.level}`);

    return res.status(202).json({
      jobId,
      mode,
      complexity,
      message: 'Generation started.',
    });
  } catch (err) {
    logger.error(`[GEN] response_sent_to_client=FAILED error="${err.message}" category=internal_zyra_logic`);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/generate/complexity
 * Query: { prompt: string }
 */
function handleComplexity(req, res) {
  const prompt = req.query.prompt || '';
  if (!prompt) return res.json({ level: 'simple', estimate: '30–90 seconds', score: 0 });
  return res.json(classifyComplexity(prompt));
}

module.exports = { handleGenerate, handleComplexity };