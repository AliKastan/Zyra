'use strict';

/**
 * Build Readiness Summary
 *
 * Derives a ReadinessSummary from validator + repair outputs.
 * Honest about what is and is not ready — does not over-claim.
 *
 * Rules:
 *   architectureReady — validator files/imports checks pass, OR repaired to passing
 *   runReady          — npm scripts defined, env vars declared
 *   deployReady       — no critical unresolved issues, deployment config present
 *   authReady         — auth check passes OR auth not required
 *   billingReady      — billing check passes OR billing not required
 *   integrationReady  — integrations check passes OR none required
 *   mobileReady       — mobile entry exists OR mobile not required
 *   webReady          — index.html / web entry exists
 *   manualReviewRequired — any items could not be auto-fixed
 */

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * @param {import('./types').PackagingInput} input
 * @returns {import('./types').ReadinessSummary}
 */
function buildReadinessSummary(input) {
  const {
    intent                 = {},
    complexityReport       = null,
    files                  = [],
    validationReport       = {},
    structuralRepairReport = null,
    repairReport           = null,
  } = input;

  const valReadiness  = validationReport.readiness || {};
  const valChecks     = validationReport.checks    || {};
  const valScore      = typeof validationReport.score === 'number' ? validationReport.score : 50;
  const criticals     = (validationReport.criticalIssues || []).length;
  const signals       = complexityReport?.signals || {};

  // Structural repair stats
  const sRepaired     = structuralRepairReport?.repairedCount || 0;
  const sManual       = (structuralRepairReport?.manualReviewRequired || []).length
                      + (structuralRepairReport?.skippedIssues || []).filter(i => i.action === 'manual_review').length;
  const sStatus       = structuralRepairReport?.status || '';

  // LLM repair stats
  const llmAllRepaired = repairReport?.allRepaired || false;

  // ── architectureReady ──────────────────────────────────────────────────────
  const filesCheck   = valChecks.files?.status;
  const importsCheck = valChecks.imports?.status;
  const archFromValidator = (filesCheck === 'pass' || filesCheck === 'warning')
                         && (importsCheck === 'pass' || importsCheck === 'warning');
  const archFromRepair = valReadiness.architectureReady === true || sRepaired > 0;
  const architectureReady = archFromValidator || archFromRepair || valScore >= 60;

  // ── runReady ───────────────────────────────────────────────────────────────
  const scriptsCheck = valChecks.scripts?.status;
  const envCheck     = valChecks.env?.status;
  const hasPackageJson = files.some(f => f.path === 'package.json' || f.path.endsWith('/package.json'));
  const hasEnvExample  = files.some(f => f.path === '.env.example' || f.path.endsWith('/.env.example'));
  const hasHtmlEntry   = files.some(f => /index\.html$/i.test(f.path));

  const runReady = (
    hasHtmlEntry  // static site is always runnable
    || (hasPackageJson && (scriptsCheck === 'pass' || scriptsCheck === 'warning'))
    || valReadiness.deployReady === true
  ) && valScore >= 40;

  // ── deployReady ────────────────────────────────────────────────────────────
  const deployCheck = valChecks.deployment?.status;
  const hasDockerfile = files.some(f => f.path === 'Dockerfile');
  const hasVercelJson = files.some(f => f.path === 'vercel.json');
  const hasProcfile   = files.some(f => f.path === 'Procfile');
  const hasDeployConfig = hasDockerfile || hasVercelJson || hasProcfile || hasHtmlEntry;

  // deployReady requires no unresolved critical issues
  const deployReady = (
    valReadiness.deployReady === true
    || (hasDeployConfig && criticals === 0)
    || (deployCheck === 'pass' && criticals === 0)
  ) && valScore >= 50;

  // ── authReady ──────────────────────────────────────────────────────────────
  const authCheck   = valChecks.auth?.status;
  const needsAuth   = intent.needsAuth === true;
  let authReady;
  if (!needsAuth) {
    authReady = true; // not required = ready
  } else {
    authReady = valReadiness.authReady === true
      || authCheck === 'pass'
      || (sStatus === 'repaired' && sRepaired > 0);
  }

  // ── billingReady ───────────────────────────────────────────────────────────
  const billingCheck  = valChecks.billing?.status;
  const needsPayments = intent.needsPayments === true;
  let billingReady;
  if (!needsPayments) {
    billingReady = true;
  } else {
    // Billing is only fully ready if both structural code AND keys are configured.
    // Keys are almost never present at generation time — so this will usually be false
    // unless all billing env vars have non-placeholder values.
    billingReady = valReadiness.billingReady === true && billingCheck === 'pass';
    // Don't claim billingReady=true just because we repaired it — keys are still needed
  }

  // ── integrationReady ───────────────────────────────────────────────────────
  const intCheck = valChecks.integrations?.status;
  const intCount = signals.integrationCount || 0;
  let integrationReady;
  if (intCount === 0) {
    integrationReady = true;
  } else {
    integrationReady = valReadiness.integrationReady === true
      || intCheck === 'pass';
  }

  // ── mobileReady ────────────────────────────────────────────────────────────
  const hasMobile = signals.hasMobile === true;
  let mobileReady;
  if (!hasMobile) {
    mobileReady = true; // not needed
  } else {
    const hasAppJson  = files.some(f => f.path === 'app.json');
    const hasExpoJson = files.some(f => f.path === 'expo.json' || f.path === 'app.config.js');
    mobileReady = hasAppJson || hasExpoJson;
  }

  // ── webReady ───────────────────────────────────────────────────────────────
  const webReady = hasHtmlEntry
    || files.some(f => /index\.(tsx?|jsx?)$/.test(f.path))
    || hasPackageJson;

  // ── manualReviewRequired ───────────────────────────────────────────────────
  const manualReviewRequired = sManual > 0
    || (repairReport && !llmAllRepaired && criticals > 0);

  return {
    architectureReady:    !!architectureReady,
    runReady:             !!runReady,
    deployReady:          !!deployReady,
    authReady:            !!authReady,
    billingReady:         !!billingReady,
    integrationReady:     !!integrationReady,
    mobileReady:          !!mobileReady,
    webReady:             !!webReady,
    manualReviewRequired: !!manualReviewRequired,
  };
}

/**
 * Produce a one-line human summary of readiness flags.
 *
 * @param {import('./types').ReadinessSummary} readiness
 * @returns {string}
 */
function summarizeReadiness(readiness) {
  const ready = [];
  const notReady = [];

  const checks = {
    architectureReady:  'Architecture',
    runReady:           'Local run',
    deployReady:        'Deploy',
    authReady:          'Auth',
    billingReady:       'Billing',
    integrationReady:   'Integrations',
    webReady:           'Web',
  };

  for (const [key, label] of Object.entries(checks)) {
    (readiness[key] ? ready : notReady).push(label);
  }

  const parts = [];
  if (ready.length)    parts.push(`Ready: ${ready.join(', ')}`);
  if (notReady.length) parts.push(`Not ready: ${notReady.join(', ')}`);
  if (readiness.manualReviewRequired) parts.push('Manual review required');
  return parts.join(' | ');
}

module.exports = { buildReadinessSummary, summarizeReadiness };
