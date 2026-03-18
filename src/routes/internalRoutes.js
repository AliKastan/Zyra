'use strict';

/**
 * Internal Routes
 *
 * Admin/tester-only endpoints. All routes require authentication.
 * The /access-status endpoint is further restricted to internal testers.
 *
 * Mounted at /api/internal
 */

const express = require('express');
const router  = express.Router();
const { checkInternalAccess, getAccessConfig } = require('../config/internalAccess');
const logger = require('../utils/logger');

/**
 * GET /api/internal/access-status
 *
 * Returns the current user's internal test access status, the reason for the
 * decision, and a sanitized view of the access configuration.
 *
 * This endpoint is intentionally accessible to any authenticated user so that
 * a tester can verify their own status. The response content is safe to expose:
 *   - individual allowlist emails are never returned
 *   - only counts and matched status are shown
 */
router.get('/access-status', (req, res) => {
  const user   = req.user;
  const result = checkInternalAccess(user);
  const config = getAccessConfig();

  logger.info(`[internal] access-status checked for ${user?.email || 'unknown'} — granted=${result.granted}`);

  const email = (user?.email || '').toLowerCase();
  const role  = (
    user?.app_metadata?.role  ||
    user?.user_metadata?.role ||
    null
  );

  return res.json({
    user: {
      id:    user?.id    || null,
      email: user?.email || null,
      role:  role        || null,
    },
    access: {
      granted: result.granted,
      reason:  result.reason,
      method:  result.method,
    },
    config,
  });
});

module.exports = router;
