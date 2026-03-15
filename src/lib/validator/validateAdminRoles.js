'use strict';

/**
 * ADMIN / ROLE VALIDATION
 *
 * Only runs when intent.isMultiUser === true or when admin features are
 * detected in the intent/blueprint.
 *
 * Checks:
 *   - Admin page(s) exist                                       [major]
 *   - Role-based access control exists in JS                    [major]
 *   - Role model is represented in data layer                   [medium]
 *   - Operational management flows are present                  [medium]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateAdminRoles(ctx) {
  const { fileMap, filePaths, intent, blueprint } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  // Determine if admin/multi-role validation is relevant
  const needsAdmin = intent.isMultiUser ||
    (intent.features || []).some(f => /admin|management|moderat|role|permiss/i.test(f.name || f.description || '')) ||
    (blueprint.fileSpecs || []).some(s => /admin/i.test(s.path || s.description || ''));

  if (!needsAdmin) {
    return { status: 'pass', issues: [] };
  }

  const allJsContent = _joinFiles(fileMap, p => p.endsWith('.js') || p.endsWith('.ts'));

  // ── 1. Admin page exists ──────────────────────────────────────────────────
  const adminPagePatterns = [
    'admin.html', 'admin.js',
    'admin/', 'dashboard/admin',
    'management.html', 'moderation.html',
  ];
  const hasAdminPage = adminPagePatterns.some(pattern =>
    [...filePaths].some(p => p.includes(pattern))
  );

  if (!hasAdminPage) {
    issues.push({
      id:         'missing_admin_page',
      severity:   'major',
      message:    'Multi-role / admin app has no admin page (admin.html, admin/, management.html)',
      suggestion: 'Create admin.html with user management, content moderation, or operational controls',
    });
  }

  // ── 2. Role-based access control in JS ───────────────────────────────────
  const hasRoleCheck = /role\s*===\s*['"]|role\s*!==\s*['"]|isAdmin|hasRole\s*\(|checkPermission\s*\(|req\.user\.role|userRole|\.role\s*===/.test(allJsContent);

  if (!hasRoleCheck) {
    issues.push({
      id:         'missing_rbac',
      severity:   'major',
      message:    'Multi-role app has no role-based access control code (isAdmin, hasRole, req.user.role, etc.)',
      suggestion: 'Implement RBAC: check req.user.role before serving admin routes and rendering admin UI',
    });
  }

  // ── 3. Role model in data layer ────────────────────────────────────────────
  const hasRoleModel = /role\s*:|roles\s*:|['"]role['"]\s*:|userRole|["']admin["']|["']moderator["']|["']owner["']/.test(allJsContent);

  if (!hasRoleModel) {
    issues.push({
      id:         'missing_role_model',
      severity:   'medium',
      message:    'No role field or role enum found in data models/schema — role persistence is not defined',
      suggestion: 'Add a role field to the user schema (e.g., role: { type: String, enum: ["user", "admin"] })',
    });
  }

  // ── 4. Operational management flows ────────────────────────────────────────
  // At minimum, user listing or content listing should exist in admin context
  const hasManagementOp = /getUsers|listUsers|getAllUsers|getAll|fetchAll|manageContent|moderateContent|userList/.test(allJsContent);

  if (!hasManagementOp && hasAdminPage) {
    issues.push({
      id:         'missing_management_operations',
      severity:   'medium',
      message:    'Admin page exists but no management operations found (getUsers, listContent, etc.)',
      suggestion: 'Implement admin data fetching operations (e.g., list all users, list all posts)',
    });
  }

  return { status: _checkStatus(issues), issues };
}

function _joinFiles(fileMap, predicate) {
  const parts = [];
  for (const [p, content] of fileMap) {
    if (predicate(p) && content) parts.push(content);
  }
  return parts.join('\n');
}

/**
 * @param {import('./types').ValidationIssue[]} issues
 * @returns {import('./types').CheckStatus}
 */
function _checkStatus(issues) {
  if (issues.length === 0) return 'pass';
  if (issues.some(i => i.severity === 'critical' || i.severity === 'major')) return 'fail';
  return 'warning';
}

module.exports = { validateAdminRoles };
