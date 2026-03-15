'use strict';

const MAX = 12;

/**
 * Score deployment and production-readiness complexity.
 * @param {import('../types').ScoringContext} ctx
 * @returns {import('../types').DimensionResult}
 */
function scoreDeployment(ctx) {
  const reasons = [];
  const signals = {};
  let score = 0;

  // Estimate env var count from known service categories
  let envCount = 0;
  if (ctx.intent.needsAuth)     envCount += 1; // JWT_SECRET etc
  if (ctx.intent.needsPayments) envCount += 2; // STRIPE_KEY, STRIPE_SECRET
  if (signals.hasAI)            envCount += 1; // API key
  const hasEmailService = /\b(sendgrid|mailgun|postmark|ses|smtp|email)\b/.test(ctx.allText);
  if (hasEmailService)          envCount += 1;
  const hasCDN = /\b(s3|cloudinary|cloudfront|firebase storage|supabase storage)\b/.test(ctx.allText);
  if (hasCDN)                   envCount += 1;
  // Integration count also implies env vars
  envCount = Math.max(envCount, Math.ceil(ctx.integrations.length * 0.6));

  const envScore = Math.min(envCount, 4);
  signals.estimatedEnvVarCount = envCount;
  score += envScore;
  if (envCount >= 4) reasons.push(`${envCount}+ environment variables required`);

  // Background jobs / async processing
  const hasBackgroundJobs = /\b(background job|cron|queue|worker|async process|scheduled|batch|job process)\b/.test(ctx.allText) ||
    /\b(notification send|email send|digest|reminder)\b/.test(ctx.allText);
  signals.hasBackgroundJobs = hasBackgroundJobs;
  if (hasBackgroundJobs) { score += 3; reasons.push('Background jobs or async processing required'); }

  // Webhooks
  const hasWebhooks = /\b(webhook|stripe webhook|callback url|event hook)\b/.test(ctx.allText);
  signals.hasWebhooks = hasWebhooks;
  if (hasWebhooks) { score += 2; reasons.push('Webhook handling required'); }

  // Mobile build pipeline
  const hasMobileBuild = /\b(mobile app|ios|android|react native|flutter|app store|play store)\b/.test(ctx.allText);
  signals.hasMobileBuild = hasMobileBuild;
  if (hasMobileBuild) { score += 3; reasons.push('Mobile app build pipeline increases deployment complexity'); }

  return { score: Math.min(score, MAX), max: MAX, reasons, signals };
}

module.exports = { scoreDeployment };
