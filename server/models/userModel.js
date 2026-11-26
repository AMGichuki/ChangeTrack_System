// MODEL: reads and writes people (staff and students) in the database.
const db = require('../config/db');

const STAFF_COLUMNS = `
  u.id, u.full_name, u.email, u.role, u.is_active,
  u.department_id, d.name AS department_name,
  u.job_title_id, jt.name AS job_title`;

// Find the ChangeTrack profile that belongs to a Supabase login.
// Staff are in USERS, students are in STUDENTS. Returns null if none.
async function findProfileByAuthId(authId) {
  const staff = await db.query(
    `SELECT ${STAFF_COLUMNS}
       FROM users u
       JOIN departments d ON d.id = u.department_id
       LEFT JOIN job_titles jt ON jt.id = u.job_title_id
      WHERE u.auth_id = $1`,
    [authId]
  );
  if (staff.rows[0]) return staff.rows[0];

  const student = await db.query(
    `SELECT id, full_name, email, student_number,
            'STUDENT' AS role, TRUE AS is_active
       FROM students
      WHERE auth_id = $1`,
    [authId]
  );
  return student.rows[0] || null;
}

// ---------- Staff (USERS table) ----------

// List staff, with optional search (name or email) and role filter.
async function listStaff({ search, role } = {}) {
  const conditions = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  if (role) {
    params.push(role);
    conditions.push(`u.role = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT ${STAFF_COLUMNS}
       FROM users u
       JOIN departments d ON d.id = u.department_id
       LEFT JOIN job_titles jt ON jt.id = u.job_title_id
       ${where}
      ORDER BY u.is_active DESC, u.full_name`,
    params
  );
  return rows;
}

async function findStaffById(id) {
  const { rows } = await db.query(
    `SELECT ${STAFF_COLUMNS}, u.auth_id
       FROM users u
       JOIN departments d ON d.id = u.department_id
       LEFT JOIN job_titles jt ON jt.id = u.job_title_id
      WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function createStaff({ authId, fullName, email, role, departmentId, jobTitleId }) {
  const { rows } = await db.query(
    `INSERT INTO users (auth_id, full_name, email, role, department_id, job_title_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [authId, fullName, email, role, departmentId, jobTitleId]
  );
  return findStaffById(rows[0].id);
}

async function updateStaff(id, { fullName, email, role, departmentId, isActive, jobTitleId }) {
  await db.query(
    `UPDATE users
        SET full_name = $2, email = $3, role = $4, department_id = $5, is_active = $6, job_title_id = $7
      WHERE id = $1`,
    [id, fullName, email, role, departmentId, isActive, jobTitleId]
  );
  return findStaffById(id);
}

// ---------- Shared ----------

// Is this email already used by any staff member or student?
// "exceptTable/exceptId" lets us ignore the person we are editing.
async function emailInUse(email, exceptTable = null, exceptId = null) {
  const { rows } = await db.query(
    `SELECT 1 FROM users    WHERE lower(email) = lower($1) AND NOT ($2 = 'users'    AND id = $3)
     UNION ALL
     SELECT 1 FROM students WHERE lower(email) = lower($1) AND NOT ($2 = 'students' AND id = $3)
     LIMIT 1`,
    [email, exceptTable || '', exceptId || 0]
  );
  return rows.length > 0;
}

// For "Forgot password": is there an ACTIVE account (staff or student) with a
// login for this email? Switched-off staff cannot reset their way back in.
async function findActiveLoginByEmail(email) {
  const { rows } = await db.query(
    `SELECT auth_id, email FROM users
      WHERE lower(email) = lower($1) AND is_active AND auth_id IS NOT NULL
     UNION ALL
     SELECT auth_id, email FROM students
      WHERE lower(email) = lower($1) AND auth_id IS NOT NULL
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

// Emails of active staff with a role (optionally in one department).
// Used to notify the next approver.
async function listActiveEmailsByRole(role, departmentId = null) {
  const { rows } = await db.query(
    `SELECT email FROM users
      WHERE role = $1 AND is_active AND ($2::int IS NULL OR department_id = $2)`,
    [role, departmentId]
  );
  return rows.map((r) => r.email);
}

async function findEmailById(id) {
  const { rows } = await db.query('SELECT email FROM users WHERE id = $1', [id]);
  return rows[0]?.email || null;
}

// How many grade change records is this staff member part of?
// (requests they wrote, decisions they made, or decisions made in their place)
async function countHistory(id) {
  const { rows } = await db.query(
    `SELECT (SELECT count(*) FROM requests  WHERE lecturer_id = $1)
          + (SELECT count(*) FROM approvals WHERE approver_id = $1 OR acting_for_id = $1) AS total`,
    [id]
  );
  return Number(rows[0].total);
}

// Delete a staff member (only used when they have no history). Runs inside a transaction.
async function deleteStaff(client, id) {
  await client.query('DELETE FROM delegations WHERE approver_id = $1 OR delegate_id = $1', [id]);
  const { rowCount } = await client.query('DELETE FROM users WHERE id = $1', [id]);
  return rowCount === 1;
}

// Link a new Supabase login to a staff member who had none.
async function setAuthId(id, authId) {
  await db.query('UPDATE users SET auth_id = $2 WHERE id = $1', [id, authId]);
}

module.exports = {
  countHistory,
  deleteStaff,
  setAuthId,
  findProfileByAuthId,
  findActiveLoginByEmail,
  listActiveEmailsByRole,
  findEmailById,
  listStaff,
  findStaffById,
  createStaff,
  updateStaff,
  emailInUse,
};
