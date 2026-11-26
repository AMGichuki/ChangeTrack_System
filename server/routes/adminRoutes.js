// Admin-only routes. Every route below needs a signed-in ADMIN.
const express = require('express');
const admin = require('../controllers/adminUserController');
const reports = require('../controllers/adminReportController');
const controls = require('../controllers/adminControlsController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));

// System overview
router.get('/overview', reports.getOverview);
router.get('/requests', reports.listRequests);
router.get('/requests/export', reports.exportRequests);

router.get('/job-titles', admin.listJobTitles);
router.post('/job-titles', admin.createJobTitle);
router.delete('/job-titles/:id', admin.removeJobTitle);

router.get('/departments', admin.listDepartments);
router.get('/departments/overview', admin.departmentOverview);
router.post('/departments', admin.createDepartment);

router.get('/users', admin.listStaff);
router.post('/users', admin.createStaff);
router.put('/users/:id', admin.updateStaff);
router.put('/users/:id/password', admin.setStaffPassword);
router.delete('/users/:id', admin.deleteStaff);

router.get('/students', admin.listStudents);
router.post('/students', admin.createStudent);
router.put('/students/:id', admin.updateStudent);
router.put('/students/:id/password', admin.setStudentPassword);
router.delete('/students/:id', admin.deleteStudent);

// Controls & audit
router.post('/reminders/run', admin.runRemindersNow);
router.get('/settings', controls.getSettings);
router.put('/settings', controls.updateSettings);
router.get('/delegations', controls.listDelegations);
router.post('/delegations', controls.createDelegation);
router.delete('/delegations/:id', controls.removeDelegation);
router.get('/audit', controls.getAudit);
router.get('/audit/export', controls.exportAudit);

module.exports = router;
