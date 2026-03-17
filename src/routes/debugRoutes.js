const router = require('express').Router();
const {
  handleStartDebug,
  handleGetDebugSession,
  handleApplyFix,
  handleRollback,
  handleStartHeal,
  handleStartIncident,
  handleStartVisual,
  handleAutoFix,
} = require('../controllers/debugController');

// Standard Fix My App
router.post('/:slug',                handleStartDebug);
router.get('/:slug/session/:jobId',  handleGetDebugSession);
router.post('/:slug/apply',          handleApplyFix);
router.post('/:slug/rollback',       handleRollback);

// Self-Healing Plan
router.post('/:slug/heal',           handleStartHeal);

// Production Incident Mode
router.post('/:slug/incident',       handleStartIncident);

// Visual Bug Debugger
router.post('/:slug/visual',         handleStartVisual);

// Automatic fix (analyze + auto-apply)
router.post('/:slug/auto',           handleAutoFix);

module.exports = router;
