// MODEL: numbers and lists for the Admin "System overview" (wireframe page 9).
const db = require('../config/db');

// The four cards at the top.
async function getCounts() {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status IN ('WITH_CHAIR', 'WITH_DEAN', 'WITH_REGISTRAR'))::int AS in_review,
            count(*) FILTER (WHERE status = 'POSTED')::int AS posted,
            count(*) FILTER (WHERE status IN ('RETURNED', 'REJECTED'))::int AS returned_rejected
       FROM requests`
  );
  return rows[0];
}

// "Requests by department" (the department each request is for), biggest first.
async function countByDepartment() {
  const { rows } = await db.query(
    `SELECT d.id, d.name, count(*)::int AS count
       FROM requests r
       JOIN departments d ON d.id = r.department_id
      GROUP BY d.id, d.name
      ORDER BY count DESC, d.name`
  );
  return rows;
}

// "Requests by reason".
async function countByReason() {
  const { rows } = await db.query('SELECT reason, count(*)::int AS count FROM requests GROUP BY reason');
  return rows;
}

// The report table (and the CSV export), with optional filters.
async function listRequests({ search, departmentId, status } = {}) {
  const params = [];
  const where = [];
  if (search) {
    params.push(`%${search}%`);
    where.push(`(r.request_number ILIKE $${params.length} OR r.course_code ILIKE $${params.length}
                 OR s.student_number ILIKE $${params.length})`);
  }
  if (departmentId) {
    params.push(departmentId);
    where.push(`r.department_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`r.status = $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT r.id, r.request_number, r.course_code, r.section, r.term,
            r.current_grade, r.new_grade, r.reason, r.status, r.created_at,
            d.name AS department_name, l.full_name AS lecturer_name, s.student_number,
            (SELECT max(a.decided_at) FROM approvals a WHERE a.request_id = r.id) AS last_activity
       FROM requests r
       JOIN users l       ON l.id = r.lecturer_id
       JOIN departments d ON d.id = r.department_id
       JOIN students s    ON s.id = r.student_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.created_at DESC, r.id DESC`,
    params
  );
  return rows;
}

module.exports = { getCounts, countByDepartment, countByReason, listRequests };
