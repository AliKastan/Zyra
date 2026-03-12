const { Router } = require('express');
const { handleGenerate, handleComplexity } = require('../controllers/generateController');
const { enforceQuota } = require('../middleware/quotaMiddleware');

const router = Router();

router.post('/', enforceQuota, handleGenerate);
router.get('/complexity', handleComplexity);

module.exports = router;
