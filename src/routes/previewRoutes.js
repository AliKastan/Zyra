const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/previewController');
const { getFallbackHtml } = require('../generators/devFallback');

router.post('/start/:slug', ctrl.startPreview);
router.get('/status/:slug', ctrl.getPreviewStatus);
router.delete('/stop/:slug', ctrl.stopPreview);
router.get('/list', ctrl.listPreviews);

// Dev fallback — serves a locally-generated playable game template instantly.
// Used by the frontend when real generation fails, so the preview panel stays usable.
router.get('/dev-fallback/:mode', (req, res) => {
  const mode = req.params.mode === '3d' ? '3d' : '2d';
  res.type('text/html').send(getFallbackHtml(mode));
});

// Wildcard must be last
router.get('/file/:slug/*', ctrl.getFileContent);

module.exports = router;
