'use strict';

/**
 * Authenticity Report Builder
 *
 * Assembles all detected fake-backend issues into a structured
 * BackendAuthenticityReport with status determination, placeholder
 * feature classification, and a human-readable summary.
 */

// ── Known placeholder feature patterns ──────────────────────────────────────
// Issues that are acceptable as "placeholder" (not blocking) when env is not configured.

const PLACEHOLDER_MAP = [
  {
    match:   issue => issue.category === 'fake_billing' && issue.id.includes('no-stripe-backend'),
    feature: 'Stripe billing',
    reason:  'Stripe is referenced in UI but not yet configured in backend.',
    action:  'Add STRIPE_SECRET_KEY to .env and implement POST /api/billing/create-payment-intent',
  },
  {
    match:   issue => issue.id === 'fake-integration-email-no-backend',
    feature: 'Email provider',
    reason:  'Email sending UI is present but no email provider (SendGrid / Resend / Nodemailer) is configured.',
    action:  'Add SENDGRID_API_KEY or RESEND_API_KEY to .env and implement the send-email service.',
  },
  {
    match:   issue => issue.id === 'fake-integration-openai-no-backend',
    feature: 'AI / OpenAI integration',
    reason:  'AI functionality is shown in UI but OPENAI_API_KEY is not configured.',
    action:  'Add OPENAI_API_KEY to .env and implement the AI backend endpoint.',
  },
  {
    match:   issue => issue.id === 'fake-integration-sms-no-backend',
    feature: 'SMS (Twilio)',
    reason:  'SMS sending UI is present but Twilio is not configured.',
    action:  'Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env.',
  },
  {
    match:   issue => issue.id === 'fake-integration-push-no-backend',
    feature: 'Push Notifications',
    reason:  'Push notification UI is present but no push provider (Firebase / web-push) is configured.',
    action:  'Configure FCM_SERVER_KEY or VAPID keys in .env.',
  },
  {
    match:   issue => issue.id === 'fake-integration-storage-no-backend',
    feature: 'File Upload (Cloudinary / S3)',
    reason:  'File upload UI is present but no storage backend is configured.',
    action:  'Add CLOUDINARY_URL or AWS_S3_BUCKET to .env.',
  },
  {
    match:   issue => issue.category === 'fake_billing' && issue.id.includes('missing-webhook'),
    feature: 'Stripe Webhooks',
    reason:  'Stripe is integrated but webhook handling for subscription lifecycle is missing.',
    action:  'Implement POST /api/billing/webhook and add STRIPE_WEBHOOK_SECRET to .env.',
  },
];

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a BackendAuthenticityReport from all checker results.
 *
 * @param {import('./types').AuthenticityIssue[]} issues
 * @returns {import('./types').BackendAuthenticityReport}
 */
