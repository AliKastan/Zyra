'use strict';

/**
 * Build Warning Summary
 *
 * Collects all warnings, unresolved issues, missing credentials, risky areas,
 * and manual-review-required items from validator + repair outputs.
 *
 * Honest: surfaces every unresolved problem so the user knows what needs attention.
 */

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * @param {import('./types').PackagingInput} input
 * @param {import('./types').ReadinessSummary} readiness
 * @returns {import('./types').FinalWarningSummary}
 */
function buildWarningSummary(input, readiness) {
  const {
    validationReport       = {},
    structuralRepairReport = null,
    repairReport           = null,
    intent                 = {},
    files                  = [],
  } = input;

  const warnings            = _collectWarnings(validationReport, structuralRepairReport);
  const manualReviewRequired = _collectManualReviewItems(validationReport, structuralRepairReport, repairReport);
  const unresolvedIssues    = _collectUnresolvedIssues(validationReport, structuralRepairReport, repairReport);
  const missingCredentials  = _collectMissingCredentials(files, intent, readiness);
  const riskyAreas          = _collectRiskyAreas(structuralRepairReport);

  return {
    warnings,
    manualReviewRequired,
    unresolvedIssues,
    missingCredentials,
    riskyAreas,
  };
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _collectWarnings(validationReport, structuralRepairReport) {
  const seen = new Set();
  const warnings = [];

  const add = (msg) => {
    const key = msg.toLowerCase().trim();
    if (key && !seen.has(key)) { seen.add(key); warnings.push(msg); }
  };

  // Validator warnings
  for (const w of (validationReport.warnings || [])) {
    add(typeof w === 'string' ? w : w.message || String(w));
  }

  // Medium/minor issues that were not repaired surface as warnings
  const unrepaired = validationReport.issues || [];
  for (const issue of unrepaired) {
    if (issue.severity === 'medium' || issue.severity === 'minor') {
      if (issue.message) add(`[${issue.severity}] ${issue.message}`);
    }
  }

  // Structural repair — warn about skipped items
  const skipped = structuralRepairReport?.skippedIssues || [];
  for (const s of skipped) {
    if (s.reason) add(`Skipped repair: ${s.reason}`);
  }

  return warnings.slice(0, 30); // cap for readability
}

function _collectManualReviewItems(validationReport, structuralRepairReport, repairReport) {
  /** @type {import('./types').ManualReviewItem[]} */
  const items = [];
  const seen  = new Set();

  const add = (item) => {
    if (!item.id || seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  // From structural repair — explicit manual review list
  const structManual = structuralRepairReport?.manualReviewRequired || [];
  for (const r of structManual) {
    add({
      id:          r.issueId || r.id || `manual-${items.length}`,
      severity:    r.safety === 'do_not_touch' ? 'critical' : 'major',
      description: r.reason || 'Manual review required',
      file:        r.path   || undefined,
      suggestion:  undefined,
      reason:      r.reason || 'Could not be safely auto-repaired',
    });
  }

  // From skipped repairs with manual_review action
  const skipped = structuralRepairReport?.skippedIssues || [];
  for (const s of skipped) {
    if (s.action === 'manual_review' || s.action === 'deferred') {
      add({
        id:          s.issueId || `skip-${items.length}`,
        severity:    'major',
        description: s.reason || 'Issue skipped during repair',
        file:        s.path   || undefined,
        suggestion:  undefined,
        reason:      'Repair was skipped — requires developer decision',
      });
    }
  }

  // From validator — critical issues that remain unresolved after repair
  const criticals = validationReport.criticalIssues || [];
  const allRepaired = repairReport?.allRepaired === true;
  if (!allRepaired) {
    for (const issue of criticals) {
      add({
        id:          issue.id || `crit-${items.length}`,
        severity:    'critical',
        description: issue.message,
        file:        issue.file       || undefined,
        suggestion:  issue.suggestion || 'Review and fix manually before running in production.',
        reason:      'Critical issue not resolved by automated repair',
      });
    }
  }

  // From validator — major issues when repair did not run or failed
  if (!repairReport && !structuralRepairReport) {
    const majors = (validationReport.issues || []).filter(i => i.severity === 'major');
    for (const issue of majors.slice(0, 5)) {
      add({
        id:          issue.id || `maj-${items.length}`,
        severity:    'major',
        description: issue.message,
        file:        issue.file       || undefined,
        suggestion:  issue.suggestion || undefined,
        reason:      'No repair pass was run for this issue',
      });
    }
  }

  return items;
}

function _collectUnresolvedIssues(validationReport, structuralRepairReport, repairReport) {
  const unresolved = [];
  const seen = new Set();

  const repairedIds = new Set(
    (structuralRepairReport?.results || [])
      .filter(r => r.action !== 'skipped' && r.action !== 'manual_review')
      .map(r => r.issueId)
  );

  const llmApplied = new Set(repairReport?.repairsApplied || []);

  for (const issue of (validationReport.issues || [])) {
    if (issue.severity !== 'critical' && issue.severity !== 'major') continue;
    if (repairedIds.has(issue.id)) continue;
    if (llmApplied.has(issue.id) || llmApplied.has(issue.message)) continue;

    const key = issue.id || issue.message;
    if (seen.has(key)) continue;
    seen.add(key);

    const prefix = issue.file ? `[${issue.file}] ` : '';
    unresolved.push(`${prefix}${issue.message}`);
  }

  return unresolved.slice(0, 20);
}

function _collectMissingCredentials(files, intent, readiness) {
  const missing = [];
  const envFile = files.find(f => f.path === '.env.example');
  const envContent = envFile?.content || '';

  const CREDENTIAL_PATTERNS = [
    { pattern: /STRIPE_SECRET_KEY=\s*$/m,      label: 'Stripe Secret Key' },
    { pattern: /STRIPE_WEBHOOK_SECRET=\s*$/m,   label: 'Stripe Webhook Secret' },
    { pattern: /SUPABASE_URL=\s*$/m,            label: 'Supabase URL' },
    { pattern: /SUPABASE_ANON_KEY=\s*$/m,       label: 'Supabase Anon Key' },
    { pattern: /SUPABASE_SERVICE_KEY=\s*$/m,    label: 'Supabase Service Key' },
    { pattern: /OPENAI_API_KEY=\s*$/m,          label: 'OpenAI API Key' },
    { pattern: /ANTHROPIC_API_KEY=\s*$/m,       label: 'Anthropic API Key' },
    { pattern: /SENDGRID_API_KEY=\s*$/m,        label: 'SendGrid API Key' },
    { pattern: /RESEND_API_KEY=\s*$/m,          label: 'Resend API Key' },
    { pattern: /TWILIO_ACCOUNT_SID=\s*$/m,      label: 'Twilio Account SID' },
    { pattern: /JWT_SECRET=\s*$/m,              label: 'JWT Secret (generate with: openssl rand -base64 64)' },
  ];

  for (const { pattern, label } of CREDENTIAL_PATTERNS) {
    if (pattern.test(envContent)) missing.push(label);
  }

  // If billing not ready, flag it
  if (!readiness.billingReady && intent.needsPayments) {
    if (!missing.some(m => m.includes('Stripe'))) {
      missing.push('Stripe API keys (required for payment processing)');
    }
  }

  return missing;
}

function _collectRiskyAreas(structuralRepairReport) {
  const risky = [];

  // do_not_touch decisions represent areas repair intentionally left untouched
  const doNotTouch = (structuralRepairReport?.skippedIssues || [])
    .filter(s => s.safety === 'do_not_touch');

  for (const item of doNotTouch) {
    const note = item.path ? `${item.path}: ${item.reason}` : item.reason;
    if (note) risky.push(note);
  }

  return risky;
}

module.exports = { buildWarningSummary };
