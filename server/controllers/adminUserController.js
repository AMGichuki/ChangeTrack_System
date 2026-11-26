// CONTROLLER: Admin "Manage users" screen (wireframe page 10).
// Admin creates staff and student accounts (with a password the Admin chooses),
// keeps emails up to date, can set a new password, and can delete accounts.
// Users never register themselves.
//
// PASSWORDS: we send them straight to Supabase Auth, which stores only a
// scrambled (hashed) form. No screen and no API ever shows a password.
const db = require('../config/db');
const { supabase } = require('../config/supabase');
const { checkPasswordRule } = require('./authController');
const userModel = require('../models/userModel');
const studentModel = require('../models/studentModel');
const departmentModel = require('../models/departmentModel');
const jobTitleModel = require('../models/jobTitleModel');
const { runReminders } = require('../services/reminderService');

const STAFF_ROLES = ['LECTURER', 'CHAIR', 'DEAN', 'REGISTRAR', 'ADMIN'];
// These roles work INSIDE one academic department (the Registrar and Admin work in offices).
const ACADEMIC_ROLES = ['LECTURER', 'CHAIR', 'DEAN'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Send a 400 "please fix this" reply.
function badRequest(res, message) {
  return res.status(400).json({ status: 'error', message });
}

// Student IDs are numbers only, e.g. 102341 (any length up to 20 digits).
const STUDENT_NUMBER_PATTERN = /^\d{1,20}$/;

// Delete a Supabase login. "User not found" is fine (already gone).
async function deleteLogin(authId) {
  if (!authId) return;
  const { error } = await supabase.auth.admin.deleteUser(authId);
  if (error && error.status !== 404) throw error;
}

// Give someone a new password. If they have no login yet, create one.
// person = { auth_id, email, full_name }; linkLogin(authId) saves a new auth_id.
async function setPassword(res, person, password, linkLogin) {
  const problem = checkPasswordRule(password);
  if (problem) return badRequest(res, problem);
  if (person.auth_id) {
    const { error } = await supabase.auth.admin.updateUserById(person.auth_id, { password });
    if (error) throw error;
  } else {
    const login = await createLogin(person.email, password);
    if (login.error) return badRequest(res, login.error);
    await linkLogin(login.authId);
  }
  res.json({ status: 'ok', message: `New password set for ${person.full_name}.` });
}

// Delete a person only if they have no grade change records.
// remove(client) deletes the database row; then the login is deleted.
// If deleting the login fails, the database change is undone.
async function deletePerson(res, person, historyCount, remove) {
  if (historyCount > 0) {
    return res.status(409).json({
      status: 'error',
      message: `${person.full_name} is part of ${historyCount} grade change record(s). These are kept as the official history, so this account cannot be deleted. Switch the account off instead.`,
    });
  }
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await remove(client);
    await deleteLogin(person.auth_id);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  res.json({ status: 'ok', message: `${person.full_name} was deleted.` });
}

// Clean and check the staff form. Returns { data } or { error }.
async function readStaffForm(body) {
  const data = {
    fullName: String(body.full_name || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    role: String(body.role || '').trim().toUpperCase(),
    departmentId: Number(body.department_id),
    jobTitleId: null,
  };
  if (data.fullName.length < 3) return { error: 'Enter the full name.' };
  if (!EMAIL_PATTERN.test(data.email)) return { error: 'Enter a valid email address.' };

  // The Admin picks a job title; its powers (base_role) become the person's role.
  // (If only a role is sent, the built-in title of that role is used.)
  if (body.job_title_id) {
    const title = await jobTitleModel.findJobTitle(Number(body.job_title_id));
    if (!title) return { error: 'Choose a role.' };
    data.role = title.base_role;
    data.jobTitleId = title.id;
  } else {
    if (!STAFF_ROLES.includes(data.role)) return { error: 'Choose a role.' };
    data.jobTitleId = (await jobTitleModel.findBuiltinFor(data.role))?.id ?? null;
  }
  const department = await departmentModel.findDepartment(data.departmentId);
  if (!department) return { error: 'Choose a department.' };
  if (ACADEMIC_ROLES.includes(data.role) && !department.is_academic) {
    return { error: `${department.name} is an office, not an academic department. Lecturers, Chairs and Deans must belong to an academic department.` };
  }
  return { data };
}

// A student's department must be an academic department. Returns { id } or { error }.
async function readStudentDepartment(value) {
  const department = await departmentModel.findDepartment(Number(value));
  if (!department || !department.is_academic) return { error: "Choose the student's department." };
  return { id: department.id };
}

// Create a Supabase login. Returns { authId } or { error }.
async function createLogin(email, password) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    if (error.code === 'email_exists') return { error: 'A login with this email already exists.' };
    throw error;
  }
  return { authId: data.user.id };
}

// ---------------- Staff ----------------

