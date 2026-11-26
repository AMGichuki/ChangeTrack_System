// MODEL: grade change requests, their evidence and their approval history.
//
// Functions that WRITE take a "client" as the first argument. The controller
// passes a transaction client, so the request, its evidence and its first
// history entry are saved together, or not at all.
const db = require('../config/db');
const { OPEN_STATUSES } = require('../config/rules');

// ---------- Writing (inside a transaction) ----------

async function insertRequest(client, r) {
  const { rows } = await client.query(
    `INSERT INTO requests (lecturer_id, student_id, department_id, course_code, section, term,
                           current_grade, new_grade, reason, justification, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'WITH_CHAIR')
     RETURNING id, request_number, status, created_at`,
    [r.lecturerId, r.studentId, r.departmentId, r.courseCode, r.section, r.term,
     r.currentGrade, r.newGrade, r.reason, r.justification]
  );
  return rows[0];
}

async function insertEvidence(client, requestId, fileName, filePath) {
  await client.query(
    'INSERT INTO evidence (request_id, file_name, file_path) VALUES ($1, $2, $3)',
    [requestId, fileName, filePath]
  );
}

// Save the corrected details of a RETURNED request and send it back to the Chair.
// Only works if it is still RETURNED (protects against double clicks).
async function updateReturnedRequest(client, id, r) {
  const result = await client.query(
    `UPDATE requests
        SET student_id = $2, course_code = $3, section = $4, term = $5,
            current_grade = $6, new_grade = $7, reason = $8, justification = $9,
            department_id = $10, status = 'WITH_CHAIR'
      WHERE id = $1 AND status = 'RETURNED'`,
    [id, r.studentId, r.courseCode, r.section, r.term,
     r.currentGrade, r.newGrade, r.reason, r.justification, r.departmentId]
  );
  return result.rowCount === 1;
}

// Remove some evidence rows of a request. Returns what was removed (to delete the files too).
async function deleteEvidence(client, requestId, evidenceIds) {
  if (evidenceIds.length === 0) return [];
  const { rows } = await client.query(
    `DELETE FROM evidence WHERE request_id = $1 AND id = ANY($2::int[])
     RETURNING id, file_name, file_path`,
    [requestId, evidenceIds]
  );
  return rows;
}

async function insertApproval(client, { requestId, approverId, stage, decision, comment = null, actingForId = null }) {
  await client.query(
    `INSERT INTO approvals (request_id, approver_id, stage, decision, comment, acting_for_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [requestId, approverId, stage, decision, comment, actingForId]
  );
}

// ---------- Reading ----------

// Is there already an unfinished request for this student, course and term?
// "exceptId" ignores the request being edited.
async function findOpenDuplicate(studentId, courseCode, term, exceptId = null) {
  const { rows } = await db.query(
    `SELECT request_number FROM requests
      WHERE student_id = $1 AND upper(course_code) = upper($2) AND term = $3
        AND status = ANY($4) AND ($5::int IS NULL OR id <> $5)
      LIMIT 1`,
    [studentId, courseCode, term, OPEN_STATUSES, exceptId]
  );
  return rows[0] || null;
}

// The lecturer's own requests for "My requests", newest first.
// For each one we also fetch the LAST decision, so a returned request
// can show who returned it and why.
async function listForLecturer(lecturerId, { search, status } = {}) {
  const params = [lecturerId];
  let filters = '';
  if (search) {
    params.push(`%${search}%`);
    filters += ` AND (r.request_number ILIKE $${params.length} OR r.course_code ILIKE $${params.length}
                      OR s.student_number ILIKE $${params.length})`;
  }
  if (status) {
    params.push(status);
    filters += ` AND r.status = $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT r.id, r.request_number, r.course_code, r.section, r.term,
            r.current_grade, r.new_grade, r.reason, r.status, r.created_at,
            s.student_number,
            last.stage AS last_stage, last.decision AS last_decision,
            last.comment AS last_comment, last.decided_at AS last_decided_at
       FROM requests r
       JOIN students s ON s.id = r.student_id
       LEFT JOIN LATERAL (
            SELECT a.stage, a.decision, a.comment, a.decided_at
              FROM approvals a
             WHERE a.request_id = r.id
             ORDER BY a.decided_at DESC, a.id DESC
             LIMIT 1
       ) last ON TRUE
      WHERE r.lecturer_id = $1 ${filters}
      ORDER BY r.created_at DESC, r.id DESC`,
    params
  );
  return rows;
}

// Numbers for the four cards at the top of "My requests".
async function countsForLecturer(lecturerId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status IN ('WITH_CHAIR', 'WITH_DEAN', 'WITH_REGISTRAR'))::int AS awaiting,
            count(*) FILTER (WHERE status = 'RETURNED')::int AS returned,
            count(*) FILTER (WHERE status = 'POSTED')::int AS posted
       FROM requests
      WHERE lecturer_id = $1`,
    [lecturerId]
  );
  return rows[0];
}

