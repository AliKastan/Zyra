'use strict';

const express = require('express');
const { handleRunSelfHeal, handleGetLatestReport } = require('../controllers/selfHealController');

const router = express.Router();

// POST /api/self-heal — trigger analysis (body: { logText, exitCode, source, dryRun })
router.post('/', handleRunSelfHeal);

// GET /api/self-heal/report — fetch the latest saved report
router.get('/report', handleGetLatestReport);

module.exports = router;
