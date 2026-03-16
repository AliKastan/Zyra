'use strict';

/**
 * Build Readiness Report
 *
 * Assembles all category check results into a unified ProductionReadinessReport.
 * Determines the overall ReadinessStatus and computes the weighted composite score.
 */

const { checkRuntime }      = require('./check-runtime');
const { checkDeployment, detectProjectType } = require('./check-deployment');
const { checkEnv }          = require('./check-env');
const { checkIntegrations } = require('./check-integrations');
const { checkBuild }        = require('./check-build');
const { checkDatabase }     = require('./check-database');
const { checkBilling }      = require('./check-billing');
const { checkSecurity }     = require('./check-security');

// Score weights (must sum to 1.0)
const WEIGHTS = {
  runtime:          0.25,
  deployment:       0.20,
  envConfig:        0.15,
  integrations:     0.15,
  build:            0.10,
  architectureSafety: 0.15,  // maps to security score
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Run all readiness checks and build the full ProductionReadinessReport.
 *
 * @param {import('./types').ReadinessInput} input
 * @returns {import('./types').ProductionReadinessReport}
 */
function buildReadinessReport(input) {
  const files = _normalizeFiles(input.files || {});
  const normalizedInput = { ...input, files };

  // ── Run all checks ────────────────────────────────────────────────────────
  const runtime      = checkRuntime(normalizedInput);
  const deployment   = checkDeployment(normalizedInput);
  const env          = checkEnv(normalizedInput);
  const integrations = checkIntegrations(normalizedInput);
  const build        = checkBuild(normalizedInput);
  const database     = checkDatabase(normalizedInput);
  const billing      = checkBilling(normalizedInput);
  const security     = checkSecurity(normalizedInput);

  // ── Composite score ────────────────────────────────────────────────────────
  const score = _computeScore(runtime, deployment, env, integrations, build, security);

  // ── Boolean flags ─────────────────────────────────────────────────────────
  const runtimeReady            = runtime.score >= 60 && runtime.issues.filter(i => i.severity === 'critical').length === 0;
  const deployReady             = deployment.score >= 60 && deployment.portConfigured !== false;
  const envConfigured           = env.missingVars.length === 0 && !env.hasHardcodedSecrets;
  const integrationsConfigured  = integrations.unconfigured.length === 0;
  const buildReady              = build.score >= 70;
  const securitySafe            = !security.hasHardcodedKeys && !security.hasUnsafeEnvUsage;

  // ── Collect all issues ────────────────────────────────────────────────────
  const allIssues = [
    ...runtime.issues,
    ...deployment.issues,
    ...env.issues,
    ...integrations.issues,
    ...build.issues,
    ...database.issues,
    ...billing.issues,
    ...security.issues,
  ];

  const criticalIssues = allIssues.filter(i => i.severity === 'critical');
  const warnings       = allIssues.filter(i => i.severity === 'warning');

  // ── Status determination ──────────────────────────────────────────────────
  const status = _determineStatus({
    score: score.total,
    criticalIssues,
    envConfigured,
    integrationsConfigured,
    runtimeReady,
    deployReady,
    securitySafe,
  });

  // ── Next steps ────────────────────────────────────────────────────────────
  const nextSteps = _buildNextSteps(criticalIssues, warnings, {
    envConfigured,
    integrationsConfigured,
    runtimeReady,
    deployReady,
    securitySafe,
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  const projectType = detectProjectType(files);
  const summary     = _buildSummary(status, score, criticalIssues, warnings, projectType);

  return {
    status,
    score,
    runtimeReady,
    deployReady,
    envConfigured,
    integrationsConfigured,
    buildReady,
    securitySafe,
    projectType,
    recommendedDeployTarget: deployment.recommendedTarget,
    criticalIssues,
    warnings,
    nextSteps,
    runtime,
    deployment,
    env,
    integrations,
    build,
    database,
    billing,
    security,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * One-line summary for logs and UI.
 * @param {import('./types').ProductionReadinessReport} report
 * @returns {string}
 */
function summarizeReadinessReport(report) {
  return [
    `status="${report.status}"`,
    `score=${report.score.total}`,
    `critical=${report.criticalIssues.length}`,
    `warnings=${report.warnings.length}`,
    `deploy="${report.recommendedDeployTarget}"`,
    `runtime=${report.runtimeReady}`,
    `env=${report.envConfigured}`,
  ].join(' ');
}

/**
 * Extract only the issues needed for UI display.
 * @param {import('./types').ProductionReadinessReport} report
 * @returns {{ status: string, score: number, critical: string[], nextSteps: string[], deployTarget: string }}
 */
function buildUiReadinessPayload(report) {
  return {
    status:          report.status,
    score:           report.score.total,
    runtimeReady:    report.runtimeReady,
    deployReady:     report.deployReady,
    envConfigured:   report.envConfigured,
    integrationsConfigured: report.integrationsConfigured,
    deployTarget:    report.recommendedDeployTarget,
    critical:        report.criticalIssues.map(i => i.message),
    warnings:        report.warnings.map(i => i.message).slice(0, 5),
    nextSteps:       report.nextSteps.map(s => s.action).slice(0, 6),
    summary:         report.summary,
  };
}

// ── Private helpers ─────────────────────────────────────────────────────────

/**
 * Normalize the files input — accept either a Map or a plain object.
 * @param {Object|Map} files
 * @returns {Object}
 */
function _normalizeFiles(files) {
  if (files instanceof Map) {
    const obj = {};
    for (const [k, v] of files) obj[k] = v;
    return obj;
  }
  return files;
}

function _computeScore(runtime, deployment, env, integrations, build, security) {
  const runtime_s      = runtime.score;
  const deployment_s   = deployment.score;
  const envConfig_s    = env.score;
  const integrations_s = integrations.score;
  const build_s        = build.score;
  const archSafety_s   = security.score;

  const total = Math.round(
    runtime_s      * WEIGHTS.runtime          +
    deployment_s   * WEIGHTS.deployment       +
    envConfig_s    * WEIGHTS.envConfig        +
    integrations_s * WEIGHTS.integrations     +
    build_s        * WEIGHTS.build            +
    archSafety_s   * WEIGHTS.architectureSafety,
  );

  return {
    total:              Math.min(100, Math.max(0, total)),
    runtime:            runtime_s,
    deployment:         deployment_s,
    envConfig:          envConfig_s,
    integrations:       integrations_s,
    build:              build_s,
    architectureSafety: archSafety_s,
  };
}

/**
 * @param {{ score: number, criticalIssues: import('./types').ReadinessIssue[], envConfigured: boolean, integrationsConfigured: boolean, runtimeReady: boolean, deployReady: boolean, securitySafe: boolean }} ctx
 * @returns {import('./types').ReadinessStatus}
 */
function _determineStatus({ score, criticalIssues, envConfigured, integrationsConfigured, runtimeReady, deployReady, securitySafe }) {
  // Hard failures
  if (!runtimeReady && criticalIssues.some(i => i.category === 'runtime')) return 'not_ready';
  if (!securitySafe && criticalIssues.some(i => i.category === 'security')) return 'not_ready';
  if (score < 40) return 'not_ready';

  // Significant manual work required
  if (criticalIssues.length >= 3) return 'manual_configuration_required';
  if (!deployReady && !runtimeReady) return 'manual_configuration_required';
  if (score < 55) return 'manual_configuration_required';

  // Missing setup (env vars, keys) but architecture is sound
  if (!envConfigured || !integrationsConfigured) return 'ready_with_setup_required';
  if (criticalIssues.length > 0) return 'ready_with_setup_required';

  // Minor warnings but deployable
  if (score < 85) return 'ready_with_warnings';

  return 'ready';
}

/**
 * Build a prioritized list of suggested fixes.
 * @returns {import('./types').SuggestedFix[]}
 */
function _buildNextSteps(criticalIssues, warnings, flags) {
  /** @type {import('./types').SuggestedFix[]} */
  const steps = [];

  // Critical issues first
  for (const issue of criticalIssues.slice(0, 4)) {
    steps.push({
      priority: 'high',
      category: issue.category,
      action:   issue.fix || issue.message,
      file:     issue.file,
    });
  }

  // Env / integration setup
  if (!flags.envConfigured) {
    steps.push({
      priority: 'high',
      category: 'env',
      action:   'Fill in required environment variables in .env.example and create a .env file',
    });
  }

  if (!flags.integrationsConfigured) {
    steps.push({
      priority: 'high',
      category: 'integrations',
      action:   'Configure unconfigured integrations (add API keys to .env)',
    });
  }

  if (!flags.runtimeReady) {
    steps.push({
      priority: 'high',
      category: 'runtime',
      action:   'Add a start script to package.json and ensure the server entrypoint exists',
    });
  }

  if (!flags.deployReady) {
    steps.push({
      priority: 'medium',
      category: 'deployment',
      action:   'Replace hardcoded port with process.env.PORT || 3000',
    });
  }

  // Warnings (up to 3 additional)
  for (const issue of warnings.slice(0, 3)) {
    if (issue.fix) {
      steps.push({
        priority: 'medium',
        category: issue.category,
        action:   issue.fix,
        file:     issue.file,
      });
    }
  }

  // Deduplicate by action
  const seen = new Set();
  return steps.filter(s => {
    if (seen.has(s.action)) return false;
    seen.add(s.action);
    return true;
  });
}

function _buildSummary(status, score, criticalIssues, warnings, projectType) {
  const statusLabel = {
    ready:                        'Ready to deploy',
    ready_with_warnings:          'Deployable with minor warnings',
    ready_with_setup_required:    'Needs env/integration setup before deploying',
    manual_configuration_required: 'Requires manual configuration',
    not_ready:                    'Not ready — critical issues must be resolved',
  }[status] || status;

  return `${statusLabel} — score: ${score.total}/100, critical: ${criticalIssues.length}, warnings: ${warnings.length}, type: ${projectType}`;
}

module.exports = { buildReadinessReport, summarizeReadinessReport, buildUiReadinessPayload };
