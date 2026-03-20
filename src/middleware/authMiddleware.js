const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { env } = require('../config/env');
const logger = require('../utils/logger');

// ── Private beta gate cookie ──────────────────────────────────────────────────
const ACCESS_COOKIE  = 'zyra_access';
const PRIVATE_BETA   = process.env.DISABLE_APP_BILLING_FOR_PRIVATE_BETA === 'true';

/** Returns true if the request carries the access-gate cookie. */
function hasGateCookie(req) {
  const cookie = req.headers.cookie || '';
  return cookie.split(';').some(c => c.trim() === `${ACCESS_COOKIE}=true`);
}

/** Generates a stable anonymous user-id from the gate cookie's IP/UA fingerprint. */
function betaUserId(req) {
  const seed = (req.ip || '') + (req.headers['user-agent'] || '') + 'zyra-beta';
  return 'beta-' + crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

// ── Supabase client (lazy-initialised) ───────────────────────────────────────
let supabase = null;

function getSupabase() {
  if (!supabase) {
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set in .env.local');
    }
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  }
  return supabase;
}

// ── requireAuth ───────────────────────────────────────────────────────────────

/**
 * Verifies the caller is authorised to use the API.
 *
 * Private-beta path (DISABLE_APP_BILLING_FOR_PRIVATE_BETA=true):
 *   - If the request carries the access-gate cookie, it is treated as a
 *     trusted beta tester with a synthetic anonymous user object.
 *   - A Supabase session is NOT required. The access-code gate on /access
 *     is the only authentication barrier for beta mode.
 *   - Users who DO provide a Bearer token are still validated normally so
 *     they get their real user id (important for billing post-beta).
 *
 * Production path (DISABLE_APP_BILLING_FOR_PRIVATE_BETA not set):
 *   - A valid Supabase Bearer token is required on every request.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // ── Private-beta shortcut ─────────────────────────────────────────────────
  if (PRIVATE_BETA && hasGateCookie(req)) {
    if (token) {
      // Try to resolve a real Supabase user — best-effort, non-blocking fallback
      try {
        const { data } = await getSupabase().auth.getUser(token);
        if (data?.user) {
          req.user = data.user;
          logger.debug(`[auth] beta+supabase user: ${data.user.email || data.user.id}`);
          return next();
        }
      } catch (_) {
        // Supabase unavailable — fall through to beta-anonymous
      }
    }
    // No valid Supabase token — grant anonymous beta access
    req.user = {
      id:    betaUserId(req),
      email: 'beta@private.zyra',
      role:  'beta',
      _beta: true,
    };
    logger.debug(`[auth] [GEN] private_beta_gate_result=PASSED anon_id=${req.user.id}`);
    return next();
  }

  // ── Production path ───────────────────────────────────────────────────────
  if (!token) {
    logger.warn('[auth] [GEN] auth_resolved=FAILED reason=no_bearer_token');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data?.user) {
      logger.debug(`[auth] [GEN] auth_resolved=FAILED reason=${error?.message || 'no_user'}`);
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }
    req.user = data.user;
    logger.debug(`[auth] [GEN] auth_resolved=OK user=${data.user.email || data.user.id}`);
    next();
  } catch (err) {
    logger.error('[auth] [GEN] auth_resolved=ERROR', { error: err.message });
    return res.status(500).json({ error: 'Authentication error' });
  }
}

module.exports = { requireAuth };