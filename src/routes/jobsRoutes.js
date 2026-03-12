const { Router } = require('express');
const { handleListJobs, handleGetJob, handleCancelJob } = require('../controllers/jobsController');

const router = Router();

router.get('/', handleListJobs);
router.get('/:id', handleGetJob);
router.post('/:id/cancel', handleCancelJob);

module.exports = router;