// ---------- One request in detail ----------

async function findById(id) {
  const { rows } = await db.query(
    `SELECT r.id, r.request_number, r.course_code, r.section, r.term,
            r.current_grade, r.new_grade, r.reason, r.justification, r.status, r.created_at,
            r.lecturer_id, l.full_name AS lecturer_name,
            r.department_id, d.name AS department_name,
            s.student_number, s.full_name AS student_name
       FROM requests r
       JOIN users l       ON l.id = r.lecturer_id
       JOIN departments d ON d.id = r.department_id
       JOIN students s    ON s.id = r.student_id
      WHERE r.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function listEvidence(requestId) {
  const { rows } = await db.query(
    'SELECT id, file_name, uploaded_at FROM evidence WHERE request_id = $1 ORDER BY id',
    [requestId]
  );
  return rows;
}

async function findEvidence(requestId, evidenceId) {
  const { rows } = await db.query(
    'SELECT id, file_name, file_path FROM evidence WHERE request_id = $1 AND id = $2',
    [requestId, evidenceId]
  );
  return rows[0] || null;
}

// The full approval history (oldest first), with who decided.
async function listHistory(requestId) {
  const { rows } = await db.query(
    `SELECT a.id, a.stage, a.decision, a.comment, a.decided_at, u.full_name AS decided_by,
            af.full_name AS acting_for
       FROM approvals a
       JOIN users u ON u.id = a.approver_id
       LEFT JOIN users af ON af.id = a.acting_for_id
      WHERE a.request_id = $1
      ORDER BY a.decided_at, a.id`,
    [requestId]
  );
  return rows;
}

// ---------- Approver queues ----------

// Requests waiting at one stage. "waiting_since" = time of the last decision,
// i.e. when it arrived in this queue. Oldest first, so nothing is forgotten.
async function listQueue({ status, departmentId = null }) {
  const { rows } = await db.query(
    `SELECT r.id, r.request_number, r.course_code, r.section, r.term, r.created_at,
            s.student_number, d.name AS department_name,
            (SELECT max(a.decided_at) FROM approvals a WHERE a.request_id = r.id) AS waiting_since
       FROM requests r
       JOIN departments d ON d.id = r.department_id
       JOIN students s    ON s.id = r.student_id
      WHERE r.status = $1
        AND ($2::int IS NULL OR r.department_id = $2)
      ORDER BY waiting_since ASC, r.id ASC`,
    [status, departmentId]
  );
  return rows;
}

// Requests this approver has decided on, newest first (their "Request history").
async function listDecidedBy(approverId) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (r.id)
            r.id, r.request_number, r.course_code, r.section, r.status,
            s.student_number, a.decision AS my_decision, a.decided_at AS my_decided_at
       FROM approvals a
       JOIN requests r ON r.id = a.request_id
       JOIN students s ON s.id = r.student_id
      WHERE a.approver_id = $1 AND a.stage <> 'LECTURER'
      ORDER BY r.id, a.decided_at DESC`,
    [approverId]
  );
  return rows.sort((x, y) => new Date(y.my_decided_at) - new Date(x.my_decided_at));
}

