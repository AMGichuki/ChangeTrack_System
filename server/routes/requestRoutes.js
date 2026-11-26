// Grade change request routes.
const express = require('express');
const requests = require('../controllers/requestController');
const { requireAuth, requireRole, requireRoleOrActing } = require('../middleware/auth');
const { uploadEvidence } = require('../middleware/upload');

const router = express.Router();
router.use(requireAuth);

router.get('/options', requireRole('LECTURER'), requests.getOptions);
router.get('/student-lookup', requireRole('LECTURER'), requests.lookupStudent);
router.get('/mine', requireRole('LECTURER'), requests.listMine);
router.post('/', requireRole('LECTURER'), uploadEvidence, requests.createRequest);
router.put('/:id/resubmit', requireRole('LECTURER'), uploadEvidence, requests.resubmitRequest);

// One request in detail, and its evidence files. Who may see which request is
// checked inside the controller (own request / own department / all).
router.get('/:id', requireRole('LECTURER', 'CHAIR', 'DEAN', 'REGISTRAR', 'ADMIN'), requests.getRequest);
router.get('/:id/evidence/:evidenceId', requireRole('LECTURER', 'CHAIR', 'DEAN', 'REGISTRAR', 'ADMIN'), requests.openEvidence);
router.get('/:id/pdf', requireRoleOrActing('REGISTRAR', 'ADMIN'), requests.downloadPdf);

module.exports = router;
