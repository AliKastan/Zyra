'use strict';

const MAX = 12;

/**
 * Score role and permission complexity.
 * @param {import('../types').ScoringContext} ctx
 * @returns {import('../types').DimensionResult}
 */
function scoreRoles(ctx) {
  const reasons = [];
  const signals = {};

  const roleCount    = ctx.roles.length;
  signals.roleCount  = roleCount;

  let score;
  if (roleCount >= 4) {
    score = 12;
    reasons.push(`${roleCount} distinct user roles (maximum role complexity)`);
  } else if (roleCount === 3) {
    score = 7;
    reasons.push(`${roleCount} user roles (e.g. user + admin + operator)`);
  } else if (roleCount === 2) {
    score = 4;
    reasons.push('Two user roles detected (e.g. user + admin)');
  } else {
    score = 1;
  }

  // RBAC / fine-grained permissions bonus
  const hasRbac = /\b(permission|role.?based|rbac|access control|privilege|scope)\b/.test(ctx.allText);
  signals.hasRbac = hasRbac;
  if (hasRbac && score < MAX) {
    score = Math.min(score + 2, MAX);
    reasons.push('Fine-grained permission system implied');
  }

  // isMultiUser explicit signal
  if (ctx.intent.isMultiUser && roleCount < 2) {
    score = Math.max(score, 4);
    reasons.push('Multi-user application');
  }

  return { score: Math.min(score, MAX), max: MAX, reasons, signals };
}

module.exports = { scoreRoles };
