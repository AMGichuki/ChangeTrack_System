// CONTROLLER: the student's read-only "My grade review" tracker.
const requestModel = require('../models/requestModel');
const { toStudentView } = require('../services/studentProgress');

// GET /api/student/requests   -> my requests and their progress (no private details)
async function myRequests(req, res, next) {
  try {
    const requests = await requestModel.listForStudent(req.user.id);
    const progress = await requestModel.listProgressFor(requests.map((r) => r.id));
    res.json({
      student_number: req.user.student_number,
      requests: toStudentView(requests, progress),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { myRequests };
