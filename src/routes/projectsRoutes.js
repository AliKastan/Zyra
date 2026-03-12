const { Router } = require('express');
const { handleListProjects, handleGetProjectFiles } = require('../controllers/projectsController');

const router = Router();

router.get('/', handleListProjects);
router.get('/:name/files', handleGetProjectFiles);

module.exports = router;