function buildAuthenticityReport(issues) {
  // Classify issues into: genuine fakes vs acceptable placeholders
  const { fakeIssues, placeholderIssues } = _classify(issues);

  const placeholderFeatures = _buildPlaceholderFeatures(placeholderIssues);
  const blockedFeatures     = _buildBlockedFeatures(fakeIssues);
  const warnings            = _buildWarnings(fakeIssues);

  const criticalOrHigh = fakeIssues.filter(i => i.severity === 'critical' || i.severity === 'high');
  const status         = _determineStatus(fakeIssues, placeholderFeatures);
  const summary        = _buildSummary(status, fakeIssues, placeholderFeatures, blockedFeatures);

  return {
    status,
    fakeBackendIssues:  fakeIssues,
    placeholderFeatures,
    blockedFeatures,
    warnings,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * One-line log summary.
 * @param {import('./types').BackendAuthenticityReport} report
 * @returns {string}
 */
function summarizeAuthenticity(report) {
  return [
    `status="${report.status}"`,
    `fakeIssues=${report.fakeBackendIssues.length}`,
    `placeholders=${report.placeholderFeatures.length}`,
    `blocked=${report.blockedFeatures.length}`,
    `warnings=${report.warnings.length}`,
  ].join(' ');
}

/**
 * Lean payload for the Zyra UI panel.
 * @param {import('./types').BackendAuthenticityReport} report
 * @returns {Object}
 */
function buildUiAuthenticityPayload(report) {
  return {
    status:             report.status,
    fakeIssueCount:     report.fakeBackendIssues.length,
    placeholderCount:   report.placeholderFeatures.length,
    blockedCount:       report.blockedFeatures.length,
    criticalIssues:     report.fakeBackendIssues
                          .filter(i => i.severity === 'critical')
                          .map(i => i.message)
                          .slice(0, 5),
    placeholderFeatures: report.placeholderFeatures.map(p => p.feature),
    blockedFeatures:    report.blockedFeatures.map(b => b.feature),
    warnings:           report.warnings.slice(0, 5),
    summary:            report.summary,
  };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _classify(issues) {
  const fakeIssues       = [];
  const placeholderIssues = [];

  for (const issue of issues) {
    const placeholder = PLACEHOLDER_MAP.find(p => p.match(issue));
    if (placeholder) {
      placeholderIssues.push({ issue, placeholder });
    } else {
      fakeIssues.push(issue);
    }
  }

  return { fakeIssues, placeholderIssues };
}

function _buildPlaceholderFeatures(placeholderIssues) {
  const seen = new Set();
  return placeholderIssues
    .filter(({ placeholder }) => {
      if (seen.has(placeholder.feature)) return false;
      seen.add(placeholder.feature);
      return true;
    })
    .map(({ placeholder }) => ({
      feature: placeholder.feature,
      reason:  placeholder.reason,
      action:  placeholder.action,
    }));
}

function _buildBlockedFeatures(fakeIssues) {
  const blocked = [];
  const FEATURE_MAP = {
    fake_auth:        'User authentication',
    fake_db:          'Data persistence',
    fake_billing:     'Payment processing',
    fake_admin:       'Admin panel / role access',
    fake_api:         'API backend',
    fake_dashboard:   'Real-time dashboard metrics',
    fake_integration: 'Third-party integrations',
    hardcoded_data:   'Dynamic data',
    stub_implementation: 'Backend functionality',
  };

  const seen = new Set();
  for (const issue of fakeIssues.filter(i => i.severity === 'critical' || i.severity === 'high')) {
    const feature = FEATURE_MAP[issue.category] || issue.category;
    if (seen.has(feature)) continue;
    seen.add(feature);
    blocked.push({
      feature,
      reason: issue.message,
    });
  }

  return blocked;
}

function _buildWarnings(fakeIssues) {
  return fakeIssues
    .filter(i => i.severity === 'low' || i.severity === 'medium')
    .map(i => i.message);
}

/**
 * @param {import('./types').AuthenticityIssue[]} fakeIssues
 * @param {import('./types').PlaceholderFeature[]} placeholders
 * @returns {import('./types').AuthenticityStatus}
 */
function _determineStatus(fakeIssues, placeholders) {
  if (fakeIssues.length === 0 && placeholders.length === 0) return 'authentic_backend';
  if (fakeIssues.length === 0 && placeholders.length > 0)  return 'placeholder_only';
  if (fakeIssues.some(i => i.severity === 'critical'))     return 'fake_backend_detected';
  if (fakeIssues.some(i => i.severity === 'high'))         return 'fake_backend_detected';
  return 'authentic_backend'; // medium/low issues don't flip status
}

function _buildSummary(status, fakeIssues, placeholders, blocked) {
  if (status === 'authentic_backend' && placeholders.length === 0) {
    return 'Backend implementation looks authentic — all features are backed by real server logic.';
  }

  if (status === 'placeholder_only') {
    const names = placeholders.map(p => p.feature).join(', ');
    return `Backend is authentic. The following features require external configuration before going live: ${names}.`;
  }

  const critical = fakeIssues.filter(i => i.severity === 'critical').length;
  const high     = fakeIssues.filter(i => i.severity === 'high').length;
  const parts    = [];

  if (critical > 0) parts.push(`${critical} critical fake backend pattern${critical > 1 ? 's' : ''} detected`);
  if (high     > 0) parts.push(`${high} high-severity authenticity issue${high > 1 ? 's' : ''}`);
  if (blocked.length > 0) parts.push(`${blocked.length} feature${blocked.length > 1 ? 's' : ''} blocked`);
  if (placeholders.length > 0) parts.push(`${placeholders.length} placeholder feature${placeholders.length > 1 ? 's' : ''} require configuration`);

  return `Fake backend detected. ${parts.join(', ')}. Review fakeBackendIssues for details.`;
}

module.exports = { buildAuthenticityReport, summarizeAuthenticity, buildUiAuthenticityPayload };
