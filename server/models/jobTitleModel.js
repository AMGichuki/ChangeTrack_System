// MODEL: job titles (the "roles" the Admin can add, e.g. "Head of Department").
// base_role = the POWERS the title gives (one of our 5 system roles).
const db = require('../config/db');

// All titles, with how many staff have each one.
async function listJobTitles() {
  const { rows } = await db.query(
    `SELECT jt.id, jt.name, jt.base_role, jt.is_builtin,
            (SELECT count(*)::int FROM users u WHERE u.job_title_id = jt.id) AS people
       FROM job_titles jt
      ORDER BY CASE jt.base_role WHEN 'LECTURER' THEN 1 WHEN 'CHAIR' THEN 2 WHEN 'DEAN' THEN 3
                                 WHEN 'REGISTRAR' THEN 4 ELSE 5 END,
               jt.is_builtin DESC, jt.name`
  );
  return rows;
}

async function findJobTitle(id) {
  if (!Number.isInteger(id)) return null;
  const { rows } = await db.query('SELECT id, name, base_role, is_builtin FROM job_titles WHERE id = $1', [id]);
  return rows[0] || null;
}

// The built-in title for a system role (used when no title is chosen).
async function findBuiltinFor(role) {
  const { rows } = await db.query('SELECT id, name, base_role FROM job_titles WHERE is_builtin AND base_role = $1', [role]);
  return rows[0] || null;
}

async function nameInUse(name) {
  const { rows } = await db.query('SELECT 1 FROM job_titles WHERE lower(name) = lower($1)', [name]);
  return rows.length > 0;
}

async function createJobTitle(name, baseRole) {
  const { rows } = await db.query(
    'INSERT INTO job_titles (name, base_role) VALUES ($1, $2) RETURNING id, name, base_role, is_builtin',
    [name, baseRole]
  );
  return rows[0];
}

// Only removes a title that is not built in and that nobody has.
async function removeJobTitle(id) {
  const { rowCount } = await db.query(
    `DELETE FROM job_titles
      WHERE id = $1 AND NOT is_builtin
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.job_title_id = $1)`,
    [id]
  );
  return rowCount === 1;
}

module.exports = { listJobTitles, findJobTitle, findBuiltinFor, nameInUse, createJobTitle, removeJobTitle };
