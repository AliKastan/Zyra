'use strict';

const MAX = 10;

/**
 * Score operational complexity: admin, moderation, analytics, workflows.
 * @param {import('../types').ScoringContext} ctx
 * @returns {import('../types').DimensionResult}
 */
function scoreOperations(ctx) {
  const reasons = [];
  const signals = {};
  let score = 0;

  // Admin dashboard
  const hasAdminDashboard = ctx.roles.some(r => (r.id || '').includes('admin')) ||
    /\b(admin dashboard|back.?office|admin panel|admin view|management)\b/.test(ctx.allText);
  signals.hasAdminDashboard = hasAdminDashboard;
  if (hasAdminDashboard) { score += 3; reasons.push('Admin dashboard required'); }

  // Content moderation
  const hasModeration = /\b(moderat|flag|report abuse|review content|content review|block user|ban|spam)\b/.test(ctx.allText);
  signals.hasModeration = hasModeration;
  if (hasModeration) { score += 3; reasons.push('Content moderation system required'); }

  // Analytics / reporting
  const hasAnalytics = /\b(analytics|reporting|report|dashboard|metrics|kpi|chart|graph|statistics|insights)\b/.test(ctx.allText);
  signals.hasAnalytics = hasAnalytics;
  if (hasAnalytics) { score += 2; reasons.push('Analytics/reporting features required'); }

  // Internal workflows / automation
  const hasWorkflows = /\b(workflow|automation|automat|approval|trigger|pipeline|queue|notification|cron|schedule)\b/.test(ctx.allText);
  signals.hasWorkflows = hasWorkflows;
  if (hasWorkflows) { score += 2; reasons.push('Internal workflow automation detected'); }

  return { score: Math.min(score, MAX), max: MAX, reasons, signals };
}

module.exports = { scoreOperations };
