const { Router } = require('express');
const {
  handleListProjects, handleGetProject, handleGetProjectFiles, handleDeleteProject,
  handleOpenProject, handleRestoreProject, handleGetStoredFiles,
} = require('../controllers/projectsController');

const router = Router();

router.get('/', handleListProjects);
router.post('/:name/open', handleOpenProject);
router.post('/:name/restore', handleRestoreProject);
router.get('/:name/files', handleGetProjectFiles);
router.get('/:name/stored-files', handleGetStoredFiles);
router.get('/:name', handleGetProject);
router.delete('/:name', handleDeleteProject);

module.exports = router;
