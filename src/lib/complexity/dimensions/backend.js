'use strict';

const MAX = 14;

/**
 * Score data and backend complexity.
 * @param {import('../types').ScoringContext} ctx
 * @returns {import('../types').DimensionResult}
 */
function scoreBackend(ctx) {
  const reasons = [];
  const signals = {};
  let score = 0;

  // Authentication
  const hasAuth = ctx.intent.needsAuth === true ||
    /\b(login|sign up|signup|sign in|register|auth|authentication|jwt|session|password)\b/.test(ctx.allText);
  signals.hasAuth = hasAuth;
  if (hasAuth) { score += 3; reasons.push('Authentication required'); }

  // Database / persistent data storage
  const hasDB = ctx.intent.needsDatabase === true ||
    (ctx.intent.needsDatabase !== false &&
      (ctx.entities.length >= 2 || /\b(database|store|save|persist|record|history|data)\b/.test(ctx.allText)));
  signals.hasDB = hasDB;
  if (hasDB) { score += 2; reasons.push('Persistent data storage required'); }

  // File uploads / storage
  const hasStorage = /\b(upload|file|image|photo|document|attachment|media|s3|cdn|storage)\b/.test(ctx.allText);
  signals.hasStorage = hasStorage;
  if (hasStorage) { score += 2; reasons.push('File uploads and storage required'); }

  // Payments / billing
  const hasPayments = ctx.intent.needsPayments === true ||
    /\b(payment|billing|subscription|stripe|invoice|checkout|pricing|plan|purchase|buy)\b/.test(ctx.allText);
  signals.hasPayments = hasPayments;
  if (hasPayments) { score += 3; reasons.push('Payment/billing integration required'); }

  // Complex entity relationships (4+ entities implies relational complexity)
  const hasComplexRelations = ctx.entities.length >= 4;
  signals.hasComplexRelations = hasComplexRelations;
  if (hasComplexRelations) { score += 2; reasons.push(`${ctx.entities.length} entities imply complex data relationships`); }

  // Real-time features
  const hasRealTime = /\b(real.?time|live|websocket|socket\.io|push|instant|notification|stream|feed)\b/.test(ctx.allText);
  signals.hasRealTime = hasRealTime;
  if (hasRealTime) { score += 2; reasons.push('Real-time features detected'); }

  return { score: Math.min(score, MAX), max: MAX, reasons, signals };
}

module.exports = { scoreBackend };
