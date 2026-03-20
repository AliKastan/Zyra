const express = require('express');
const { handleFixGame }    = require('../controllers/fixController');
const { handleQualityFix } = require('../controllers/qualityFixController');

const router = express.Router();

// POST /api/fix/quality/:slug  { errors[], originalPrompt }
// Silent pipeline: client found runtime bugs, Claude fixes them synchronously
router.post('/quality/:slug', handleQualityFix);

// POST /api/fix/:slug  { description?, mode? }
router.post('/:slug', handleFixGame);

module.exports = router;
