const { Router } = require('express');
const { getRoutingConfig } = require('../services/orchestrator');
const { getActiveJobCount } = require('../services/generationService');
const { now } = require('../utils/timestamps');
const limits = require('../config/limits');

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'zyra',
    time: now(),
    routing: getRoutingConfig(),
    activeJobs: getActiveJobCount(),
    limits: {
      maxJobDurationMs: limits.MAX_JOB_DURATION_MS,
      maxConcurrentJobs: limits.MAX_CONCURRENT_JOBS,
    },
  });
});

module.exports = router;
