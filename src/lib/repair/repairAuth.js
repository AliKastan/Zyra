'use strict';

/**
 * AUTH REPAIR
 *
 * Creates auth scaffolding when intent.needsAuth === true and the validator
 * flagged missing auth files. Generates:
 *   - auth.js  (JWT sign/verify, bcrypt hash/compare, authMiddleware)
 *   - login.html  (functional login form with API call)
 *   - signup.html (functional registration form)
 *
 * Only runs for conditional_auto_repair classified auth issues.
 *
 * @param {import('./types').RepairContext} ctx
 * @returns {import('./types').RepairIssueResult[]}
 */
function repairAuth(ctx) {
  const { fileMap, filePaths, issues, decisions, intent } = ctx;
  /** @type {import('./types').RepairIssueResult[]} */
  const results = [];

  if (!intent.needsAuth) return results;

  const authIssues = issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair && (
      i.id === 'missing_auth_file'   ||
      i.id === 'missing_login_page'  ||
      i.id === 'missing_signup_page' ||
      i.id === 'missing_auth_logic'  ||
      i.id === 'missing_auth_middleware'
    );
  });

  if (authIssues.length === 0) return results;

  const issueIds = new Set(authIssues.map(i => i.id));

  // ── 1. auth.js ─────────────────────────────────────────────────────────────
  const needsAuthJs = issueIds.has('missing_auth_file') || issueIds.has('missing_auth_logic') || issueIds.has('missing_auth_middleware');
  if (needsAuthJs && !filePaths.has('auth.js') && !filePaths.has('src/auth.js') && !filePaths.has('middleware/auth.js')) {
    const authPath = _resolveAuthPath(filePaths);
    fileMap.set(authPath, _generateAuthJs());
    filePaths.add(authPath);
    results.push({
      issueId:    'missing_auth_file',
      action:     'created_file',
      path:       authPath,
      reason:     `Created ${authPath} with JWT sign/verify, bcrypt utilities, and authMiddleware`,
      safety:     'conditional_auto_repair',
      confidence: 0.82,
    });
  }

  // ── 2. login.html ──────────────────────────────────────────────────────────
  if ((issueIds.has('missing_login_page') || issueIds.has('missing_auth_file')) && !filePaths.has('login.html')) {
    const cssFile = [...filePaths].find(p => p.endsWith('.css')) || 'style.css';
    fileMap.set('login.html', _generateLoginHtml(cssFile));
    filePaths.add('login.html');
    results.push({
      issueId:    'missing_login_page',
      action:     'created_file',
      path:       'login.html',
      reason:     'Created login.html with functional auth form and API integration',
      safety:     'conditional_auto_repair',
      confidence: 0.85,
    });
  }

  // ── 3. signup.html ─────────────────────────────────────────────────────────
  if ((issueIds.has('missing_signup_page') || issueIds.has('missing_auth_file')) && !filePaths.has('signup.html') && !filePaths.has('register.html')) {
    const cssFile = [...filePaths].find(p => p.endsWith('.css')) || 'style.css';
    fileMap.set('signup.html', _generateSignupHtml(cssFile));
    filePaths.add('signup.html');
    results.push({
      issueId:    'missing_signup_page',
      action:     'created_file',
      path:       'signup.html',
      reason:     'Created signup.html with functional registration form and API integration',
      safety:     'conditional_auto_repair',
      confidence: 0.85,
    });
  }

  return results;
}

// ── Path resolution ────────────────────────────────────────────────────────────

function _resolveAuthPath(filePaths) {
  // Match project structure — if there's a middleware/ or src/ directory, use it
  if (filePaths.has('server.js') || filePaths.has('app.js')) {
    if ([...filePaths].some(p => p.startsWith('middleware/'))) return 'middleware/auth.js';
    if ([...filePaths].some(p => p.startsWith('src/')))        return 'src/auth.js';
  }
  return 'auth.js';
}

// ── auth.js generator ──────────────────────────────────────────────────────────

function _generateAuthJs() {
  return `'use strict';

const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');

const JWT_SECRET  = process.env.JWT_SECRET  || 'change-me-in-production';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

// ── Token utilities ───────────────────────────────────────────────────────────

/**
 * Sign a JWT for the given user payload.
 * @param {{ id: string, email?: string, role?: string }} payload
 * @returns {string}
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @returns {{ id: string, email?: string, role?: string } | null}
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ── Password utilities ────────────────────────────────────────────────────────

/**
 * Hash a plain-text password.
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

/**
 * Compare a plain-text password to a hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ── Express middleware ─────────────────────────────────────────────────────────

/**
 * Protect a route — requires a valid Bearer token in the Authorization header.
 * Sets req.user = decoded payload on success.
 */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

/**
 * Optional auth — sets req.user if token is present, but does not block.
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) req.user = verifyToken(token) || null;
  next();
}

module.exports = { signToken, verifyToken, hashPassword, comparePassword, authMiddleware, optionalAuth };
`;
}

// ── login.html generator ───────────────────────────────────────────────────────

