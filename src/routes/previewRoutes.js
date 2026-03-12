const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/previewController');

router.post('/start/:slug', ctrl.startPreview);
router.get('/status/:slug', ctrl.getPreviewStatus);
router.delete('/stop/:slug', ctrl.stopPreview);
router.get('/list', ctrl.listPreviews);
// Wildcard must be last
router.get('/file/:slug/*', ctrl.getFileContent);

module.exports = router;
