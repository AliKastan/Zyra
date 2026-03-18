const express = require('express');
const { downloadProject } = require('../controllers/downloadController');

const router = express.Router();

router.get('/:slug', downloadProject);

module.exports = router;
