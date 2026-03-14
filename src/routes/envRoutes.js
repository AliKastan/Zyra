const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/envController');

// GET  /api/projects/:slug/env   — return masked vars list
// POST /api/projects/:slug/env   — save vars
router.get('/:slug/env',  ctrl.getEnvVars);
router.post('/:slug/env', ctrl.setEnvVars);

// GET  /api/projects/:slug/integrations         — integration manifest with per-var status
// POST /api/projects/:slug/integrations/validate — validate a single var value
router.get('/:slug/integrations',          ctrl.getIntegrations);
router.post('/:slug/integrations/validate', ctrl.validateIntegration);

module.exports = router;
