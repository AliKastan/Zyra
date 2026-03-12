const router = require('express').Router();
const { handleStartDebug, handleApplyFix, handleRollback } = require('../controllers/debugController');

router.post('/:slug',          handleStartDebug);
router.post('/:slug/apply',    handleApplyFix);
router.post('/:slug/rollback', handleRollback);

module.exports = router;
