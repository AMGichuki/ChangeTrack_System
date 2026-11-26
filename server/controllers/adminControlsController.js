// CONTROLLER: Admin "Controls & audit" (wireframe page 11):
// reminder settings, acting approvers (delegations) and the decision audit log.
const db = require('../config/db');
const requestModel = require('../models/requestModel');
const delegationModel = require('../models/delegationModel');
const { csvCell } = require('./adminReportController');

function fail(res, code, message) {
  return res.status(code).json({ status: 'error', message });
}

// ---------------- Reminder settings ----------------

// GET /api/admin/settings
async function getSettings(req, res, next) {
  try {
    res.json({ settings: await requestModel.getSettings() });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/settings   { approver_reminder_days, admin_escalation_days }
async function updateSettings(req, res, next) {
  try {
    const reminder = Number(req.body.approver_reminder_days);
    const escalation = Number(req.body.admin_escalation_days);
    const ok = (n) => Number.isInteger(n) && n >= 1 && n <= 30;
    if (!ok(reminder) || !ok(escalation)) return fail(res, 400, 'Use whole numbers of working days from 1 to 30.');
    if (escalation < reminder) {
      return fail(res, 400, 'The Admin escalation must come on or after the approver reminder.');
    }
    await db.query(
      `INSERT INTO settings (id, approver_reminder_days, admin_escalation_days, updated_at)
       VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE
         SET approver_reminder_days = $1, admin_escalation_days = $2, updated_at = now()`,
      [reminder, escalation]
    );
    res.json({ settings: await requestModel.getSettings() });
  } catch (err) {
    next(err);
  }
}

// ---------------- Acting approvers ----------------

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Who may act for this approver? (same rule on the screen and here)
//  - an active staff member, not the approver, and not an Admin
//    (Admins manage the system; they do not approve grades)
//  - for a Chair or Dean: someone from the same department
function canActFor(approver, delegate) {
  if (!delegate.is_active || delegate.id === approver.id || delegate.role === 'ADMIN') return false;
  if (['CHAIR', 'DEAN'].includes(approver.role) && delegate.department_id !== approver.department_id) return false;
  return true;
}

async function loadStaff() {
  const { rows } = await db.query(
    `SELECT u.id, u.full_name, u.role, u.is_active, u.department_id, d.name AS department_name
       FROM users u JOIN departments d ON d.id = u.department_id
      ORDER BY u.full_name`
  );
  return rows;
}

// GET /api/admin/delegations
async function listDelegations(req, res, next) {
  try {
    const [delegations, staff] = await Promise.all([delegationModel.listAll(), loadStaff()]);
    const approvers = staff.filter((u) => ['CHAIR', 'DEAN', 'REGISTRAR'].includes(u.role) && u.is_active);
    // For each approver, the people who may act for them.
    const options = approvers.map((a) => ({
      ...a,
      eligible: staff.filter((d) => canActFor(a, d)).map((d) => ({ id: d.id, full_name: d.full_name, role: d.role, department_name: d.department_name })),
    }));
    res.json({ delegations, approvers: options });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/delegations   { approver_id, delegate_id, start_date, end_date }
async function createDelegation(req, res, next) {
  try {
    const staff = await loadStaff();
    const approver = staff.find((u) => u.id === Number(req.body.approver_id));
    const delegate = staff.find((u) => u.id === Number(req.body.delegate_id));
    if (!approver || !['CHAIR', 'DEAN', 'REGISTRAR'].includes(approver.role)) return fail(res, 400, 'Choose the approver who will be away.');
    if (!delegate) return fail(res, 400, 'Choose who will act for them.');
    if (!canActFor(approver, delegate)) {
      return fail(res, 400, ['CHAIR', 'DEAN'].includes(approver.role)
        ? `An acting ${approver.role === 'DEAN' ? 'Dean' : 'Chair'} must be an active staff member (not an Admin) from the same department.`
        : 'The acting approver must be an active staff member who is not an Admin.');
    }

    const startDate = String(req.body.start_date || '');
    const endDate = req.body.end_date ? String(req.body.end_date) : null;
    if (!DATE_PATTERN.test(startDate) || Number.isNaN(Date.parse(startDate))) return fail(res, 400, 'Choose a start date.');
    if (endDate && (!DATE_PATTERN.test(endDate) || Number.isNaN(Date.parse(endDate)))) return fail(res, 400, 'The end date is not valid.');
    if (endDate && endDate < startDate) return fail(res, 400, 'The end date must be on or after the start date.');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); // YYYY-MM-DD
    if (startDate < today) return fail(res, 400, 'The start date cannot be in the past.');

    if (await delegationModel.findOverlap(approver.id, startDate, endDate)) {
      return fail(res, 400, `${approver.full_name} already has an acting approver for some of these dates.`);
    }

    const id = await delegationModel.create({ approverId: approver.id, delegateId: delegate.id, startDate, endDate });
    res.status(201).json({ status: 'ok', id });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/delegations/:id
// Decisions already made by the acting approver stay in the audit log
// (they are stored in APPROVALS with "acting for").
async function removeDelegation(req, res, next) {
  try {
    const removed = await delegationModel.remove(Number(req.params.id));
    if (!removed) return fail(res, 404, 'Delegation not found.');
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
}

// ---------------- Decision audit log ----------------

async function loadAudit(search) {
  const params = [];
  let where = '';
  if (search) {
    params.push(`%${search}%`);
    where = `WHERE r.request_number ILIKE $1 OR r.course_code ILIKE $1 OR u.full_name ILIKE $1`;
  }
  const { rows } = await db.query(
    `SELECT a.id, r.id AS request_id, r.request_number, r.course_code,
            a.stage, a.decision, a.comment, a.decided_at,
            u.full_name AS decided_by, af.full_name AS acting_for
       FROM approvals a
       JOIN requests r     ON r.id = a.request_id
       JOIN users u        ON u.id = a.approver_id
       LEFT JOIN users af  ON af.id = a.acting_for_id
      ${where}
      ORDER BY a.decided_at DESC, a.id DESC
      LIMIT 1000`,
    params
  );
  return rows;
}

// GET /api/admin/audit?search=
async function getAudit(req, res, next) {
  try {
    res.json({ entries: await loadAudit(String(req.query.search || '').trim()) });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/audit/export?search=   -> CSV
async function exportAudit(req, res, next) {
  try {
    const rows = await loadAudit(String(req.query.search || '').trim());
    const header = ['Date/time (EAT)', 'Request', 'Course', 'Stage', 'Decision', 'Decided by', 'Acting for', 'Comment'];
    const when = (d) => new Date(d).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' });
    const lines = rows.map((r) => [
      when(r.decided_at), r.request_number, r.course_code, r.stage, r.decision, r.decided_by, r.acting_for || '', r.comment || '',
    ].map(csvCell).join(','));
    const csv = '﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n');
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="changetrack-audit-log-${today}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSettings, updateSettings,
  listDelegations, createDelegation, removeDelegation,
  getAudit, exportAudit,
  canActFor,
};
