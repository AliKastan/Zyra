const express = require('express');
const { handleFixGame } = require('../controllers/fixController');

const router = express.Router();

// POST /api/fix/:slug  { description?, mode? }
router.post('/:slug', handleFixGame);

module.exports = router;