function _generateLoginHtml(cssFile) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In</title>
  <link rel="stylesheet" href="${cssFile}">
  <style>
    .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .auth-card { background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e2e8f0); border-radius: 12px; padding: 40px; width: 100%; max-width: 400px; }
    .auth-card h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .auth-card p.subtitle { color: var(--color-text-muted, #64748b); margin-bottom: 28px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px; }
    .form-group input { width: 100%; padding: 10px 12px; border: 1px solid var(--color-border, #e2e8f0); border-radius: 8px; font-size: 1rem; }
    .form-group input:focus { outline: none; border-color: var(--color-primary, #4f46e5); }
    .btn-full { width: 100%; padding: 12px; background: var(--color-primary, #4f46e5); color: #fff; border: none; border-radius: 8px; font-size: 1rem; font-weight: 500; cursor: pointer; margin-top: 8px; }
    .btn-full:hover { filter: brightness(1.1); }
    .auth-footer { text-align: center; margin-top: 20px; font-size: 0.875rem; color: var(--color-text-muted, #64748b); }
    .auth-footer a { color: var(--color-primary, #4f46e5); text-decoration: none; }
    .error-msg { background: #fef2f2; color: #dc2626; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 0.875rem; display: none; }
  </style>
</head>
<body>
  <div class="auth-page">
    <div class="auth-card">
      <h1>Sign In</h1>
      <p class="subtitle">Welcome back — sign in to continue.</p>

      <div class="error-msg" id="error-msg"></div>

      <form id="login-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="you@example.com" required autocomplete="email">
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" placeholder="Your password" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn-full" id="submit-btn">Sign In</button>
      </form>

      <div class="auth-footer">
        Don't have an account? <a href="signup.html">Create one</a>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = (typeof process !== 'undefined' && process.env && process.env.API_URL)
      ? process.env.API_URL
      : (window.location.hostname === 'localhost' ? 'http://localhost:3000' : '');

    const form      = document.getElementById('login-form');
    const errorMsg  = document.getElementById('error-msg');
    const submitBtn = document.getElementById('submit-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMsg.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';

      try {
        const res = await fetch(API_BASE + '/api/auth/login', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            email:    document.getElementById('email').value.trim(),
            password: document.getElementById('password').value,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Login failed');
        }

        // Store token and redirect
        localStorage.setItem('token', data.token);
        if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = 'index.html';

      } catch (err) {
        errorMsg.textContent = err.message;
        errorMsg.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    });

    // Redirect if already logged in
    if (localStorage.getItem('token')) {
      window.location.href = 'index.html';
    }
  </script>
</body>
</html>
`;
}

// ── signup.html generator ──────────────────────────────────────────────────────

function _generateSignupHtml(cssFile) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Create Account</title>
  <link rel="stylesheet" href="${cssFile}">
  <style>
    .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .auth-card { background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e2e8f0); border-radius: 12px; padding: 40px; width: 100%; max-width: 400px; }
    .auth-card h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .auth-card p.subtitle { color: var(--color-text-muted, #64748b); margin-bottom: 28px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px; }
    .form-group input { width: 100%; padding: 10px 12px; border: 1px solid var(--color-border, #e2e8f0); border-radius: 8px; font-size: 1rem; }
    .form-group input:focus { outline: none; border-color: var(--color-primary, #4f46e5); }
    .btn-full { width: 100%; padding: 12px; background: var(--color-primary, #4f46e5); color: #fff; border: none; border-radius: 8px; font-size: 1rem; font-weight: 500; cursor: pointer; margin-top: 8px; }
    .btn-full:hover { filter: brightness(1.1); }
    .auth-footer { text-align: center; margin-top: 20px; font-size: 0.875rem; color: var(--color-text-muted, #64748b); }
    .auth-footer a { color: var(--color-primary, #4f46e5); text-decoration: none; }
    .error-msg { background: #fef2f2; color: #dc2626; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 0.875rem; display: none; }
    .success-msg { background: #f0fdf4; color: #16a34a; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 0.875rem; display: none; }
  </style>
</head>
<body>
  <div class="auth-page">
    <div class="auth-card">
      <h1>Create Account</h1>
      <p class="subtitle">Get started — create your account.</p>

      <div class="error-msg"   id="error-msg"></div>
      <div class="success-msg" id="success-msg"></div>

      <form id="signup-form">
        <div class="form-group">
          <label for="name">Name</label>
          <input type="text" id="name" name="name" placeholder="Your name" required autocomplete="name">
        </div>
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="you@example.com" required autocomplete="email">
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" placeholder="At least 8 characters" required minlength="8" autocomplete="new-password">
        </div>
        <button type="submit" class="btn-full" id="submit-btn">Create Account</button>
      </form>

      <div class="auth-footer">
        Already have an account? <a href="login.html">Sign in</a>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = (typeof process !== 'undefined' && process.env && process.env.API_URL)
      ? process.env.API_URL
      : (window.location.hostname === 'localhost' ? 'http://localhost:3000' : '');

    const form       = document.getElementById('signup-form');
    const errorMsg   = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');
    const submitBtn  = document.getElementById('submit-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMsg.style.display = 'none';
      successMsg.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';

      try {
        const res = await fetch(API_BASE + '/api/auth/register', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            name:     document.getElementById('name').value.trim(),
            email:    document.getElementById('email').value.trim(),
            password: document.getElementById('password').value,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Registration failed');
        }

        // Auto-login after registration
        if (data.token) {
          localStorage.setItem('token', data.token);
          if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
          window.location.href = 'index.html';
        } else {
          successMsg.textContent = 'Account created! Redirecting to login...';
          successMsg.style.display = 'block';
          setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        }

      } catch (err) {
        errorMsg.textContent = err.message;
        errorMsg.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    });
  </script>
</body>
</html>
`;
}

module.exports = { repairAuth };
