/**
 * Credit Engine
 *
 * Computes the credits consumed by a single request.
 * All metering logic is in one place so it is easy to audit and change.
 *
 * Formula:
 *   credits = ceil((baseFee + tokenCredits) * modelMultiplier) + toolCredits
 *
 * where:
 *   tokenCredits = ceil(inputTokens / 1000)  * INPUT_RATE
 *                + ceil(outputTokens / 1000) * OUTPUT_RATE
 */

const {
  MODEL_MULTIPLIERS,
  EVENT_BASE_COSTS,
  TOKEN_RATES,
  TOOL_CALL_COST,
} = require('../config/billing');

/**
 * Computes actual credits for a completed request.
 *
 * @param {object} params
 * @param {string} params.eventType   - 'generation' | 'edit' | 'deploy' | 'debug' | 'api_call'
 * @param {string} [params.model]     - model identifier (e.g. 'claude-opus-4-6')
 * @param {number} [params.inputTokens]
 * @param {number} [params.outputTokens]
 * @param {number} [params.toolCalls]
 * @returns {{ credits: number, breakdown: object, rateSnapshot: object }}
 */
function computeCredits({ eventType, model, inputTokens = 0, outputTokens = 0, toolCalls = 0 }) {
  const baseFee    = EVENT_BASE_COSTS[eventType] ?? EVENT_BASE_COSTS.api_call;
  const modelMul   = MODEL_MULTIPLIERS[model]    ?? MODEL_MULTIPLIERS.default;

  const inputCreds  = Math.ceil(inputTokens  / 1000) * TOKEN_RATES.input_per_1k;
  const outputCreds = Math.ceil(outputTokens / 1000) * TOKEN_RATES.output_per_1k;
  const tokenCreds  = inputCreds + outputCreds;
  const toolCreds   = toolCalls * TOOL_CALL_COST;

  const credits = Math.max(1, Math.ceil((baseFee + tokenCreds) * modelMul) + toolCreds);

  return {
    credits,
    breakdown: {
      baseFee,
      modelMul,
      inputCreds,
      outputCreds,
      tokenCreds,
      toolCreds,
      inputTokens,
      outputTokens,
      toolCalls,
    },
    rateSnapshot: {
      eventType,
      model:           model || 'unknown',
      modelMultiplier: modelMul,
      inputRate:       TOKEN_RATES.input_per_1k,
      outputRate:      TOKEN_RATES.output_per_1k,
      toolRate:        TOOL_CALL_COST,
      baseFee,
      schemaVersion:   '1.0',
    },
  };
}

/**
 * Estimates the maximum credits a request might consume (pre-flight check).
 * Uses a pessimistic output token count when actual output is not yet known.
 *
 * @param {object} params
 * @param {string} params.eventType
 * @param {string} [params.model]
 * @param {number} [params.inputTokens]
 * @param {number} [params.maxOutputTokens]  - plan-level cap (pessimistic estimate)
 * @returns {number} estimated credits
 */
function estimateCredits({ eventType, model, inputTokens = 0, maxOutputTokens = 4096 }) {
  return computeCredits({
    eventType,
    model,
    inputTokens,
    outputTokens: maxOutputTokens,
    toolCalls:    0,
  }).credits;
}

module.exports = { computeCredits, estimateCredits };
