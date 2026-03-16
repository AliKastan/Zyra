'use strict';

/**
 * Admin / Operations Section Regenerator
 *
 * Spec for admin dashboard, moderation panels, user management,
 * internal tools, order/booking management.
 *
 * IMPORTANT: Admin routes must always be guarded by requireAdmin middleware.
 * Never generate accessible admin panels without auth guards.
 */

/**
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object} [context]
 * @param {Object.<string,string>} [context.existingFiles]
 * @param {string} [context.userPrompt]
 * @param {Object} [context.intentMemory]
 * @returns {import('./types').SectionRegenerationSpec}
 */
function regenerateAdminSection(plan, context = {}) {
  const { existingFiles = {}, userPrompt = '' } = context;
  const isRemoval = plan.changeDetection.action === 'remove';

  const needsUserMgmt   = /user[_\s-]?manage|manage[_\s-]?users|user[_\s-]?list|all[_\s-]?users/i.test(userPrompt);
  const needsOrderMgmt  = /order|booking[_\s-]?manage|manage[_\s-]?booking|ticket/i.test(userPrompt);
  const needsModeration = /moderat|flag|report|ban|suspend/i.test(userPrompt);
  const needsStats      = /stat|metric|analytics|overview|summary/i.test(userPrompt);

  const existingAdminFiles = Object.keys(existingFiles).filter(p =>
    /admin|moderat|backoffice|management/i.test(p),
  );

  const filesToCreate = [];
  if (!isRemoval) {
    if (!existingAdminFiles.some(p => /pages?/.test(p))) {
      filesToCreate.push({ path: 'client/pages/Admin.jsx', description: 'Admin dashboard page with stats and quick actions' });
    }
    if (!existingAdminFiles.some(p => /routes?/.test(p))) {
      filesToCreate.push({ path: 'server/routes/admin.js', description: 'Admin API routes (CRUD on all resources)' });
    }
    if (!existingAdminFiles.some(p => /middleware/.test(p))) {
      filesToCreate.push({ path: 'server/middleware/requireAdmin.js', description: 'Middleware that enforces admin role guard' });
    }
    if (needsUserMgmt) {
      filesToCreate.push({ path: 'client/pages/AdminUsers.jsx', description: 'Admin user management page' });
      filesToCreate.push({ path: 'server/routes/admin-users.js', description: 'Admin user management API routes' });
    }
    if (needsOrderMgmt) {
      filesToCreate.push({ path: 'client/pages/AdminOrders.jsx', description: 'Admin order/booking management' });
    }
    if (needsModeration) {
      filesToCreate.push({ path: 'client/pages/AdminModeration.jsx', description: 'Content/user moderation panel' });
    }
  }

  const filesToPatch = existingAdminFiles.map(p => ({
    path: p,
    description: isRemoval ? 'Remove admin functionality' : 'Update admin functionality',
    operation:   isRemoval ? 'delete' : 'replace',
  }));

  const generationHints = [
    'Every admin route must apply requireAdmin middleware',
    'Admin middleware must check both authentication AND admin role',
    'Admin pages must check role on mount and redirect non-admins',
    'Never expose user PII in admin list views beyond what is necessary',
    'Admin API routes must return structured JSON, not raw database records',
  ];

  if (needsStats)     generationHints.push('Admin dashboard stats should use aggregation queries — not scan all records');
  if (needsModeration) generationHints.push('Moderation actions must be logged with admin user ID and timestamp');
  if (isRemoval)      generationHints.push('Remove requireAdmin middleware references and admin route registrations');

  return {
    sectionType:        'admin',
    filesToCreate,
    filesToPatch,
    envVarsNeeded:      [],
    dependenciesNeeded: [],
    generationHints,
    validationHints: [
      'Verify requireAdmin middleware is applied to all admin routes',
      'Verify admin pages redirect non-admin users',
      'Check admin API does not expose sensitive data beyond its intent',
    ],
    repairHints: [
      'Add requireAdmin middleware to any admin route missing it',
      'Add client-side role check to admin pages',
      'Remove hardcoded admin checks in favour of middleware',
    ],
    placeholderMode:  false,
    authenticityNote: 'Admin panels must be protected by real server-side role guards. Never expose admin UI without authentication.',
  };
}

module.exports = { regenerateAdminSection };
