const { startGeneration, getActiveJobCount } = require('../services/generationService');
const { classifyComplexity } = require('../utils/complexity');
const limits = require('../config/limits');
const logger = require('../utils/logger');

const VALID_MODES = ['fast', 'balanced', 'quality'];

/**
 * POST /api/generate
 * Body: { prompt: string, mode?: 'fast' | 'balanced' | 'quality' }
 */
async function handleGenerate(req, res) {
  const { prompt, mode = 'balanced' } = req.body;

  // ── Validate prompt ───────────────────────────────────────────────────────
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  const trimmed = prompt.trim();

  if (trimmed.length > limits.MAX_PROMPT_CHARS) {
    return res.status(400).json({
      error: `Prompt is too long (${trimmed.length} chars). Maximum is ${limits.MAX_PROMPT_CHARS} characters. Try simplifying your request.`,
    });
  }

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > limits.MAX_PROMPT_WORDS) {
    return res.status(400).json({
      error: `Prompt is too long (${wordCount} words). Maximum is ${limits.MAX_PROMPT_WORDS} words.`,
    });
  }

  // ── Validate mode ─────────────────────────────────────────────────────────
  if (!VALID_MODES.includes(mode)) {
    return res.status(400).json({
      error: `Invalid mode "${mode}". Must be one of: ${VALID_MODES.join(', ')}.`,
    });
  }

  // ── Concurrency guard ─────────────────────────────────────────────────────
  if (getActiveJobCount() >= limits.MAX_CONCURRENT_JOBS) {
    return res.status(429).json({
      error: 'A generation is already in progress. Please wait for it to complete or cancel it.',
    });
  }

  // ── Classify complexity (informational, included in response) ─────────────
  const complexity = classifyComplexity(trimmed);

  try {
    const userId = req.user?.id;
    const jobId = await startGeneration(trimmed, mode, { userId });
    logger.info(`generateController: job ${jobId} started (mode=${mode}, complexity=${complexity.level})`);

    return res.status(202).json({
      jobId,
      mode,
      complexity,
      message: 'Generation started.',
    });
  } catch (err) {
    logger.error('generateController: failed to start generation', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/generate/complexity
 * Query: { prompt: string }
 * Returns complexity classification without starting a job.
 */
function handleComplexity(req, res) {
  const prompt = req.query.prompt || '';
  if (!prompt) return res.json({ level: 'simple', estimate: '30–90 seconds', score: 0 });
  return res.json(classifyComplexity(prompt));
}

module.exports = { handleGenerate, handleComplexity };
