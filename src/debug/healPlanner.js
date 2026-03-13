'use strict';

/**
 * healPlanner.js
 * Generates a multi-iteration heal plan using AI.
 * Returns plans for user review — does NOT auto-apply any patches.
 */

const { callClaude }    = require('../providers/anthropicProvider');
const { callOpenAI }    = require('../providers/openaiProvider');
const { safeJsonParse } = require('../utils/safeJsonParse');
const { withTimeout }   = require('../utils/withTimeout');
const { env }           = require('../config/env');
const logger            = require('../utils/logger');
const { maskString }    = require('./secretMasker');

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 3;
const HEAL_TIMEOUT   = 50000;

// ── System prompt ─────────────────────────────────────────────────────────────

const HEAL_SYSTEM_PROMPT = `You are an AI repair engineer. Generate a minimal, safe repair plan. Return JSON only:
{
  "strategy": "one sentence describing the repair approach",
  "canAutoHeal": true,
  "iterations": [
    {
      "number": 1,
      "issueType": "category",
      "rootCause": "what causes this",
      "confidence": 0.0,
      "affectedFiles": ["file.js"],
      "patch": [{"path": "file.js", "content": "COMPLETE file content"}],
      "reasoning": "why this patch fixes the issue",
      "estimatedImpact": "what this should fix"
    }
  ]
}
Rules: patches must be complete file contents, not diffs. Max ${MAX_ITERATIONS} iterations. Minimal changes only. canAutoHeal=true only if all patches are safe small fixes. Never include secrets.`;

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Build the user prompt for the heal planner.
 */
function buildHealPrompt(debugContext, ruleIssue, allFiles, signals) {
  const parts = [];

  // Rule engine finding
  if (ruleIssue) {
    parts.push(`## Rule Engine Finding\nType: ${ruleIssue.type}\nTitle: ${ruleIssue.title}\nDescription: ${ruleIssue.description}\nConfidence: ${ruleIssue.confidence}\nSuggestion: ${ruleIssue.suggestion || 'N/A'}`);
  }

  // Error summary
  if (debugContext && debugContext.errors) {
    const { totalErrors, criticalCount, highCount, clusters } = debugContext.errors;
    parts.push(`## Error Summary\nTotal: ${totalErrors}, Critical: ${criticalCount}, High: ${highCount}`);
    if (clusters && clusters.length > 0) {
      const topClusters = clusters.slice(0, 5).map((c, i) =>
        `${i + 1}. [${c.severity.toUpperCase()}] ${c.representativeMessage.slice(0, 200)}`
      ).join('\n');
      parts.push(`## Top Errors\n${topClusters}`);
    }
  }

  // Signals
  if (signals) {
    const sigParts = [];
    if (signals.previewState)    sigParts.push(`Preview state: ${signals.previewState}`);
    if (signals.userDescription) sigParts.push(`User description: ${maskString(signals.userDescription)}`);
    if (sigParts.length > 0)     parts.push(`## Signals\n${sigParts.join('\n')}`);
  }

  // Project files (from context)
  if (debugContext && debugContext.files && debugContext.files.length > 0) {
    const fileList = debugContext.files.map((f) =>
      `### ${f.path}\n\`\`\`\n${(f.content || '').slice(0, 2000)}\n\`\`\``
    ).join('\n\n');
    parts.push(`## Project Files\n${fileList}`);
  }

  // Package info
  if (debugContext && debugContext.package) {
    const pkg = debugContext.package;
    const deps = Object.keys(pkg.dependencies || {}).slice(0, 20).join(', ');
    parts.push(`## Package\nName: ${pkg.name || 'unknown'}\nDependencies: ${deps || 'none'}`);
  }

  parts.push(`\nGenerate up to ${MAX_ITERATIONS} repair iterations as JSON. Each iteration should build on the previous. Start with the most confident minimal fix.`);

  return parts.join('\n\n');
}

// ── Response validation ───────────────────────────────────────────────────────

