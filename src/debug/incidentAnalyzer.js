'use strict';

/**
 * incidentAnalyzer.js
 * Production incident analysis using AI + rule engine.
 * Diagnoses root causes from logs, errors, and deploy history.
 */

const { callClaude }      = require('../providers/anthropicProvider');
const { callOpenAI }      = require('../providers/openaiProvider');
const { safeJsonParse }   = require('../utils/safeJsonParse');
const { withTimeout }     = require('../utils/withTimeout');
const { env }             = require('../config/env');
const logger              = require('../utils/logger');
const { maskString }      = require('./secretMasker');
const { runRules }        = require('./ruleEngine');
const { buildDebugContext } = require('./contextBuilder');

// ── Constants ─────────────────────────────────────────────────────────────────

const INCIDENT_TIMEOUT = 60000;

const INCIDENT_TYPES = [
  'deploy_failure', 'config_regression', 'database_error',
  'auth_failure', 'build_failure', 'network_failure', 'unknown',
];

// ── System prompt ─────────────────────────────────────────────────────────────

const INCIDENT_SYSTEM_PROMPT = `You are an SRE incident response AI. Diagnose production incidents from logs and deploy history.
Return JSON only:
{
  "summary": "one-sentence incident description",
  "severity": "critical|high|medium|low",
  "startTimeEstimate": "ISO or null",
  "affectedAreas": ["service/route names"],
  "probableTrigger": "what triggered this",
  "rootCause": "technical root cause",
  "confidence": 0.0,
  "remediationSteps": ["step 1", "step 2"],
  "rollbackRecommended": false,
  "rollbackReason": "reason or null",
  "requiresManualAction": true,
  "incidentType": "deploy_failure|config_regression|database_error|auth_failure|build_failure|network_failure|unknown"
}
Never expose secrets. Flag uncertainty clearly. Be precise.`;

// ── Deploy history sanitizer ──────────────────────────────────────────────────

/**
 * Strip sensitive data from deploy history, keep only last 5 entries.
 */
