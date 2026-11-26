// MODEL: acting approvers (DELEGATIONS table).
// A delegation says: "while <approver> is away, <delegate> may also act for them,
// from start_date to end_date (empty end = until removed)".
const db = require('../config/db');

// "Today" in Kenya time, so a delegation starts and ends at local midnight.
const TODAY = `(now() AT TIME ZONE 'Africa/Nairobi')::date`;
const IS_ACTIVE = `(d.start_date <= ${TODAY} AND (d.end_date IS NULL OR d.end_date >= ${TODAY}))`;

// Who is this person acting for today? Used on every request (middleware).
async function listActingFor(delegateId) {
  const { rows } = await db.query(
    `SELECT a.role, a.department_id, a.id AS approver_id, a.full_name AS approver_name
       FROM delegations d
       JOIN users a ON a.id = d.approver_id
      WHERE d.delegate_id = $1 AND ${IS_ACTIVE}
        AND a.role IN ('CHAIR', 'DEAN', 'REGISTRAR')`,
    [delegateId]
  );
  return rows;
}

// All delegations for the Admin screen, newest first, with a simple state.
async function listAll() {
  const { rows } = await db.query(
    `SELECT d.id, d.start_date::text AS start_date, d.end_date::text AS end_date, d.created_at,
            a.id AS approver_id, a.full_name AS approver_name, a.role AS approver_role, ad.name AS approver_department,
            g.id AS delegate_id, g.full_name AS delegate_name, g.role AS delegate_role,
            CASE WHEN ${IS_ACTIVE} THEN 'ACTIVE'
                 WHEN d.start_date > ${TODAY} THEN 'UPCOMING'
                 ELSE 'ENDED' END AS state
       FROM delegations d
       JOIN users a        ON a.id = d.approver_id
       JOIN departments ad ON ad.id = a.department_id
       JOIN users g        ON g.id = d.delegate_id
      ORDER BY d.created_at DESC, d.id DESC`
  );
  return rows;
}

// Does this approver already have a delegation that overlaps these dates?
async function findOverlap(approverId, startDate, endDate) {
  const { rows } = await db.query(
    `SELECT id FROM delegations
      WHERE approver_id = $1
        AND start_date <= COALESCE($3::date, 'infinity'::date)
        AND COALESCE(end_date, 'infinity'::date) >= $2::date
      LIMIT 1`,
    [approverId, startDate, endDate]
  );
  return rows[0] || null;
}

async function create({ approverId, delegateId, startDate, endDate }) {
  const { rows } = await db.query(
    `INSERT INTO delegations (approver_id, delegate_id, start_date, end_date)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [approverId, delegateId, startDate, endDate]
  );
  return rows[0].id;
}

async function remove(id) {
  const result = await db.query('DELETE FROM delegations WHERE id = $1', [id]);
  return result.rowCount === 1;
}

// Emails of everyone who can act at a stage TODAY: the role holders themselves
// plus anyone acting for them. Used for "needs your review" and reminders.
async function listStageEmails(role, departmentId = null) {
  const { rows } = await db.query(
    `SELECT u.email FROM users u
      WHERE u.role = $1 AND u.is_active AND ($2::int IS NULL OR u.department_id = $2)
     UNION
     SELECT g.email
       FROM delegations d
       JOIN users a ON a.id = d.approver_id
       JOIN users g ON g.id = d.delegate_id
      WHERE a.role = $1 AND ($2::int IS NULL OR a.department_id = $2)
        AND g.is_active AND ${IS_ACTIVE}`,
    [role, departmentId]
  );
  return rows.map((r) => r.email);
}

module.exports = { listActingFor, listAll, findOverlap, create, remove, listStageEmails };