// GET /api/admin/users?search=&role=
async function listStaff(req, res, next) {
  try {
    const search = String(req.query.search || '').trim();
    const role = String(req.query.role || '').trim().toUpperCase();
    const users = await userModel.listStaff({
      search,
      role: STAFF_ROLES.includes(role) ? role : '',
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/users
async function createStaff(req, res, next) {
  try {
    const { data, error } = await readStaffForm(req.body);
    if (error) return badRequest(res, error);
    const passwordProblem = checkPasswordRule(req.body.password);
    if (passwordProblem) return badRequest(res, passwordProblem);
    if (await userModel.emailInUse(data.email)) return badRequest(res, 'This email is already used by another account.');

    const login = await createLogin(data.email, req.body.password);
    if (login.error) return badRequest(res, login.error);

    let user;
    try {
      user = await userModel.createStaff({ ...data, authId: login.authId });
    } catch (dbErr) {
      // Saving to our table failed: remove the login too, so nothing is left half-made.
      await supabase.auth.admin.deleteUser(login.authId).catch(() => {});
      throw dbErr;
    }
    delete user.auth_id;
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/users/:id
async function updateStaff(req, res, next) {
  try {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await userModel.findStaffById(id) : null;
    if (!existing) return res.status(404).json({ status: 'error', message: 'User not found.' });

    const { data, error } = await readStaffForm(req.body);
    if (error) return badRequest(res, error);
    data.isActive = req.body.is_active !== false;

    // The Admin must not lock themselves out.
    if (id === req.user.id && (data.role !== 'ADMIN' || !data.isActive)) {
      return badRequest(res, 'You cannot remove your own admin access.');
    }
    if (await userModel.emailInUse(data.email, 'users', id)) {
      return badRequest(res, 'This email is already used by another account.');
    }

    // If the email changed, change the login email too.
    const emailChanged = data.email !== existing.email;
    if (emailChanged && existing.auth_id) {
      const { error: authErr } = await supabase.auth.admin.updateUserById(existing.auth_id, {
        email: data.email,
        email_confirm: true,
      });
      if (authErr) return badRequest(res, 'Could not change the login email: ' + authErr.message);
    }

    const user = await userModel.updateStaff(id, data);
    delete user.auth_id;
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/users/:id/password   { password }
async function setStaffPassword(req, res, next) {
  try {
    const id = Number(req.params.id);
    const person = Number.isInteger(id) ? await userModel.findStaffById(id) : null;
    if (!person) return res.status(404).json({ status: 'error', message: 'User not found.' });
    await setPassword(res, person, req.body.password, (authId) => userModel.setAuthId(id, authId));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/users/:id
async function deleteStaff(req, res, next) {
  try {
    const id = Number(req.params.id);
    const person = Number.isInteger(id) ? await userModel.findStaffById(id) : null;
    if (!person) return res.status(404).json({ status: 'error', message: 'User not found.' });
    if (id === req.user.id) return badRequest(res, 'You cannot delete your own account.');
    await deletePerson(res, person, await userModel.countHistory(id), (client) => userModel.deleteStaff(client, id));
  } catch (err) {
    next(err);
  }
}

// ---------------- Students ----------------

// GET /api/admin/students?search=
async function listStudents(req, res, next) {
  try {
    const students = await studentModel.listStudents({ search: String(req.query.search || '').trim() });
    res.json({ students });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/students
async function createStudent(req, res, next) {
  try {
    const studentNumber = String(req.body.student_number || '').trim();
    const fullName = String(req.body.full_name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!STUDENT_NUMBER_PATTERN.test(studentNumber)) return badRequest(res, 'Enter the student ID using numbers only, e.g. 102341.');
    if (fullName.length < 3) return badRequest(res, 'Enter the full name.');
    if (!EMAIL_PATTERN.test(email)) return badRequest(res, 'Enter a valid email address.');
    const department = await readStudentDepartment(req.body.department_id);
    if (department.error) return badRequest(res, department.error);
    const passwordProblem = checkPasswordRule(req.body.password);
    if (passwordProblem) return badRequest(res, passwordProblem);
    if (await studentModel.studentNumberExists(studentNumber)) return badRequest(res, 'This student ID already exists.');
    if (await userModel.emailInUse(email)) return badRequest(res, 'This email is already used by another account.');

    const login = await createLogin(email, req.body.password);
    if (login.error) return badRequest(res, login.error);

    let student;
    try {
      student = await studentModel.createStudent({ authId: login.authId, studentNumber, fullName, email, departmentId: department.id });
    } catch (dbErr) {
      await supabase.auth.admin.deleteUser(login.authId).catch(() => {});
      throw dbErr;
    }
    delete student.auth_id;
    res.status(201).json({ student });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/students/:id   (student ID, name, email, department)
async function updateStudent(req, res, next) {
  try {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await studentModel.findStudentById(id) : null;
    if (!existing) return res.status(404).json({ status: 'error', message: 'Student not found.' });

    const studentNumber = String(req.body.student_number ?? existing.student_number).trim();
    const fullName = String(req.body.full_name ?? existing.full_name).trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!STUDENT_NUMBER_PATTERN.test(studentNumber)) return badRequest(res, 'Enter the student ID using numbers only, e.g. 102341.');
    if (await studentModel.studentNumberExists(studentNumber, id)) return badRequest(res, 'Another student already has this student ID.');
    if (fullName.length < 3) return badRequest(res, 'Enter the full name.');
    if (!EMAIL_PATTERN.test(email)) return badRequest(res, 'Enter a valid email address.');
    const department = await readStudentDepartment(req.body.department_id ?? existing.department_id);
    if (department.error) return badRequest(res, department.error);
    if (await userModel.emailInUse(email, 'students', id)) {
      return badRequest(res, 'This email is already used by another account.');
    }

    if (email !== existing.email && existing.auth_id) {
      const { error: authErr } = await supabase.auth.admin.updateUserById(existing.auth_id, {
        email,
        email_confirm: true,
      });
      if (authErr) return badRequest(res, 'Could not change the login email: ' + authErr.message);
    }

    const student = await studentModel.updateStudent(id, { studentNumber, fullName, email, departmentId: department.id });
    delete student.auth_id;
    res.json({ student });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/students/:id/password   { password }
async function setStudentPassword(req, res, next) {
  try {
    const id = Number(req.params.id);
    const person = Number.isInteger(id) ? await studentModel.findStudentById(id) : null;
    if (!person) return res.status(404).json({ status: 'error', message: 'Student not found.' });
    await setPassword(res, person, req.body.password, (authId) => studentModel.setAuthId(id, authId));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/students/:id
async function deleteStudent(req, res, next) {
  try {
    const id = Number(req.params.id);
    const person = Number.isInteger(id) ? await studentModel.findStudentById(id) : null;
    if (!person) return res.status(404).json({ status: 'error', message: 'Student not found.' });
    await deletePerson(res, person, await studentModel.countRequests(id), (client) => studentModel.deleteStudent(client, id));
  } catch (err) {
    next(err);
  }
}

// ---------------- Job titles ("roles") ----------------

// GET /api/admin/job-titles
async function listJobTitles(req, res, next) {
  try {
    res.json({ jobTitles: await jobTitleModel.listJobTitles() });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/job-titles   { name, base_role }
async function createJobTitle(req, res, next) {
  try {
    const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
    const baseRole = String(req.body.base_role || '').toUpperCase();
    if (name.length < 2 || name.length > 60) return badRequest(res, 'Enter the role name (2 to 60 characters).');
    if (!STAFF_ROLES.includes(baseRole)) return badRequest(res, 'Choose what this role can do.');
    if (await jobTitleModel.nameInUse(name)) return badRequest(res, 'A role with this name already exists.');
    res.status(201).json({ jobTitle: await jobTitleModel.createJobTitle(name, baseRole) });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/job-titles/:id   (only if not built in and nobody has it)
async function removeJobTitle(req, res, next) {
  try {
    const id = Number(req.params.id);
    const title = await jobTitleModel.findJobTitle(id);
    if (!title) return res.status(404).json({ status: 'error', message: 'Role not found.' });
    if (title.is_builtin) return badRequest(res, 'Built-in roles cannot be removed.');
    if (!(await jobTitleModel.removeJobTitle(id))) {
      return res.status(409).json({ status: 'error', message: `Some staff still have the role "${title.name}". Give them another role first.` });
    }
    res.json({ status: 'ok', message: `Role "${title.name}" removed.` });
  } catch (err) {
    next(err);
  }
}

// ---------------- Departments ----------------

// GET /api/admin/departments
async function listDepartments(req, res, next) {
  try {
    res.json({ departments: await departmentModel.listDepartments() });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/departments/overview  -> each department with its Chair(s), Dean(s) and counts
async function departmentOverview(req, res, next) {
  try {
    res.json({ departments: await departmentModel.listOverview() });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/departments   { name, is_academic }
async function createDepartment(req, res, next) {
  try {
    const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 80) return badRequest(res, 'Enter the department name (2 to 80 characters).');
    if (await departmentModel.nameInUse(name)) return badRequest(res, 'A department with this name already exists.');
    const department = await departmentModel.createDepartment(name, req.body.is_academic !== false);
    res.status(201).json({ department });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/reminders/run   -> check and send reminders now (normally hourly)
async function runRemindersNow(req, res, next) {
  try {
    res.json(await runReminders());
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listStaff,
  createStaff,
  updateStaff,
  setStaffPassword,
  deleteStaff,
  listStudents,
  createStudent,
  updateStudent,
  setStudentPassword,
  deleteStudent,
  listDepartments,
  listJobTitles,
  createJobTitle,
  removeJobTitle,
  departmentOverview,
  createDepartment,
  runRemindersNow,
};
