const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/envController');

// GET  /api/projects/:slug/env   — return masked vars list
// POST /api/projects/:slug/env   — save vars
router.get('/:slug/env',  ctrl.getEnvVars);
router.post('/:slug/env', ctrl.setEnvVars);

module.exports = router;
