const { Router } = require('express');
const ctrl = require('../controllers/backendController');

const router = Router();

// Provision — called by app.init() on every page load, idempotent, no auth
router.post('/provision/:projectId', ctrl.provision);

// Auth — no Zyra session required; these are called from generated app frontends
router.post('/auth/signup/:projectId',  ctrl.signUp);
router.post('/auth/signin/:projectId',  ctrl.signIn);
router.post('/auth/signout/:projectId', ctrl.signOut);

// Data CRUD — app JWT required (Authorization: Bearer <token>)
router.get   ('/data/:projectId/:collection',     ctrl.getAll);
router.post  ('/data/:projectId/:collection',     ctrl.create);
router.put   ('/data/:projectId/:collection/:id', ctrl.update);
router.delete('/data/:projectId/:collection/:id', ctrl.remove);

module.exports = router;
