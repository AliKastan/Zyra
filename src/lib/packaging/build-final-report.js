'use strict';

/**
 * Build Final Delivery Report
 *
 * Produces two outputs:
 *   1. FinalSummary — structured data for the UI / API response
 *   2. Markdown report string — human-readable, section-based delivery report
 *
 * Sections in the markdown report:
 *   Project Overview | Stack & Platforms | Major Features | Generated Files Summary |
 *   Validation Results | Repairs Applied | Readiness Status | Required Environment Variables |
 *   Integration Setup | Local Run Instructions | Deploy Notes | Manual Review Items
 */

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build the FinalSummary (machine-readable structured data).
 *
 * @param {import('./types').PackagingInput} input
 * @param {import('./types').ProjectManifest} manifest
 * @param {import('./types').ReadinessSummary} readiness
 * @param {import('./types').FinalWarningSummary} warningSummary
 * @param {import('./types').FinalSetupInstructions} setup
 * @returns {import('./types').FinalSummary}
 */
function buildFinalSummary(input, manifest, readiness, warningSummary, setup) {
  const { intent = {}, validationReport = {}, structuralRepairReport = null, repairReport = null } = input;

  const projectOverview   = _buildProjectOverview(manifest, intent);
  const generatedFeatures = manifest.features;
  const validationSummary = _buildValidationSummary(validationReport);
  const repairSummary     = _buildRepairSummary(structuralRepairReport, repairReport);
  const nextSteps         = getFinalNextSteps({ readiness, warningSummary, setup, manifest });

  return {
    projectOverview,
    generatedFeatures,
    validationSummary,
    repairSummary,
    nextSteps,
  };
}

/**
 * Build a full markdown delivery report string.
 *
 * @param {import('./types').FinalProjectPackage} pkg
 * @param {import('./types').PackagingInput} input
 * @returns {string}
 */
