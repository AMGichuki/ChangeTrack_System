// MODEL: departments.
// Academic departments have lecturers, a Chair, a Dean, students and requests.
// Offices (is_academic = false, e.g. Registry, ICT) are where the Registrar and Admin work.
const db = require('../config/db');

async function listDepartments() {
  const { rows } = await db.query('SELECT id, name, is_academic FROM departments ORDER BY name');
  return rows;
}

async function findDepartment(id) {
  if (!Number.isInteger(id)) return null;
  const { rows } = await db.query('SELECT id, name, is_academic FROM departments WHERE id = $1', [id]);
  return rows[0] || null;
}

async function departmentExists(id) {
  return Boolean(await findDepartment(id));
}

async function nameInUse(name) {
  const { rows } = await db.query('SELECT 1 FROM departments WHERE lower(name) = lower($1)', [name]);
  return rows.length > 0;
}

async function createDepartment(name, isAcademic) {
  const { rows } = await db.query(
    'INSERT INTO departments (name, is_academic) VALUES ($1, $2) RETURNING id, name, is_academic',
    [name, isAcademic]
  );
  return rows[0];
}

// For the Admin "Departments" table: who is Chair and Dean of each department,
// and how many lecturers, students and requests it has.
async function listOverview() {
  const { rows } = await db.query(
    `SELECT d.id, d.name, d.is_academic,
            (SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name) FROM users u
              WHERE u.department_id = d.id AND u.role = 'CHAIR' AND u.is_active) AS chairs,
            (SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name) FROM users u
              WHERE u.department_id = d.id AND u.role = 'DEAN' AND u.is_active) AS deans,
            (SELECT count(*)::int FROM users u
              WHERE u.department_id = d.id AND u.role = 'LECTURER' AND u.is_active) AS lecturers,
            (SELECT count(*)::int FROM students s WHERE s.department_id = d.id) AS students,
            (SELECT count(*)::int FROM requests r WHERE r.department_id = d.id) AS requests
       FROM departments d
      ORDER BY d.is_academic DESC, d.name`
  );
  return rows;
}

module.exports = { listDepartments, findDepartment, departmentExists, nameInUse, createDepartment, listOverview };