// Has this person already APPROVED this request since it was last (re)submitted?
// Stops one person approving at two stages (e.g. later as an acting approver).
async function hasApprovedThisRound(requestId, approverId) {
  const { rows } = await db.query(
    `SELECT 1 FROM approvals a
      WHERE a.request_id = $1 AND a.approver_id = $2 AND a.decision = 'APPROVED'
        AND a.decided_at >= COALESCE(
              (SELECT max(decided_at) FROM approvals
                WHERE request_id = $1 AND decision IN ('SUBMITTED', 'RESUBMITTED')), '-infinity')
      LIMIT 1`,
    [requestId, approverId]
  );
  return rows.length > 0;
}

// Change the status ONLY if it is still what we expect. If two people click at
// the same moment, only the first one wins; the second gets 0 rows back.
async function moveStatus(client, id, fromStatus, toStatus) {
  const result = await client.query(
    'UPDATE requests SET status = $3 WHERE id = $1 AND status = $2',
    [id, fromStatus, toStatus]
  );
  return result.rowCount === 1;
}

// ---------- Student tracker ----------

// A student's own requests (only the fields the tracker needs), newest first.
async function listForStudent(studentId) {
  const { rows } = await db.query(
    `SELECT id, request_number, course_code, section, term, status, created_at
       FROM requests WHERE student_id = $1
      ORDER BY created_at DESC, id DESC`,
    [studentId]
  );
  return rows;
}

// Stage, decision and date for several requests at once (no names, no comments).
async function listProgressFor(requestIds) {
  if (requestIds.length === 0) return {};
  const { rows } = await db.query(
    `SELECT request_id, stage, decision, decided_at
       FROM approvals WHERE request_id = ANY($1::int[])
      ORDER BY decided_at, id`,
    [requestIds]
  );
  const byRequest = {};
  rows.forEach((r) => { (byRequest[r.request_id] ||= []).push(r); });
  return byRequest;
}

// ---------- Reminders ----------

// Requests waiting at an approver stage, with when they arrived there.
async function listWaitingForReminders() {
  const { rows } = await db.query(
    `SELECT r.id, r.request_number, r.course_code, r.status, r.department_id,
            r.reminded_at, r.escalated_at,
            (SELECT max(a.decided_at) FROM approvals a WHERE a.request_id = r.id) AS waiting_since
       FROM requests r
      WHERE r.status IN ('WITH_CHAIR', 'WITH_DEAN', 'WITH_REGISTRAR')`
  );
  return rows;
}

// "Claim" a reminder before sending it: sets the time ONLY if no reminder was
// sent since the request arrived at this stage. Returns true if we may send.
// (column is one of two fixed names chosen in our code, never user input)
async function claimReminder(id, column, waitingSince) {
  if (!['reminded_at', 'escalated_at'].includes(column)) throw new Error('Bad reminder column');
  const result = await db.query(
    `UPDATE requests SET ${column} = now()
      WHERE id = $1 AND (${column} IS NULL OR ${column} < $2)`,
    [id, waitingSince]
  );
  return result.rowCount === 1;
}

async function getSettings() {
  const { rows } = await db.query('SELECT approver_reminder_days, admin_escalation_days FROM settings WHERE id = 1');
  return rows[0] || { approver_reminder_days: 3, admin_escalation_days: 5 };
}

module.exports = {
  insertRequest,
  insertEvidence,
  updateReturnedRequest,
  deleteEvidence,
  insertApproval,
  findOpenDuplicate,
  listForLecturer,
  countsForLecturer,
  findById,
  listEvidence,
  findEvidence,
  listHistory,
  listQueue,
  listDecidedBy,
  hasApprovedThisRound,
  moveStatus,
  listForStudent,
  listProgressFor,
  listWaitingForReminders,
  claimReminder,
  getSettings,
};
