'use strict';

/**
 * AUTH VALIDATION
 *
 * Only runs when intent.needsAuth === true.
 *
 * Checks:
 *   - At least one auth-related file exists                     [critical]
 *   - JWT/session/bcrypt patterns exist in JS                   [major]
 *   - Login/signup pages exist                                  [major]
 *   - Protected route or middleware pattern exists              [major]
 *   - Logout / sign-out function exists                         [medium]
 *   - Role checks exist for multi-role apps                     [major]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateAuth(ctx) {
  const { fileMap, filePaths, intent } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  // Skip if auth is not required
  if (!intent.needsAuth) {
    return { status: 'pass', issues: [] };
  }

  const allJsContent = _joinFiles(fileMap, p => p.endsWith('.js') || p.endsWith('.ts'));
  const allHtmlContent = _joinFiles(fileMap, p => p.endsWith('.html'));

  // ── 1. Auth-related files must exist ─────────────────────────────────────
  const authFilePatterns = [
    'auth.js', 'auth.ts', 'auth.html',
    'login.html', 'login.js',
    'signup.html', 'register.html',
    'middleware/auth', 'middlewares/auth',
    'routes/auth', 'api/auth',
    'utils/auth', 'lib/auth',
  ];
  const hasAuthFile = authFilePatterns.some(pattern =>
    [...filePaths].some(p => p.includes(pattern))
  );

  if (!hasAuthFile) {
    issues.push({
      id:         'missing_auth_file',
      severity:   'critical',
      message:    'No auth-related files found but auth is required (no auth.js, login.html, middleware/auth, etc.)',
      suggestion: 'Create auth.js with JWT/session logic and login.html with login form',
    });
  }

  // ── 2. JWT/session/bcrypt logic in JS ─────────────────────────────────────
  const hasJwtSign    = /jwt\.sign\s*\(|jwt\.verify\s*\(/.test(allJsContent);
  const hasBcrypt     = /bcrypt(?:js)?\.hash\s*\(|bcrypt(?:js)?\.compare\s*\(/.test(allJsContent);
  const hasSession    = /session\s*\[|req\.session\.|createSession|sessionToken/.test(allJsContent);
  const hasAuthLogic  = hasJwtSign || hasBcrypt || hasSession;

  if (!hasAuthLogic) {
    issues.push({
      id:         'missing_auth_logic',
      severity:   'major',
      message:    'No JWT signing, bcrypt hashing, or session management found in JS — auth logic appears to be stub-only',
      suggestion: 'Implement JWT signing with jwt.sign() and password hashing with bcrypt.hash()',
    });
  }

  // ── 3. Login/signup UI ───────────────────────────────────────────────────
  const hasLoginPage  = [...filePaths].some(p => /login/.test(p) || /signin/.test(p));
  const hasSignupPage = [...filePaths].some(p => /signup/.test(p) || /register/.test(p));

  if (!hasLoginPage) {
    issues.push({
      id:         'missing_login_page',
      severity:   'major',
      message:    'No login page found (login.html, signin.html, etc.) — users cannot authenticate',
      suggestion: 'Create login.html with username/email + password form and auth API call',
    });
  }

  if (!hasSignupPage) {
    issues.push({
      id:         'missing_signup_page',
      severity:   'major',
      message:    'No signup/register page found — new users cannot create accounts',
      suggestion: 'Create signup.html or register.html with registration form',
    });
  }

  // ── 4. Protected route pattern ───────────────────────────────────────────
  const hasMiddleware = /authMiddleware|authenticate|isAuthenticated|requireAuth|verifyToken|checkAuth/.test(allJsContent);
  if (!hasMiddleware) {
    issues.push({
      id:         'missing_auth_middleware',
      severity:   'major',
      message:    'No auth middleware or route protection pattern found — authenticated routes may be publicly accessible',
      suggestion: 'Create an auth middleware that validates JWT tokens and protects private routes',
    });
  }

  // ── 5. Logout function ───────────────────────────────────────────────────
  const hasLogout = /logout\s*[=(]|signOut\s*[=(]|clearSession|removeToken|deleteSession/.test(allJsContent);
  if (!hasLogout) {
    issues.push({
      id:         'missing_logout',
      severity:   'medium',
      message:    'No logout or sign-out function found in JS',
      suggestion: 'Implement a logout function that clears JWT tokens and session data',
    });
  }

  // ── 6. Role checks for multi-role apps ───────────────────────────────────
  if (intent.isMultiUser) {
    const hasRoleCheck = /role\s*===|isAdmin|hasRole|checkPermission|userRole|req\.user\.role/.test(allJsContent);
    if (!hasRoleCheck) {
      issues.push({
        id:         'missing_role_checks',
        severity:   'major',
        message:    'Multi-user app with no role-based access control found — all authenticated users have equal access',
        suggestion: 'Implement role checks (e.g., req.user.role === "admin") on privileged routes',
      });
    }
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

module.exports = { validateAuth };
