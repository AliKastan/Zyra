const router = require('express').Router();
const { handleEdit } = require('../controllers/editController');
const { enforceQuota } = require('../middleware/quotaMiddleware');

// POST /api/edit/:slug  { prompt, mode }
router.post('/:slug', enforceQuota, handleEdit);

module.exports = router;
