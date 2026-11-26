// CONTROLLER: approvers' queues and decisions (Chair, Dean, Registrar).
const db = require('../config/db');
const { DECISIONS } = require('../config/rules');
const requestModel = require('../models/requestModel');
const userModel = require('../models/userModel');
const delegationModel = require('../models/delegationModel');
const { workingDaysSince, resolveApproverContext } = require('../services/requestAccess');
const studentModel = require('../models/studentModel');
const { sendReviewNeededEmails, sendDecisionToLecturerEmail, sendGradePostedEmail } = require('../services/emailService');
const { afterResponse } = require('../services/background');

const STAGE_LABEL = { CHAIR: 'Chair of Department', DEAN: 'Dean', REGISTRAR: 'Registrar' };

function fail(res, code, message) {
  return res.status(code).json({ status: 'error', message });
}

// GET /api/reviews/queue?acting_for=<approver id>   -> requests waiting for MY decision
// (or for the approver I am acting for today)
async function getQueue(req, res, next) {
  try {
    const ctx = resolveApproverContext(req.user, req.query.acting_for);
    if (!ctx) return fail(res, 403, 'You are not acting for this approver today.');
    const rows = await requestModel.listQueue({
      status: ctx.flow.status,
      departmentId: ctx.flow.ownDepartmentOnly ? ctx.departmentId : null,
    });
    const queue = rows.map((r) => ({ ...r, working_days: workingDaysSince(r.waiting_since) }));
    res.json({ role: ctx.role, acting_for: ctx.actingFor, queue });
  } catch (err) {
    next(err);
  }
}

// GET /api/reviews/history   -> requests I have already decided on
async function getHistory(req, res, next) {
  try {
    res.json({ history: await requestModel.listDecidedBy(req.user.id) });
  } catch (err) {
    next(err);
  }
}

// POST /api/reviews/:id/decision   { decision, comment, verified, acting_for }
async function decide(req, res, next) {
  try {
    const ctx = resolveApproverContext(req.user, req.body.acting_for);
    if (!ctx) return fail(res, 403, 'You are not acting for this approver today.');
    const { flow } = ctx;
    const decision = String(req.body.decision || '').toUpperCase();
    const comment = String(req.body.comment || '').trim();

    if (!flow.decisions.includes(decision)) return fail(res, 400, 'Choose one of the decision buttons.');
    const movesForward = decision === 'APPROVE' || decision === 'POST';
    if (decision === 'POST' && req.body.verified !== true) {
      return fail(res, 400, 'Tick "I verified and entered the grade" first.');
    }
    if (!movesForward && comment.length < 5) {
      return fail(res, 400, 'Write a comment (at least 5 characters) explaining why.');
    }
    if (comment.length > 1000) return fail(res, 400, 'Keep the comment under 1000 characters.');

    const id = Number(req.params.id);
    const request = Number.isInteger(id) ? await requestModel.findById(id) : null;
    // A Chair or Dean (or acting one) only sees their department's requests.
    const inScope = request && (!flow.ownDepartmentOnly || request.department_id === ctx.departmentId);
    if (!inScope) return fail(res, 404, 'Request not found.');

    // ---- The approval chain rules ----
    if (request.status !== flow.status) {
      return fail(res, 409, 'This request is no longer waiting for your decision.');
    }
    if (request.lecturer_id === req.user.id) {
      return fail(res, 403, 'You cannot decide on your own request.');
    }
    if (movesForward && (await requestModel.hasApprovedThisRound(id, req.user.id))) {
      return fail(res, 403, 'You have already approved this request at another stage.');
    }

    const newStatus = movesForward ? flow.next : DECISIONS[decision];

    // ---- Save: change status + add history line, together ----
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const moved = await requestModel.moveStatus(client, id, flow.status, newStatus);
      if (!moved) {
        await client.query('ROLLBACK');
        return fail(res, 409, 'Someone else has just decided on this request. Refresh the page.');
      }
      await requestModel.insertApproval(client, {
        requestId: id,
        approverId: req.user.id,
        stage: flow.stage,
        decision: DECISIONS[decision],
        comment: comment || null,
        actingForId: ctx.actingFor ? ctx.actingFor.id : null,
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    res.json({ status: 'ok', request_number: request.request_number, new_status: newStatus });

    // ---- Emails (after saving; a failed email never undoes the decision) ----
    const info = { requestNumber: request.request_number, courseCode: request.course_code };
    let sendEmails;
    if (decision === 'POST') {
      // Grade posted -> lecturer and student
      sendEmails = Promise.all([userModel.findEmailById(request.lecturer_id), studentModel.findEmailByNumber(request.student_number)])
        .then(([lecturerEmail, studentEmail]) => sendGradePostedEmail([lecturerEmail, studentEmail].filter(Boolean), info));
    } else if (decision === 'APPROVE') {
      // The Dean of the request's department; the Registrar sees all departments.
      const departmentId = flow.nextRole === 'DEAN' ? request.department_id : null;
      sendEmails = delegationModel.listStageEmails(flow.nextRole, departmentId)
        .then((emails) => sendReviewNeededEmails(emails, { ...info, path: `/${flow.nextRole.toLowerCase()}` }));
    } else sendEmails = userModel.findEmailById(request.lecturer_id)
          .then((email) => email && sendDecisionToLecturerEmail(email, {
            ...info, decision: DECISIONS[decision], stageLabel: STAGE_LABEL[flow.stage], comment,
          }));
    afterResponse('Decision email', () => sendEmails);
  } catch (err) {
    next(err);
  }
}

module.exports = { getQueue, getHistory, decide };
