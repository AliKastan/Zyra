const { Router } = require('express');
const { handleListProjects, handleGetProjectFiles, handleDeleteProject } = require('../controllers/projectsController');

const router = Router();

router.get('/', handleListProjects);
router.get('/:name/files', handleGetProjectFiles);
router.delete('/:name', handleDeleteProject);

module.exports = router;
