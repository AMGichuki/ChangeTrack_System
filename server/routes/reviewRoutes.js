// Approver routes: Chair, Dean and Registrar.
const express = require('express');
const reviews = require('../controllers/reviewController');
const { requireAuth, requireApprover } = require('../middleware/auth');

const router = express.Router();
// Chair, Dean, Registrar, or anyone acting for one of them today.
router.use(requireAuth, requireApprover);

router.get('/queue', reviews.getQueue);
router.get('/history', reviews.getHistory);
router.post('/:id/decision', reviews.decide);

module.exports = router;
