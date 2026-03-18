const { callClaude, HAIKU_MODEL } = require('../providers/anthropicProvider');
const { callOpenAI } = require('../providers/openaiProvider');
const { buildPlannerPrompt } = require('../generators/promptBuilder');
const { getInlinePlan, getFallbackPlan } = require('../generators/inlinePlanner');
const { safeJsonParse } = require('../utils/safeJsonParse');
const { withTimeout } = require('../utils/withTimeout');
const { elapsedMs } = require('../utils/generationTimer');
const { env } = require('../config/env');
const limits = require('../config/limits');
const logger = require('../utils/logger');

/**
 * Resolves which planner timeout to use based on complexity and mode.
 */
function getPlannerTimeout(complexityLevel, mode) {
  if (complexityLevel === 'simple') return limits.SIMPLE_PLANNER_TIMEOUT_MS;
  if (mode === 'quality')           return limits.QUALITY_PLANNER_TIMEOUT_MS;
  return limits.BALANCED_PLANNER_TIMEOUT_MS;
}

/**
 * Resolves the max file count based on complexity and mode.
 */
function getMaxFiles(complexityLevel, mode) {
  if (complexityLevel === 'simple') return limits.SIMPLE_MAX_FILES || 6;
  if (complexityLevel === 'medium') return limits.MEDIUM_MAX_FILES || 12;
  return limits.MODE_MAX_FILES[mode] || 12;
}

/**
 * Validates and normalizes a plan object returned by the API.
 * Returns null if the plan is unusable.
 */
function validatePlan(data) {
  if (!data || typeof data !== 'object') return null;
  if (!Array.isArray(data.files) || data.files.length === 0) return null;
  return data;
}

/**
 * Calls the planner API with an aggressive timeout.
 * Returns null on timeout or failure (caller should use fallback).
 */
async function callPlannerAPI(userPrompt, mode, timeoutMs) {
  const { system, user } = buildPlannerPrompt(userPrompt, mode);
  const modelName = env.DEFAULT_PLANNER_MODEL;
  const maxTokens = limits.MODE_TOKENS[mode]?.planner || 600;

  // Planner outputs small structured JSON — Haiku is fast and cheap
  const call = modelName === 'openai'
    ? callOpenAI(system, user, { maxTokens })
    : callClaude(system, user, { maxTokens, model: HAIKU_MODEL });

  let raw;
  try {
    raw = await withTimeout(call, timeoutMs, `Planner (${timeoutMs / 1000}s limit)`);
  } catch (err) {
    logger.warn(`plannerService: API call failed/timed out — ${err.message}`);
    return null;
  }

  const { success, data } = safeJsonParse(raw);
  if (!success) {
    logger.warn('plannerService: API returned unparseable JSON');
    return null;
  }

  return validatePlan(data);
}

/**
 * Main planner entry point.
 *
 * Routing logic (in order):
 *   1. SIMPLE complexity OR fast mode → inline plan (0ms, no API call)
 *   2. MEDIUM/COMPLEX                 → API call with aggressive timeout
 *   3. Timeout / failure              → fallback plan (instant)
 *
 * @param {string} userPrompt
 * @param {string} mode       - 'fast' | 'balanced' | 'quality'
 * @param {object} complexity - from classifyComplexity()
 * @returns {Promise<object>} plan with _source: 'inline' | 'api' | 'fallback'
 */
async function runPlanner(userPrompt, mode = 'balanced', complexity = {}) {
  const level    = complexity.level    || 'medium';
  const gameType = complexity.appType  || 'generic-game';
  const t0       = Date.now();

  // ── Tier 1: Inline plan for simple requests / fast mode ───────────────────
  if (level === 'simple' || mode === 'fast') {
    const plan = getInlinePlan(gameType, userPrompt);
    logger.success(`plannerService: inline plan — gameType="${gameType}" [${Date.now() - t0}ms]`);
    return plan;
  }

  // ── Tier 2: API planner for medium/complex games ──────────────────────────
  const timeoutMs = getPlannerTimeout(level, mode);
  logger.info(`plannerService: API call — level="${level}" mode="${mode}" timeout=${timeoutMs}ms`);

  const plan = await callPlannerAPI(userPrompt, mode, timeoutMs);

  if (plan) {
    const maxFiles = getMaxFiles(level, mode);
    if (plan.files.length > maxFiles) {
      logger.warn(`plannerService: trimming files ${plan.files.length} → ${maxFiles}`);
      plan.files = plan.files.slice(0, maxFiles);
    }
    const duration = Date.now() - t0;
    logger.success(`plannerService: API plan — ${plan.files.length} files [${duration}ms]`);
    return { ...plan, _source: 'api' };
  }

  // ── Tier 3: Fallback plan ─────────────────────────────────────────────────
  logger.warn(`plannerService: using fallback plan for gameType="${gameType}"`);
  const fallback = getFallbackPlan(userPrompt, gameType);
  logger.success(`plannerService: fallback plan — ${fallback.files.length} files [${Date.now() - t0}ms]`);
  return fallback;
}

module.exports = { runPlanner };
