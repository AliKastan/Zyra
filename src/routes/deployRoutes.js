const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/deployController');
const { requireFeature } = require('../middleware/quotaMiddleware');

// Start a new deployment for a project
router.post('/:slug', requireFeature('deploy'), ctrl.startDeploy);

// Get the latest deployment status for a project
router.get('/:slug/status', ctrl.getDeployStatus);

// Get the full deployment history for a project
router.get('/:slug/history', ctrl.getDeployHistory);

module.exports = router;