function buildFinalDeliveryReport(pkg, input) {
  const { manifest, readiness, summary, setup, warnings, manualReviewRequired } = pkg;
  const { validationReport = {}, structuralRepairReport = null, repairReport = null } = input;

  const lines = [];
  const h1 = t => lines.push(`# ${t}`, '');
  const h2 = t => lines.push(`## ${t}`, '');
  const h3 = t => lines.push(`### ${t}`, '');
  const p  = t => lines.push(t, '');
  const ul = items => { items.forEach(i => lines.push(`- ${i}`)); lines.push(''); };
  const kv = (k, v) => lines.push(`**${k}:** ${v}`);
  const hr = () => lines.push('---', '');
  const code = (lang, content) => lines.push('```' + lang, content, '```', '');

  // ── Header ───────────────────────────────────────────────────────────────────
  h1(`${manifest.projectName} — Delivery Report`);
  p(`**Generated:** ${manifest.generatedAt}  |  **Packaged:** ${manifest.packagedAt}  |  **Status:** \`${pkg.packageStatus}\``);
  hr();

  // ── 1. Project Overview ───────────────────────────────────────────────────────
  h2('1. Project Overview');
  p(summary.projectOverview);
  kv('Project ID',   manifest.projectId);
  kv('App Type',     manifest.appType);
  kv('Platforms',    manifest.platforms.join(', '));
  kv('Complexity',   `${manifest.complexityTier} (score: ${manifest.complexityScore}/90)`);
  kv('Files',        String(manifest.fileCount));
  kv('Routes/Pages', String(manifest.routeCount));
  kv('Integrations', String(manifest.integrationCount));
  lines.push('');

  // ── 2. Stack & Platforms ─────────────────────────────────────────────────────
  h2('2. Stack & Platforms');
  const stack = manifest.stack;
  kv('Frontend',   stack.frontend);
  if (stack.backend)  kv('Backend',   stack.backend);
  if (stack.database) kv('Database',  stack.database);
  if (stack.auth)     kv('Auth',      stack.auth);
  if (stack.payments) kv('Payments',  stack.payments);
  if (stack.ai)       kv('AI',        stack.ai);
  kv('Deployment', stack.deployment);
  lines.push('');

  // ── 3. Major Features ────────────────────────────────────────────────────────
  h2('3. Major Features');
  if (summary.generatedFeatures.length > 0) {
    ul(summary.generatedFeatures);
  } else {
    p('_No explicit features listed._');
  }

  // ── 4. Generated Files Summary ───────────────────────────────────────────────
  h2('4. Generated Files Summary');
  p(`**${manifest.fileCount} files generated.** Routes / pages: ${manifest.routes.slice(0, 10).join(', ') || 'none listed'}.`);
  if (manifest.dataEntities.length > 0) {
    kv('Data entities', manifest.dataEntities.join(', '));
    lines.push('');
  }

  // ── 5. Validation Results ────────────────────────────────────────────────────
  h2('5. Validation Results');
  p(summary.validationSummary);
  const score = validationReport.score;
  if (typeof score === 'number') {
    kv('Validation score', `${score}/100`);
    kv('Status',           validationReport.status || 'unknown');
    lines.push('');
  }
  if (warnings.length > 0) {
    h3('Warnings');
    ul(warnings.slice(0, 10));
  }

  // ── 6. Repairs Applied ───────────────────────────────────────────────────────
  h2('6. Repairs Applied');
  p(summary.repairSummary);
  if (structuralRepairReport) {
    const sr = structuralRepairReport;
    const created  = (sr.filesCreated  || sr.createdFiles  || []);
    const modified = (sr.filesModified || sr.updatedFiles  || []);
    const addedDeps  = sr.addedDependencies || sr.addedDeps || [];
    const addedEnvs  = sr.addedEnvVars    || [];
    const addedScripts = sr.addedScripts  || [];

    if (created.length)      { kv('Files created',       created.join(', '));  lines.push(''); }
    if (modified.length)     { kv('Files modified',      modified.join(', ')); lines.push(''); }
    if (addedDeps.length)    { kv('Dependencies added',  addedDeps.join(', ')); lines.push(''); }
    if (addedEnvs.length)    { kv('Env vars added',      addedEnvs.join(', ')); lines.push(''); }
    if (addedScripts.length) { kv('Scripts added',       addedScripts.join(', ')); lines.push(''); }
  }

  // ── 7. Readiness Status ──────────────────────────────────────────────────────
  h2('7. Readiness Status');
  const readinessRows = [
    ['Architecture',    readiness.architectureReady],
    ['Local Run',       readiness.runReady],
    ['Deploy',          readiness.deployReady],
    ['Auth',            readiness.authReady],
    ['Billing',         readiness.billingReady],
    ['Integrations',    readiness.integrationReady],
    ['Web',             readiness.webReady],
    ['Mobile',          readiness.mobileReady],
  ];
  for (const [label, val] of readinessRows) {
    lines.push(`- ${val ? '✓' : '✗'} **${label}**${val ? '' : ' — not ready'}`);
  }
  if (readiness.manualReviewRequired) {
    lines.push('- ⚠ **Manual review required** — see section 12');
  }
  lines.push('');

  // ── 8. Required Environment Variables ────────────────────────────────────────
  h2('8. Required Environment Variables');
  const reqVars = setup.requiredEnvVars;
  if (reqVars.length === 0) {
    p('_No required env vars — the project can run without any configuration._');
  } else {
    const envLines = reqVars.map(v => {
      const note = v.setupNote ? `  # ${v.setupNote}` : `  # ${v.description}`;
      return `${v.name}=${note}`;
    });
    code('env', envLines.join('\n'));

    if (setup.optionalEnvVars.length > 0) {
      h3('Optional / Defaults Available');
      const optLines = setup.optionalEnvVars.map(v => `${v.name}=${v.defaultValue || ''}  # ${v.description}`);
      code('env', optLines.join('\n'));
    }
  }

  // ── 9. Integration Setup ─────────────────────────────────────────────────────
  h2('9. Integration Setup');
  if (setup.integrations.length === 0) {
    p('_No third-party integrations detected._');
  } else {
    for (const intg of setup.integrations) {
      h3(`${intg.name}${intg.configured ? ' (configured structurally)' : ' (API key required)'}`);
      p(intg.description);
      p(`**Setup:** ${intg.setupNote}`);
      if (intg.envVars.length > 0) {
        p(`**Env vars:** \`${intg.envVars.join('`, `')}\``);
      }
    }
  }

  // ── 10. Local Run Instructions ───────────────────────────────────────────────
  h2('10. Local Run Instructions');
  const run = pkg.exports ? null : null; // run instructions are inside setup
  lines.push('```bash');
  if ((setup.envSetupSteps || []).length > 0) {
    lines.push('# 1. Configure environment');
    (setup.envSetupSteps || []).forEach(s => lines.push(s));
    lines.push('');
    lines.push('# 2. Install dependencies');
  } else {
    lines.push('# 1. Install dependencies');
  }
  lines.push(setup.installCommand || 'npm install');
  lines.push('');
  lines.push('# Run in development');
  lines.push(setup.devCommand || 'npm run dev');
  if (setup.buildCommand) {
    lines.push('');
    lines.push('# Build for production');
    lines.push(setup.buildCommand);
  }
  if (setup.startCommand) {
    lines.push('');
    lines.push('# Start production server');
    lines.push(setup.startCommand);
  }
  if (setup.mobileCommand) {
    lines.push('');
    lines.push('# Run mobile app (Expo)');
    lines.push(setup.mobileCommand);
  }
  lines.push('```');
  lines.push('');

  // ── 11. Deploy Notes ─────────────────────────────────────────────────────────
  h2('11. Deploy Notes');
  if (setup.deployNotes.length > 0) {
    ul(setup.deployNotes);
  } else {
    p('_No specific deploy notes. See run instructions above._');
  }

  // ── 12. Manual Review Items ───────────────────────────────────────────────────
  h2('12. Manual Review Items');
  if (manualReviewRequired.length === 0) {
    p('_No manual review required. All issues were resolved automatically._');
  } else {
    for (const item of manualReviewRequired) {
      const filePart = item.file ? ` \`${item.file}\`` : '';
      lines.push(`**[${item.severity.toUpperCase()}]**${filePart} ${item.description}`);
      if (item.suggestion) lines.push(`> _Fix:_ ${item.suggestion}`);
      if (item.reason)     lines.push(`> _Why manual:_ ${item.reason}`);
      lines.push('');
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  hr();
  lines.push(`_Report generated by Zyra on ${manifest.packagedAt}_`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Build ordered next steps for the user.
 *
 * @param {{ readiness: import('./types').ReadinessSummary, warningSummary: import('./types').FinalWarningSummary, setup: import('./types').FinalSetupInstructions, manifest: import('./types').ProjectManifest }} ctx
 * @returns {string[]}
 */
function getFinalNextSteps({ readiness, warningSummary, setup, manifest }) {
  const steps = [];

  // Missing credentials first
  if (warningSummary.missingCredentials.length > 0) {
    steps.push(`Configure missing API keys / secrets: ${warningSummary.missingCredentials.slice(0, 3).join(', ')}`);
  }

  // Env setup
  const reqVars = setup.requiredEnvVars.filter(v => v.required && !v.hasDefault);
  if (reqVars.length > 0) {
    steps.push(`Set required env vars in .env: ${reqVars.slice(0, 4).map(v => v.name).join(', ')}`);
  }

  // Manual review
  if (readiness.manualReviewRequired) {
    steps.push(`Review and fix ${warningSummary.manualReviewRequired.length} manual review item(s) — see delivery report section 12`);
  }

  // Integration setup
  const unconfigured = (setup.integrations || []).filter(i => i.requiresKey && !i.configured);
  for (const intg of unconfigured.slice(0, 3)) {
    steps.push(`Set up ${intg.name}: ${intg.setupNote}`);
  }

  // Run instructions
  steps.push(`Install dependencies: ${setup.installCommand || 'npm install'}`);
  steps.push(`Start development server: ${setup.devCommand || 'npm run dev'}`);

  // Deploy
  if (!readiness.deployReady) {
    steps.push('Review deploy notes in final-report.md before deploying to production');
  }

  // Billing
  if (!readiness.billingReady && manifest.integrations.includes('Stripe')) {
    steps.push('Test Stripe webhook locally with Stripe CLI: stripe listen --forward-to localhost:3000/api/billing/webhook');
  }

  return steps;
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _buildProjectOverview(manifest, intent) {
  const name    = manifest.projectName;
  const appType = manifest.appType || 'application';
  const tier    = manifest.complexityTier;
  const features = manifest.features.slice(0, 4);
  const platforms = manifest.platforms.join(' and ');
  const integrations = manifest.integrations.slice(0, 3);

  let desc = `${name} is a ${tier} ${appType} for ${platforms}`;

  if (features.length > 0) {
    desc += `, featuring ${features.join(', ')}`;
  }

  if (integrations.length > 0) {
    desc += `. Integrated with ${integrations.join(', ')}`;
  }

  desc += '.';
  return desc;
}

function _buildValidationSummary(validationReport) {
  const score  = typeof validationReport.score === 'number' ? validationReport.score : null;
  const status = validationReport.status || 'unknown';
  const criticalCount = (validationReport.criticalIssues || []).length;
  const totalIssues   = (validationReport.issues || []).length;

  if (!score) return 'Validation data not available.';

  let summary = `Validation score: ${score}/100 (${status}).`;

  if (criticalCount > 0) {
    summary += ` ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} found.`;
  } else {
    summary += ' No critical issues.';
  }

  if (totalIssues > criticalCount) {
    summary += ` ${totalIssues - criticalCount} non-critical issue${totalIssues - criticalCount > 1 ? 's' : ''} flagged.`;
  }

  return summary;
}

function _buildRepairSummary(structuralRepairReport, repairReport) {
  const parts = [];

  if (structuralRepairReport) {
    const r = structuralRepairReport;
    const count = r.repairedCount || 0;
    const delta = r.scoreDelta    || 0;
    const created  = (r.filesCreated  || r.createdFiles  || []).length;
    const modified = (r.filesModified || r.updatedFiles  || []).length;

    if (count > 0) {
      parts.push(`Structural repair applied ${count} fix${count > 1 ? 'es' : ''} (score +${delta}).`);
      if (created)  parts.push(`${created} file${created > 1 ? 's' : ''} created.`);
      if (modified) parts.push(`${modified} file${modified > 1 ? 's' : ''} modified.`);
    } else {
      parts.push('No structural repairs needed.');
    }
  }

  if (repairReport && Array.isArray(repairReport.repairsApplied)) {
    const n = repairReport.repairsApplied.length;
    if (n > 0) parts.push(`LLM repair pass applied ${n} additional fix${n > 1 ? 'es' : ''}.`);
    else       parts.push('LLM repair pass: no additional fixes needed.');
  }

  return parts.length > 0 ? parts.join(' ') : 'No repair data available.';
}

module.exports = { buildFinalSummary, buildFinalDeliveryReport, getFinalNextSteps };