function validateHealResponse(data) {
  if (!data || typeof data !== 'object') return null;

  const iterations = Array.isArray(data.iterations) ? data.iterations : [];

  const validated = iterations
    .slice(0, MAX_ITERATIONS)
    .map((iter, idx) => ({
      number:          typeof iter.number === 'number' ? iter.number : idx + 1,
      issueType:       typeof iter.issueType === 'string' ? iter.issueType : 'unknown',
      rootCause:       typeof iter.rootCause === 'string' ? maskString(iter.rootCause) : 'Unknown root cause',
      confidence:      typeof iter.confidence === 'number' ? Math.max(0, Math.min(1, iter.confidence)) : 0.5,
      affectedFiles:   Array.isArray(iter.affectedFiles) ? iter.affectedFiles : [],
      patch:           Array.isArray(iter.patch)
        ? iter.patch.map((p) => ({
            path:    typeof p.path === 'string' ? p.path : '',
            content: typeof p.content === 'string' ? maskString(p.content) : '',
          })).filter((p) => p.path && p.content)
        : [],
      reasoning:       typeof iter.reasoning === 'string' ? maskString(iter.reasoning) : '',
      estimatedImpact: typeof iter.estimatedImpact === 'string' ? iter.estimatedImpact : '',
    }))
    .filter((iter) => iter.patch.length > 0 || iter.rootCause !== 'Unknown root cause');

  return {
    strategy:     typeof data.strategy === 'string' ? maskString(data.strategy) : 'Apply minimal targeted patches to resolve the identified issue.',
    canAutoHeal:  data.canAutoHeal === true,
    iterations:   validated,
  };
}

// ── Fallback plan ─────────────────────────────────────────────────────────────

function buildFallbackPlan(ruleIssue) {
  const suggestion = ruleIssue && ruleIssue.suggestion
    ? ruleIssue.suggestion
    : 'Inspect the error messages and apply the suggested fix manually.';

  return {
    strategy:     'Manual remediation required — AI planning unavailable.',
    canAutoHeal:  false,
    iterations:   [{
      number:          1,
      issueType:       ruleIssue ? ruleIssue.type : 'unknown',
      rootCause:       ruleIssue ? ruleIssue.description : 'Could not determine root cause automatically.',
      confidence:      ruleIssue ? ruleIssue.confidence : 0.5,
      affectedFiles:   ruleIssue ? (ruleIssue.affectedFiles || []) : [],
      patch:           [],
      reasoning:       suggestion,
      estimatedImpact: 'Resolves the identified issue if the suggestion is applied correctly.',
    }],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a multi-iteration heal plan for the given debug context.
 *
 * @param {object}      debugContext  - output of buildDebugContext()
 * @param {object|null} ruleIssue    - best rule engine finding (or null)
 * @param {object}      allFiles     - { [path]: content }
 * @param {object}      signals      - raw signals
 * @returns {Promise<{ iterations: HealIteration[], canAutoHeal: boolean, strategy: string }>}
 */
async function planHeal(debugContext, ruleIssue, allFiles, signals) {
  const userPrompt = buildHealPrompt(debugContext, ruleIssue, allFiles, signals);

  logger.debug('healPlanner: starting AI heal plan generation');

  let rawText = null;

  try {
    // Prefer Claude, fall back to OpenAI
    if (env.ANTHROPIC_API_KEY) {
      rawText = await withTimeout(
        callClaude(HEAL_SYSTEM_PROMPT, userPrompt, { maxTokens: 4096 }),
        HEAL_TIMEOUT,
        'healPlanner/claude'
      );
    } else if (env.OPENAI_API_KEY) {
      rawText = await withTimeout(
        callOpenAI(HEAL_SYSTEM_PROMPT, userPrompt, { maxTokens: 4096 }),
        HEAL_TIMEOUT,
        'healPlanner/openai'
      );
    } else {
      logger.warn('healPlanner: no AI provider available, returning fallback plan');
      return buildFallbackPlan(ruleIssue);
    }
  } catch (err) {
    logger.error('healPlanner: AI call failed', { error: err.message });
    return buildFallbackPlan(ruleIssue);
  }

  const parsed = safeJsonParse(rawText);
  if (!parsed.success || !parsed.data) {
    logger.warn('healPlanner: failed to parse AI response', { rawLength: rawText.length });
    return buildFallbackPlan(ruleIssue);
  }

  const result = validateHealResponse(parsed.data);
  if (!result || result.iterations.length === 0) {
    logger.warn('healPlanner: AI response had no valid iterations');
    return buildFallbackPlan(ruleIssue);
  }

  logger.info('healPlanner: plan generated', {
    iterations:   result.iterations.length,
    canAutoHeal:  result.canAutoHeal,
    strategy:     result.strategy,
  });

  return result;
}

module.exports = { planHeal };
