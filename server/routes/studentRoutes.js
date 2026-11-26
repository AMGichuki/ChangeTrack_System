// Student routes: read-only, students can never change anything.
const express = require('express');
const student = require('../controllers/studentController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('STUDENT'));

router.get('/requests', student.myRequests);

module.exports = router;
