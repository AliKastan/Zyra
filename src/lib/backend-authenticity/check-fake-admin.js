'use strict';

/**
 * Fake Admin Panel Detector
 *
 * Detects admin panels and admin routes that lack proper authentication
 * and role-based access control:
 * - Admin routes without auth middleware
 * - Admin pages accessible to any logged-in user (no role check)
 * - CRUD operations without permission guards
 * - Admin UI visible unconditionally
 */

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {Object} files - Normalized file map { path: content }
 * @returns {import('./types').AuthenticityIssue[]}
 */
function checkFakeAdmin(files) {
  const issues = [];

  const allBackend = Object.entries(files)
    .filter(([p]) => _isBackendFile(p))
    .map(([, c]) => c).join('\n');

  // Does the project have any admin concept?
  const hasAdminConcept =
    /admin|Admin/.test(Object.keys(files).join(' ')) ||
    /(?:isAdmin|role.*admin|admin.*route|\/admin)/i.test(Object.values(files).join('\n'));

  if (!hasAdminConcept) return issues;

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    if (/\.(test|spec)\.[jt]sx?$/.test(path)) return issues;

    // ── 1. Backend /admin routes without auth middleware ──────────────
    if (_isBackendFile(path)) {
      const adminRoutes = _extractAdminRoutes(content);

      for (const route of adminRoutes) {
        const hasGuard = _routeHasAuthGuard(route, content);
        if (!hasGuard) {
          issues.push({
            id:       `fake-admin-unguarded-route-${_slug(path)}-${_slug(route)}`,
            category: 'fake_admin',
            severity: 'critical',
            message:  `${path} defines a route matching "${route}" with no authentication or admin role middleware.`,
            fix:      'Add requireAdmin (or requireAuth + role check) middleware: router.use(\'/admin\', requireAdmin, adminRouter)',
            file:     path,
            pattern:  `app.*(get|post|put|delete).*${route} without auth middleware`,
          });
        }
      }
    }

    // ── 2. Frontend admin panel rendered without role check ───────────
    if (_isFrontendFile(path) && /admin/i.test(path)) {
      const hasRoleCheck = (
        /user\.role\s*===?\s*['"`]admin['"`]/.test(content) ||
        /isAdmin/.test(content) ||
        /role\s*===?\s*['"`]admin['"`]/.test(content) ||
        /hasPermission|canAccess|requiresAdmin/.test(content)
      );

      if (!hasRoleCheck) {
        issues.push({
          id:       `fake-admin-no-role-check-${_slug(path)}`,
          category: 'fake_admin',
          severity: 'critical',
          message:  `${path} is an admin panel component but renders without checking user.role === 'admin' or equivalent.`,
          fix:      "Wrap the admin panel in: if (user?.role !== 'admin') return <Navigate to='/' />",
          file:     path,
          pattern:  'Admin component renders without role check',
        });
      }
    }

    // ── 3. Delete/update-all operations without any auth check ────────
    if (_isBackendFile(path)) {
      const hasDangerousOps = (
        /app\.(delete|put)\s*\(\s*['"`]\/api\/(?!auth)[^'"]+['"`]\s*,\s*(?:async\s*)?\([^)]*\)\s*=>/.test(content) ||
        /router\.(delete|put)\s*\(\s*['"`]\//.test(content)
      );

      const hasAnyAuth = (
        /authenticate|requireAuth|verifyToken|isAuthenticated|authMiddleware|req\.user/i.test(content)
      );

      if (hasDangerousOps && !hasAnyAuth) {
        issues.push({
          id:       `fake-admin-unprotected-mutations-${_slug(path)}`,
          category: 'fake_admin',
          severity: 'high',
          message:  `${path} exposes DELETE/PUT API routes with no authentication middleware — any user can mutate or delete data.`,
          fix:      'Add authentication middleware to all mutation routes. Only allow admin users to perform destructive operations.',
          file:     path,
          pattern:  'app.delete / app.put without authenticate middleware',
        });
      }
    }
  }

  return _dedup(issues);
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _extractAdminRoutes(content) {
  const routes = new Set();
  const ROUTE_RE = /(?:app|router)\.\w+\s*\(\s*['"`](\/admin[^'"` ]*)/gi;
  let m;
  while ((m = ROUTE_RE.exec(content)) !== null) {
    routes.add(m[1]);
  }
  return [...routes];
}

function _routeHasAuthGuard(route, content) {
  // Look for the route definition and check if middleware appears before the handler
  const routeIdx = content.indexOf(route);
  if (routeIdx === -1) return false;

  // Check the 300 chars around the route for auth middleware references
  const window = content.slice(Math.max(0, routeIdx - 100), routeIdx + 300);
  return (
    /authenticate|requireAuth|verifyToken|isAuthenticated|requireAdmin|checkAdmin|adminMiddleware/i.test(window)
  );
}

function _isFrontendFile(path) {
  if (/\.(test|spec)\.[jt]sx?$/.test(path)) return false;
  return /\.(jsx?|tsx?)$/.test(path) && (
    path.includes('components') || path.includes('pages') ||
    path.includes('views') || path.includes('src/') || path.includes('frontend')
  );
}

function _isBackendFile(path) {
  if (/\.(test|spec)\.[jt]sx?$/.test(path)) return false;
  return (
    path.endsWith('server.js') || path.endsWith('server.ts') ||
    path.endsWith('app.js')    || path.endsWith('app.ts') ||
    path.includes('routes/')   || path.includes('controllers/') ||
    path.endsWith('src/index.js')
  );
}

function _dedup(issues) {
  const seen = new Set();
  return issues.filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

function _slug(str) {
  return str.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').slice(0, 40);
}

module.exports = { checkFakeAdmin };
