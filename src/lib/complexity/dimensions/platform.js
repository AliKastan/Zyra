'use strict';

const MAX = 8;

/**
 * Score platform complexity: web, mobile, admin.
 * @param {import('../types').ScoringContext} ctx
 * @returns {import('../types').DimensionResult}
 */
function scorePlatform(ctx) {
  const reasons = [];
  const signals = {};
  let score = 0;

  // Base: web is always present
  score += 2;

  // Mobile app (dedicated, not just responsive)
  const hasMobileApp = /\b(mobile app|ios app|android app|react native|flutter|capacitor|native app)\b/.test(ctx.allText);
  signals.hasMobileApp = hasMobileApp;
  if (hasMobileApp) {
    score += 4;
    reasons.push('Dedicated mobile app significantly increases platform complexity');
  } else {
    // Mobile responsive (implied by most modern apps)
    const hasResponsive = /\b(mobile|responsive|phone|tablet|pwa|progressive web)\b/.test(ctx.allText);
    signals.hasResponsive = hasResponsive;
    if (hasResponsive) {
      score += 2;
      reasons.push('Mobile-responsive design required');
    }
  }

  // Separate admin panel / back-office
  const hasAdmin = /\b(admin|back.?office|admin panel|admin dashboard|management panel|staff portal)\b/.test(ctx.allText) ||
    ctx.roles.some(r => r.name && r.name.toLowerCase().includes('admin'));
  signals.hasAdmin = hasAdmin;
  if (hasAdmin) {
    score += 2;
    reasons.push('Admin panel required');
  }

  return { score: Math.min(score, MAX), max: MAX, reasons, signals };
}

module.exports = { scorePlatform };
