const { Router } = require('express');
const { getRoutingConfig } = require('../services/orchestrator');
const { getActiveJobCount } = require('../services/generationService');
const { now } = require('../utils/timestamps');
const limits = require('../config/limits');

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status:     'ok',
    service:    'zyra',
    time:       now(),
    routing:    getRoutingConfig(),
    activeJobs: getActiveJobCount(),
    limits: {
      maxJobDurationMs:  limits.MAX_JOB_DURATION_MS,
      maxConcurrentJobs: limits.MAX_CONCURRENT_JOBS,
    },
    // Exposed to frontend via apiFetch('/api/health')
    privateBeta: process.env.DISABLE_APP_BILLING_FOR_PRIVATE_BETA === 'true',
  });
});

module.exports = router;
