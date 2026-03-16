'use strict';

/**
 * Fake Auth Detector
 *
 * Detects simulated/fake authentication flows:
 * - Hardcoded credentials in login handlers
 * - Client-side-only auth state (no server validation)
 * - JWT creation without a secret
 * - Auth middleware that is present but bypassed
 * - localStorage user-injection without server verification
 */

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {Object} files - Normalized file map { path: content }
 * @returns {import('./types').AuthenticityIssue[]}
 */
function checkFakeAuth(files) {
  const issues = [];

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    if (/\.(test|spec)\.[jt]sx?$/.test(path)) continue;

    // ── 1. Hardcoded credentials ─────────────────────────────────────────
    if (
      /if\s*\(\s*(?:username|email|user)\s*===?\s*['"`][^'"`]{1,40}['"`]\s*&&/.test(content) &&
      /password\s*===?\s*['"`][^'"`]{1,40}['"`]/.test(content)
    ) {
      issues.push({
        id:       `fake-auth-hardcoded-credentials-${_slug(path)}`,
        category: 'fake_auth',
        severity: 'critical',
        message:  `${path} contains hardcoded username/password comparison — this is a fake login, not real authentication.`,
        fix:      'Query a real user database and compare hashed passwords using bcrypt.',
        file:     path,
        pattern:  'if (username === "admin" && password === "password")',
      });
    }

    // ── 2. Client-side auth state set without server call ────────────────
    // setIsLoggedIn(true) / setUser({...}) without a preceding fetch/await
    if (_isFrontendFile(path)) {
      const loginFnMatch = content.match(/(?:handleLogin|onLogin|loginUser|submitLogin)\s*=?\s*(?:async\s*)?\([^)]*\)\s*(?:=>)?\s*\{([^}]{0,600})\}/s);
      if (loginFnMatch) {
        const body = loginFnMatch[1];
        const hasFetch  = /await\s+(?:fetch|axios)/.test(body);
        const setsState = /set(?:IsLoggedIn|User|Auth|LoggedIn|IsAuthenticated)\s*\(/.test(body) ||
                          /localStorage\.setItem\s*\(/.test(body);
        if (!hasFetch && setsState) {
          issues.push({
            id:       `fake-auth-client-only-state-${_slug(path)}`,
            category: 'fake_auth',
            severity: 'critical',
            message:  `${path} sets auth state (setUser / setIsLoggedIn / localStorage) without making a real API call.`,
            fix:      'POST credentials to a real /api/auth/login endpoint and set auth state only on successful server response.',
            file:     path,
            pattern:  'setIsLoggedIn(true) without fetch/axios',
          });
        }
      }
    }

    // ── 3. localStorage.setItem('user', ...) with literal user object ────
    if (/localStorage\.setItem\s*\(\s*['"`](?:user|token|auth|session)['"`]\s*,\s*JSON\.stringify\s*\(\s*\{/.test(content) &&
        !/(await\s+(?:fetch|axios)|res\.json|response\.json)/.test(content.slice(0, content.indexOf('localStorage.setItem')))) {
      issues.push({
        id:       `fake-auth-localstorage-inject-${_slug(path)}`,
        category: 'fake_auth',
        severity: 'high',
        message:  `${path} stores a hardcoded user object in localStorage without server authentication.`,
        fix:      'Store only the server-issued JWT token in localStorage, received after successful POST /api/auth/login.',
        file:     path,
        pattern:  "localStorage.setItem('user', JSON.stringify({...}))",
      });
    }

    // ── 4. JWT signed with literal/empty secret ──────────────────────────
    if (/jwt\.sign\s*\([^)]+,\s*['"`][^'"`]{0,30}['"`]/.test(content) &&
        !/process\.env\./.test(content.match(/jwt\.sign\s*\([^)]+,\s*(['"`][^'"`]{0,30}['"`])/)?.[1] || '')) {
      issues.push({
        id:       `fake-auth-jwt-hardcoded-secret-${_slug(path)}`,
        category: 'fake_auth',
        severity: 'critical',
        message:  `${path} signs JWT tokens with a hardcoded secret instead of process.env.JWT_SECRET.`,
        fix:      "Use jwt.sign(payload, process.env.JWT_SECRET) and add JWT_SECRET to .env.example.",
        file:     path,
        pattern:  "jwt.sign(payload, 'hardcoded-secret')",
      });
    }

    // ── 5. Auth middleware defined but never applied (cross-file check) ─────
    if (_isBackendFile(path)) {
      const definesMiddleware = /(?:const|function)\s+(?:authenticate|requireAuth|verifyToken|isAuthenticated|authMiddleware)\s*[=(]/.test(content);

      if (definesMiddleware) {
        // Check if the middleware is applied in ANY backend file (not just this one)
        const allBackendContent = Object.entries(files)
          .filter(([p]) => _isBackendFile(p))
          .map(([, c]) => c).join('\n');

        const appliesMiddleware =
          /app\.use\s*\(\s*(?:authenticate|requireAuth|verifyToken|isAuthenticated|authMiddleware)/.test(allBackendContent) ||
          /(?:app|router)\.\w+\s*\([^)]*,\s*(?:authenticate|requireAuth|verifyToken|isAuthenticated|authMiddleware)/.test(allBackendContent) ||
          /(?:authenticate|requireAuth|verifyToken|isAuthenticated|authMiddleware)\s*,/.test(allBackendContent);

        if (!appliesMiddleware) {
          issues.push({
            id:       `fake-auth-unused-middleware-${_slug(path)}`,
            category: 'fake_auth',
            severity: 'high',
            message:  `${path} defines an auth middleware function but it is never applied to any routes across the project.`,
            fix:      'Apply the middleware: router.use(authenticate) or add it as a second argument to protected routes.',
            file:     path,
            pattern:  'authenticate defined but not applied to routes',
          });
        }
      }
    }
  }

  return _dedup(issues);
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _isFrontendFile(path) {
  if (/\.(test|spec)\.[jt]sx?$/.test(path)) return false;
  return /\.(jsx?|tsx?)$/.test(path) && (
    path.includes('components') || path.includes('pages') || path.includes('views') ||
    path.includes('src/') || path.endsWith('App.js') || path.endsWith('App.jsx') ||
    path.includes('frontend') || path.includes('client')
  );
}

function _isBackendFile(path) {
  if (/\.(test|spec)\.[jt]sx?$/.test(path)) return false;
  return (
    path.endsWith('server.js') || path.endsWith('server.ts') ||
    path.endsWith('app.js')    || path.endsWith('app.ts') ||
    path.includes('routes/')   || path.includes('controllers/') ||
    path.includes('middleware/') || path.endsWith('src/index.js')
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

module.exports = { checkFakeAuth };
