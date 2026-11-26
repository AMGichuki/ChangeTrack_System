// CONTROLLER: Admin "System overview" — cards, charts, report table and CSV export.
const reportModel = require('../models/reportModel');
const requestModel = require('../models/requestModel');
const { REASONS } = require('../config/rules');
const { workingDaysSince } = require('../services/requestAccess');

const STATUSES = ['WITH_CHAIR', 'WITH_DEAN', 'WITH_REGISTRAR', 'POSTED', 'RETURNED', 'REJECTED'];
const OPEN = ['WITH_CHAIR', 'WITH_DEAN', 'WITH_REGISTRAR'];

// Read the filters from the URL (?search=&department_id=&status=), ignoring bad values.
function readFilters(query) {
  const departmentId = Number(query.department_id);
  return {
    search: String(query.search || '').trim(),
    departmentId: Number.isInteger(departmentId) && departmentId > 0 ? departmentId : null,
    status: STATUSES.includes(query.status) ? query.status : '',
  };
}

// GET /api/admin/overview
async function getOverview(req, res, next) {
  try {
    const [counts, byDepartment, reasonRows, settings] = await Promise.all([
      reportModel.getCounts(),
      reportModel.countByDepartment(),
      reportModel.countByReason(),
      requestModel.getSettings(),
    ]);
    // Always show all four reasons, even when one has 0 requests.
    const byReason = REASONS
      .map((r) => ({ reason: r.value, label: r.label, count: reasonRows.find((x) => x.reason === r.value)?.count || 0 }))
      .sort((a, b) => b.count - a.count);
    res.json({ counts, byDepartment, byReason, settings });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/requests?search=&department_id=&status=
async function listRequests(req, res, next) {
  try {
    const rows = await reportModel.listRequests(readFilters(req.query));
    // "Age" = working days in the current stage (only for open requests).
    const requests = rows.map((r) => ({
      ...r,
      age_working_days: OPEN.includes(r.status) ? workingDaysSince(r.last_activity) : null,
    }));
    res.json({ requests });
  } catch (err) {
    next(err);
  }
}

// Make one CSV cell safe:
//  - wrap in quotes and double any quotes inside
//  - if it starts with = + - @ , Excel could run it as a formula ("CSV injection"),
//    so we put a ' in front to force it to be plain text.
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// GET /api/admin/requests/export   -> the same report as a CSV file (opens in Excel)
async function exportRequests(req, res, next) {
  try {
    const rows = await reportModel.listRequests(readFilters(req.query));
    const header = ['Request', 'Course', 'Section', 'Term', 'Department', 'Lecturer', 'Student ID',
      'Current grade', 'New grade', 'Reason', 'Status', 'Submitted', 'Last activity'];
    const lines = rows.map((r) => [
      r.request_number, r.course_code, r.section, r.term, r.department_name, r.lecturer_name, r.student_number,
      r.current_grade, r.new_grade, r.reason, r.status,
      new Date(r.created_at).toISOString().slice(0, 10),
      r.last_activity ? new Date(r.last_activity).toISOString().slice(0, 10) : '',
    ].map(csvCell).join(','));
    const csv = '﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n'); // ﻿ helps Excel read UTF-8

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="changetrack-requests-${today}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = { getOverview, listRequests, exportRequests, csvCell };