function sanitizeDeployHistory(deployHistory) {
  if (!Array.isArray(deployHistory)) return [];
  return deployHistory.slice(-5).map((d) => ({
    id:          d.id          || null,
    status:      d.status      || null,
    deployedAt:  d.deployedAt  || d.createdAt || null,
    url:         d.url         ? maskString(d.url) : null,
  }));
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildIncidentPrompt(debugContext, ruleResult, deployHistory) {
  const parts = [];

  // Rule engine result
  if (ruleResult.matched && ruleResult.issue) {
    const issue = ruleResult.issue;
    parts.push(`## Rule Engine Detection\nMatched: YES\nRule: ${issue.type}\nTitle: ${issue.title}\nConfidence: ${issue.confidence}\nDescription: ${issue.description}`);
  } else if (ruleResult.candidates && ruleResult.candidates.length > 0) {
    const candidateSummary = ruleResult.candidates.slice(0, 3).map((c) =>
      `- ${c.type} (confidence ${c.confidence}): ${c.title}`
    ).join('\n');
    parts.push(`## Rule Engine Candidates (no definitive match)\n${candidateSummary}`);
  }

  // Error summary
  if (debugContext && debugContext.errors) {
    const { totalErrors, criticalCount, highCount, clusters } = debugContext.errors;
    parts.push(`## Error Summary\nTotal: ${totalErrors} | Critical: ${criticalCount} | High: ${highCount}`);

    if (clusters && clusters.length > 0) {
      const clusterSummary = clusters.slice(0, 6).map((c, i) =>
        `${i + 1}. [${c.severity.toUpperCase()}][${c.category}] (x${c.occurrences}) ${c.representativeMessage.slice(0, 250)}`
      ).join('\n');
      parts.push(`## Error Clusters\n${clusterSummary}`);
    }
  }

  // Signals
  if (debugContext && debugContext.signals) {
    const { previewState, userDescription } = debugContext.signals;
    const sigParts = [];
    if (previewState)    sigParts.push(`Preview state: ${previewState}`);
    if (userDescription) sigParts.push(`User report: ${userDescription}`);
    if (sigParts.length > 0) parts.push(`## Signals\n${sigParts.join('\n')}`);
  }

  // Deploy history
  const safeHistory = sanitizeDeployHistory(deployHistory);
  if (safeHistory.length > 0) {
    const historyLines = safeHistory.map((d, i) =>
      `${i + 1}. [${d.status || 'unknown'}] ${d.deployedAt || 'unknown time'} — ${d.url || 'no url'} (id: ${d.id || 'n/a'})`
    ).join('\n');
    parts.push(`## Recent Deployments (last ${safeHistory.length})\n${historyLines}`);
  }

  // Project files
  if (debugContext && debugContext.files && debugContext.files.length > 0) {
    const fileList = debugContext.files.map((f) =>
      `### ${f.path}\n\`\`\`\n${(f.content || '').slice(0, 1500)}\n\`\`\``
    ).join('\n\n');
    parts.push(`## Project Files\n${fileList}`);
  }

  // Package info
  if (debugContext && debugContext.package) {
    const pkg = debugContext.package;
    const deps = Object.keys(pkg.dependencies || {}).slice(0, 15).join(', ');
    parts.push(`## Package: ${pkg.name || 'unknown'} v${pkg.version || '?'}\nDeps: ${deps || 'none'}`);
  }

  // Config issues
  if (debugContext && debugContext.config) {
    const { brokenScriptRefs, missingFiles } = debugContext.config;
    if (brokenScriptRefs.length > 0 || missingFiles.length > 0) {
      parts.push(`## Config Issues\nBroken refs: ${brokenScriptRefs.join(', ') || 'none'}\nMissing files: ${missingFiles.join(', ') || 'none'}`);
    }
  }

  parts.push('\nAnalyze the above and return your incident diagnosis as JSON.');
  return parts.join('\n\n');
}

// ── Response validation & sanitization ───────────────────────────────────────

function validateIncidentResponse(data) {
  if (!data || typeof data !== 'object') return null;

  const severity     = ['critical', 'high', 'medium', 'low'].includes(data.severity) ? data.severity : 'medium';
  const incidentType = INCIDENT_TYPES.includes(data.incidentType) ? data.incidentType : 'unknown';
  const confidence   = typeof data.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : 0.5;

  return {
    summary:              typeof data.summary === 'string'      ? maskString(data.summary) : 'Incident detected — see details.',
    severity,
    startTimeEstimate:    typeof data.startTimeEstimate === 'string' ? data.startTimeEstimate : null,
    affectedAreas:        Array.isArray(data.affectedAreas)     ? data.affectedAreas.map(String) : [],
    probableTrigger:      typeof data.probableTrigger === 'string' ? maskString(data.probableTrigger) : 'Unknown trigger.',
    rootCause:            typeof data.rootCause === 'string'    ? maskString(data.rootCause) : 'Could not determine root cause.',
    confidence,
    remediationSteps:     Array.isArray(data.remediationSteps)  ? data.remediationSteps.map(String) : [],
    rollbackRecommended:  data.rollbackRecommended === true,
    rollbackReason:       typeof data.rollbackReason === 'string' ? maskString(data.rollbackReason) : null,
    requiresManualAction: data.requiresManualAction !== false,
    incidentType,
  };
}

// ── Rule-based fallback ───────────────────────────────────────────────────────

function buildRuleBasedReport(ruleResult, normalizedErrors) {
  const issue = ruleResult.issue || (ruleResult.candidates && ruleResult.candidates[0]);

  let incidentType = 'unknown';
  if (issue) {
    const cat = issue.category || '';
    if (/build/.test(cat))      incidentType = 'build_failure';
    else if (/auth/.test(cat))  incidentType = 'auth_failure';
    else if (/database/.test(cat)) incidentType = 'database_error';
    else if (/network/.test(cat))  incidentType = 'network_failure';
    else if (/env/.test(cat) || /config/.test(cat)) incidentType = 'config_regression';
  }

  const criticalErrors = normalizedErrors.filter((e) => e.severity === 'critical');
  const severity = criticalErrors.length > 0 ? 'critical'
    : normalizedErrors.some((e) => e.severity === 'high') ? 'high'
    : 'medium';

  return {
    summary:              issue ? issue.title : `${normalizedErrors.length} error(s) detected.`,
    severity,
    startTimeEstimate:    null,
    affectedAreas:        issue && issue.affectedFiles ? issue.affectedFiles : [],
    probableTrigger:      'Recent change or deployment.',
    rootCause:            issue ? issue.description : 'Could not determine root cause — manual investigation required.',
    confidence:           issue ? issue.confidence : 0.4,
    remediationSteps:     issue && issue.suggestion ? [issue.suggestion] : ['Review error logs and apply the suggested fix.'],
    rollbackRecommended:  false,
    rollbackReason:       null,
    requiresManualAction: true,
    incidentType,
    diagnosedBy:          'rule_engine',
    ruleMatch:            ruleResult.matched,
    generatedAt:          new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyze a production incident using rule engine + AI.
 *
 * @param {object} context
 * @param {NormalizedError[]} context.normalizedErrors
 * @param {object}            context.projectFiles
 * @param {object}            context.signals
 * @param {object}            context.projectMeta
 * @param {object[]}          context.deployHistory
 * @returns {Promise<IncidentReport>}
 */
async function analyzeIncident({ normalizedErrors, projectFiles, signals, projectMeta, deployHistory }) {
  const errors  = Array.isArray(normalizedErrors) ? normalizedErrors : [];
  const files   = projectFiles || {};
  const sigs    = signals || {};
  const meta    = projectMeta || {};
  const history = deployHistory || [];

  logger.info('incidentAnalyzer: starting analysis', { errorCount: errors.length });

  // 1. Run rule engine
  const ruleResult = runRules(errors, files, sigs);
  logger.debug('incidentAnalyzer: rule engine result', {
    matched:    ruleResult.matched,
    candidates: ruleResult.candidates.length,
  });

  // 2. Build debug context
  const debugContext = buildDebugContext(errors, files, sigs, meta);

  // 3. Call AI
  let aiReport = null;

  try {
    if (!env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY) {
      throw new Error('No AI provider configured');
    }

    const userPrompt = buildIncidentPrompt(debugContext, ruleResult, history);
    let rawText      = null;

    if (env.ANTHROPIC_API_KEY) {
      rawText = await withTimeout(
        callClaude(INCIDENT_SYSTEM_PROMPT, userPrompt, { maxTokens: 2048 }),
        INCIDENT_TIMEOUT,
        'incidentAnalyzer/claude'
      );
    } else {
      rawText = await withTimeout(
        callOpenAI(INCIDENT_SYSTEM_PROMPT, userPrompt, { maxTokens: 2048 }),
        INCIDENT_TIMEOUT,
        'incidentAnalyzer/openai'
      );
    }

    const parsed = safeJsonParse(rawText);
    if (parsed.success && parsed.data) {
      aiReport = validateIncidentResponse(parsed.data);
    } else {
      logger.warn('incidentAnalyzer: AI response parse failed');
    }
  } catch (err) {
    logger.error('incidentAnalyzer: AI call failed', { error: err.message });
  }

  // 4. Build final report
  if (aiReport) {
    return {
      ...aiReport,
      diagnosedBy: 'ai',
      ruleMatch:   ruleResult.matched,
      generatedAt: new Date().toISOString(),
    };
  }

  // 5. Fallback to rule-based result
  logger.info('incidentAnalyzer: falling back to rule-based diagnosis');
  return buildRuleBasedReport(ruleResult, errors);
}

module.exports = { analyzeIncident };
