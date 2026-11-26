// MODEL: reads and writes students.
const db = require('../config/db');

const COLUMNS = `id, student_number, full_name, email, department_id,
  (SELECT name FROM departments WHERE id = students.department_id) AS department_name,
  (auth_id IS NOT NULL) AS has_login`;

async function listStudents({ search } = {}) {
  const params = [];
  let where = '';
  if (search) {
    params.push(`%${search}%`);
    where = 'WHERE student_number ILIKE $1 OR full_name ILIKE $1 OR email ILIKE $1';
  }
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM students ${where} ORDER BY student_number LIMIT 100`,
    params
  );
  return rows;
}

async function findStudentById(id) {
  const { rows } = await db.query(`SELECT ${COLUMNS}, auth_id FROM students WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Used by the New request form: find a student by their student ID.
async function findByStudentNumber(studentNumber) {
  const { rows } = await db.query(
    `SELECT id, student_number, full_name, department_id,
            (SELECT name FROM departments WHERE id = students.department_id) AS department_name
       FROM students WHERE upper(student_number) = upper($1)`,
    [studentNumber]
  );
  return rows[0] || null;
}

// Used for the "grade posted" email to the student.
async function findEmailByNumber(studentNumber) {
  const { rows } = await db.query('SELECT email FROM students WHERE student_number = $1', [studentNumber]);
  return rows[0]?.email || null;
}

// exceptId: when editing a student, their own ID does not count as "taken".
async function studentNumberExists(studentNumber, exceptId = null) {
  const { rows } = await db.query(
    'SELECT 1 FROM students WHERE upper(student_number) = upper($1) AND ($2::int IS NULL OR id <> $2)',
    [studentNumber, exceptId]
  );
  return rows.length > 0;
}

async function createStudent({ authId, studentNumber, fullName, email, departmentId }) {
  const { rows } = await db.query(
    `INSERT INTO students (auth_id, student_number, full_name, email, department_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [authId, studentNumber, fullName, email, departmentId]
  );
  return findStudentById(rows[0].id);
}

async function updateStudent(id, { studentNumber, fullName, email, departmentId }) {
  await db.query(
    'UPDATE students SET student_number = $2, full_name = $3, email = $4, department_id = $5 WHERE id = $1',
    [id, studentNumber, fullName, email, departmentId]
  );
  return findStudentById(id);
}

// How many grade change requests are about this student?
async function countRequests(id) {
  const { rows } = await db.query('SELECT count(*)::int AS total FROM requests WHERE student_id = $1', [id]);
  return rows[0].total;
}

// Delete a student (only used when they have no requests). Runs inside a transaction.
async function deleteStudent(client, id) {
  const { rowCount } = await client.query('DELETE FROM students WHERE id = $1', [id]);
  return rowCount === 1;
}

// Link a new Supabase login to a student who had none.
async function setAuthId(id, authId) {
  await db.query('UPDATE students SET auth_id = $2 WHERE id = $1', [id, authId]);
}

module.exports = { countRequests, deleteStudent, setAuthId, listStudents, findStudentById, findByStudentNumber, findEmailByNumber, studentNumberExists, createStudent, updateStudent };
