'use strict';

/**
 * Auth Planning Checks
 *
 * Detects auth requirements without corresponding structure planned:
 * - multi-user apps need auth foundation
 * - role-based access needs guard shell
 * - admin features need admin module
 * - protected routes need strategy
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').PreventionInput} input
 * @returns {import('./types').PreventionIssue[]}
 */
function checkAuthPlanning(input) {
  const { intent = {}, product = {}, stack = {}, blueprint = {}, complexityReport = null } = input;

  const issues = [];
  const allText  = _buildAllText(intent, product, blueprint, stack);
  const signals  = complexityReport?.signals || {};
  const fileList = _getFileList(stack, blueprint);

  const needsAuth = (
    intent.isMultiUser ||
    signals.hasAuth ||
    /\b(login|signup|sign.?up|register|auth|authentication|user account|account page|protected|private route|session|jwt|oauth|sso|password)\b/.test(allText)
  );

  if (!needsAuth) return issues;

  // ── Auth foundation files ─────────────────────────────────────────────────
  const hasAuthFile = fileList.some(f =>
    /auth|middleware|session|login|signup|register/i.test(f),
  );

  if (!hasAuthFile) {
    issues.push({
      id: 'auth-required-missing-foundation',
      category: 'auth',
      severity: 'high',
      action: 'generation_hint_added',
      reason: 'App requires authentication but no auth utility/middleware file is planned.',
      fix: 'Add auth.js, middleware/auth.js, or lib/auth.js to planned files',
    });
  }

  // ── Protected route strategy ──────────────────────────────────────────────
  const hasProtectedRouteStrategy = (
    allText.includes('protected') ||
    allText.includes('guard') ||
    allText.includes('middleware') ||
    fileList.some(f => /guard|protected|middleware/i.test(f))
  );

  if (!hasProtectedRouteStrategy) {
    issues.push({
      id: 'auth-missing-protected-route-strategy',
      category: 'auth',
      severity: 'medium',
      action: 'generation_hint_added',
      reason: 'Auth is required but no protected route strategy is planned. Unauthenticated users could access restricted pages.',
      fix: 'Plan a middleware or route guard that redirects unauthenticated users to /login',
    });
  }

  // ── Role-based access ─────────────────────────────────────────────────────
  const needsRoles = (
    signals.hasAdmin ||
    /\b(role|roles|admin.panel|rbac|permission|access.control|admin.user|super.?admin)\b/.test(allText)
  );

  if (needsRoles) {
    const hasRoleGuard = fileList.some(f =>
      /role|admin|guard|access/i.test(f),
    );

    if (!hasRoleGuard) {
      issues.push({
        id: 'roles-missing-guard-shell',
        category: 'role_access',
        severity: 'high',
        action: 'generation_hint_added',
        reason: 'Role-based access is required but no role guard or admin module is planned.',
        fix: 'Add a role guard middleware or admin.js module to the planned file list',
      });
    }
  }

  // ── Admin section ─────────────────────────────────────────────────────────
  const needsAdmin = (
    signals.hasAdmin ||
    /\b(admin.panel|admin.dashboard|admin.section|admin.route|manage.users|user.management)\b/.test(allText)
  );

  if (needsAdmin) {
    const hasAdminRoute = fileList.some(f => /admin/i.test(f));
    const adminInPages  = (product.pages || []).some(p => /admin/i.test(p.name || p));

    if (!hasAdminRoute && !adminInPages) {
      issues.push({
        id: 'admin-feature-missing-route-plan',
        category: 'role_access',
        severity: 'medium',
        action: 'warning_only',
        reason: 'Admin functionality is implied but no admin route or page is planned.',
        fix: 'Add /admin or pages/admin.js to the planned file/page list',
      });
    }
  }

  // ── JWT / session secret env var ──────────────────────────────────────────
  const hasAuthSecret = allText.includes('jwt_secret') || allText.includes('session_secret');
  if (!hasAuthSecret && needsAuth) {
    issues.push({
      id: 'auth-missing-secret-env-var',
      category: 'env',
      severity: 'medium',
      action: 'generation_hint_added',
      reason: 'Auth systems require a secret for signing tokens or sessions. Without this env var the app is insecure.',
      fix: 'Add JWT_SECRET or SESSION_SECRET to .env.example',
    });
  }

  return issues;
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _getFileList(stack, blueprint) {
  return [...new Set([...(stack?.files || []), ...(blueprint?.fileList || [])])];
}

function _buildAllText(intent, product, blueprint, stack) {
  return [
    intent.appType || '',
    (intent.features || []).map(f => `${f.name} ${f.description || ''}`).join(' '),
    product.summary || '',
    (product.pages || []).map(p => p.name || p).join(' '),
    blueprint.designNotes || '',
    (blueprint._designSpec?.generationHints || []).join(' '),
    (stack?.files || []).join(' '),
  ].join(' ').toLowerCase();
}

module.exports = { checkAuthPlanning };
