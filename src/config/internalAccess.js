'use strict';

/**
 * Internal Test Access
 *
 * Determines whether a request originates from an internal tester, admin,
 * or staging environment — allowing the billing/quota gate to be bypassed
 * WITHOUT disabling billing for real users.
 *
 * Configuration (all optional — system defaults to normal billing when absent):
 *
 *   ENABLE_INTERNAL_TEST_ACCESS=true
 *     Master switch. If false or unset, no bypass is ever applied.
 *
 *   INTERNAL_TEST_EMAILS=alice@company.com,bob@company.com
 *     Comma-separated list of email addresses that always get internal access.
 *     Compared case-insensitively.
 *
 *   INTERNAL_TEST_ROLES=admin,internal_tester
 *     Comma-separated list of app_metadata.role values that grant access.
 *     Defaults to "admin,internal_tester" when the flag is enabled.
 *
 *   INTERNAL_TEST_BYPASS_ON_STAGING=true
 *     When true, ANY authenticated user on NODE_ENV=staging gets access.
 *
 * Security model:
 *   - All checks are server-side only (this file is never exposed to the browser)
 *   - Email allowlist is sourced exclusively from server env vars
 *   - Roles are read from Supabase app_metadata (service-role-controlled, not user-editable)
 *   - Every bypass is audit-logged with reason
 */

const ENABLED = process.env.ENABLE_INTERNAL_TEST_ACCESS === 'true';

const ALLOWED_EMAILS = (process.env.INTERNAL_TEST_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const ALLOWED_ROLES = (process.env.INTERNAL_TEST_ROLES || 'admin,internal_tester')
  .split(',')
  .map(r => r.trim().toLowerCase())
  .filter(Boolean);

const BYPASS_ON_STAGING = process.env.INTERNAL_TEST_BYPASS_ON_STAGING === 'true';

/**
 * Returns a detailed result object describing why access was granted or denied.
 * The `granted` boolean is the authoritative decision.
 *
 * @param {object|null} user - req.user from authMiddleware (Supabase user object)
 * @returns {{ granted: boolean, reason: string, method: string|null }}
 */
function checkInternalAccess(user) {
  if (!ENABLED) {
    return { granted: false, reason: 'Internal test access is disabled (ENABLE_INTERNAL_TEST_ACCESS not set)', method: null };
  }

  if (!user) {
    return { granted: false, reason: 'No authenticated user', method: null };
  }

  // Staging environment bypass — any authenticated user on staging
  if (BYPASS_ON_STAGING && process.env.NODE_ENV === 'staging') {
    return { granted: true, reason: 'Staging environment bypass active', method: 'staging_env' };
  }

  const email = (user.email || '').toLowerCase().trim();
  const role  = (
    user.app_metadata?.role     ||   // service-role-set (most trusted)
    user.user_metadata?.role    ||   // user-set (less trusted, kept for convenience)
    ''
  ).toLowerCase().trim();

  // Email allowlist check
  if (email && ALLOWED_EMAILS.includes(email)) {
    return { granted: true, reason: `Email "${email}" is on the internal test allowlist`, method: 'email_allowlist' };
  }

  // Role check (app_metadata is controlled by server/admin — not editable by users)
  if (role && ALLOWED_ROLES.includes(role)) {
    return { granted: true, reason: `User role "${role}" grants internal test access`, method: 'role' };
  }

  return {
    granted: false,
    reason: 'User is not on the internal test allowlist',
    method: null,
  };
}

/**
 * Convenience boolean wrapper — use this in middleware.
 * @param {object|null} user
 * @returns {boolean}
 */
function isInternalTester(user) {
  return checkInternalAccess(user).granted;
}

/**
 * Returns the sanitized configuration summary for the debug endpoint.
 * Does NOT expose individual email addresses — only counts.
 */
function getAccessConfig() {
  return {
    enabled:           ENABLED,
    emailAllowlistSize: ALLOWED_EMAILS.length,
    allowedRoles:      ALLOWED_ROLES,
    bypassOnStaging:   BYPASS_ON_STAGING,
    currentEnv:        process.env.NODE_ENV || 'development',
  };
}

module.exports = { isInternalTester, checkInternalAccess, getAccessConfig };
