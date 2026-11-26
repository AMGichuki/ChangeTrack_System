// INTEGRATION TESTS: the real API + real database + real Supabase Auth/Storage,
// working together. We start our Express app on a free port and call it like
// the React app would.
//
// Safety:
//  - The test makes its OWN temporary accounts for every role
//    (changetrack.usiu+ittest-...@gmail.com) and its own student, and deletes
//    them at the end. It never signs in as, or changes, real people.
//  - It uses only the made-up course "TST 9999"; those requests are deleted too.
//  - Everything is also cleaned up BEFORE it starts, in case a run was stopped half way.
//  - EMAIL_SILENT=true, so no emails are sent or printed.
//  - Needs the .env file (skipped if it is missing).
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const ENV_FILE = path.join(__dirname, '..', '..', '.env');
const hasEnv = fs.existsSync(ENV_FILE);

process.env.EMAIL_SILENT = 'true';
if (hasEnv) require('dotenv').config({ path: ENV_FILE, quiet: true });

const COURSE = 'TST 9999';
const COURSE2 = 'TST 9998'; // a second test request, for another department
const TEST_DEPARTMENT = 'ItTest Department';
const TEST_PREFIX = 'changetrack.usiu+ittest-';
const testEmail = (key) => `${TEST_PREFIX}${key.toLowerCase()}@gmail.com`;
// A new random password for every run (never written anywhere).
const PASSWORD = `It${crypto.randomBytes(6).toString('hex')}9`;

// Department ids from seed.sql: 1 Science & Technology, 2 Business, 4 Registry, 5 ICT
const STAFF = {
  lecturer: { name: 'ItTest Lecturer', role: 'LECTURER', dept: 1 },
  chair: { name: 'ItTest Chair', role: 'CHAIR', dept: 1 },
  dean: { name: 'ItTest Dean', role: 'DEAN', dept: 1 },
  registrar: { name: 'ItTest Registrar', role: 'REGISTRAR', dept: 4 },
  admin: { name: 'ItTest Admin', role: 'ADMIN', dept: 5 },
  otherLecturer: { name: 'ItTest Lecturer Business', role: 'LECTURER', dept: 2 },
  otherChair: { name: 'ItTest Chair Business', role: 'CHAIR', dept: 2 },
  otherDean: { name: 'ItTest Dean Business', role: 'DEAN', dept: 2 },
};
const STUDENT = '99990002'; // our test student's ID
const STUDENT_NAME = 'ItTest Student';
const EMAIL = { student: testEmail('student-tracker') };
for (const key of Object.keys(STAFF)) EMAIL[key] = testEmail(key);

// Accounts the Admin creates during the "accounts" tests
const TEST_STAFF_EMAIL = testEmail('staff');
const TEST_STUDENT_EMAIL = testEmail('student');
const TEST_STUDENT_NUMBER = '99990001';

describe('ChangeTrack API (integration)', { skip: !hasEnv && 'no .env file' }, () => {
  let server;
  let base;
  let db;
  let supabase;
  let EVIDENCE_BUCKET;
  const token = {};
  const ids = {}; // database id of each test staff account
  let requestId;
  let requestNumber;
  let delegationId;

  // ---------- helpers ----------
  async function api(method, url, { as, json, form } = {}) {
    const headers = {};
    if (as) headers.Authorization = `Bearer ${token[as]}`;
    let body;
    if (json) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) body = form;
    const res = await fetch(base + url, { method, headers, body });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, data, type };
  }

  const term = () => require('../../config/rules').getTerms()[0];
  function requestForm(changes = {}, files = [['evidence.pdf', '%PDF-1.4 test file']]) {
    const fields = {
      department_id: 1, student_number: STUDENT, course_code: COURSE, section: 'A', term: term(),
      current_grade: 'C', new_grade: 'B', reason: 'ARITHMETIC',
      justification: 'Automated test: marks for question 3 were not added.',
      ...changes,
    };
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    for (const [name, content] of files) form.append('evidence', new Blob([content]), name);
    return form;
  }
  const decide = (as, body) => api('POST', `/api/reviews/${requestId}/decision`, { as, json: body });

  async function removeTestData() {
    // 1. Requests for the test course (+ their evidence files)
    const { rows } = await db.query(
      `SELECT e.file_path FROM evidence e JOIN requests r ON r.id = e.request_id WHERE r.course_code IN ($1, $2)`, [COURSE, COURSE2]);
    if (rows.length) await supabase.storage.from(EVIDENCE_BUCKET).remove(rows.map((r) => r.file_path));
    await db.query('DELETE FROM requests WHERE course_code IN ($1, $2)', [COURSE, COURSE2]); // evidence + approvals go too (CASCADE)

    // 2. Test accounts: delegations, rows, and Supabase logins
    const like = `${TEST_PREFIX}%`;
    await db.query(
      `DELETE FROM delegations WHERE approver_id IN (SELECT id FROM users WHERE email LIKE $1)
                                 OR delegate_id IN (SELECT id FROM users WHERE email LIKE $1)`, [like]);
    await db.query('DELETE FROM users WHERE email LIKE $1', [like]);
    await db.query('DELETE FROM students WHERE email LIKE $1 OR student_number IN ($2, $3)', [like, STUDENT, TEST_STUDENT_NUMBER]);
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data?.users || []) {
      if (u.email && u.email.startsWith(TEST_PREFIX)) await supabase.auth.admin.deleteUser(u.id);
    }
    await db.query('DELETE FROM departments WHERE name = $1', [TEST_DEPARTMENT]);
    await db.query("DELETE FROM job_titles WHERE name LIKE 'ItTest%' AND NOT is_builtin");
    await db.query(`SELECT setval('requests_id_seq', COALESCE((SELECT MAX(id) FROM requests), 1))`);
  }

  // Make one test login + its row in USERS or STUDENTS.
  async function makeAccount(email, insertRow) {
    const { data, error } = await supabase.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    return insertRow(data.user.id);
  }

  // ---------- start + finish ----------
  before(async () => {
    db = require('../../config/db');
    ({ supabase, EVIDENCE_BUCKET } = require('../../config/supabase'));
    if (process.env.TEST_BASE_URL) {
      // Test the LIVE site instead of a local copy (set EMAIL_SILENT=true there first).
      base = process.env.TEST_BASE_URL.replace(/\/$/, '');
    } else {
      const app = require('../../app');
      server = app.listen(0);
      await new Promise((resolve) => server.once('listening', resolve));
      base = `http://127.0.0.1:${server.address().port}`;
    }

    await removeTestData();
    for (const [key, p] of Object.entries(STAFF)) {
      ids[key] = await makeAccount(EMAIL[key], async (authId) => (await db.query(
        `INSERT INTO users (auth_id, full_name, email, role, department_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [authId, p.name, EMAIL[key], p.role, p.dept])).rows[0].id);
    }
    await makeAccount(EMAIL.student, (authId) => db.query(
      'INSERT INTO students (auth_id, student_number, full_name, email, department_id) VALUES ($1, $2, $3, $4, 1)',
      [authId, STUDENT, STUDENT_NAME, EMAIL.student]));
  });

  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500)); // let background email jobs finish
    if (db) {
      await removeTestData();
      await db.pool.end();
    }
    if (server) server.close();
  });

  // ---------- 1. Sign in ----------
  test('the API is running', async () => {
    const r = await api('GET', '/api/health');
    assert.equal(r.status, 200);
  });

  test('wrong password and unknown email give the SAME message', async () => {
    const wrong = await api('POST', '/api/auth/login', { json: { email: EMAIL.lecturer, password: 'Wrong12345' } });
    const unknown = await api('POST', '/api/auth/login', { json: { email: 'nobody.changetrack.test@gmail.com', password: 'Wrong12345' } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.data.message, unknown.data.message);
  });

  test('every role can sign in and gets the right role', async () => {
    const expected = { student: 'STUDENT' };
    for (const [key, p] of Object.entries(STAFF)) expected[key] = p.role;
    for (const [name, role] of Object.entries(expected)) {
      const r = await api('POST', '/api/auth/login', { json: { email: EMAIL[name], password: PASSWORD } });
      assert.equal(r.status, 200, `${name} could not sign in`);
      assert.equal(r.data.user.role, role);
      token[name] = r.data.session.access_token;
    }
  });

  // ---------- 2. Role-based access ----------
  test('the daily reminder address refuses anyone without the secret key', async () => {
    assert.equal((await api('GET', '/api/cron/reminders')).status, 401);
    token.fake = 'not-a-real-token';
    assert.equal((await api('GET', '/api/cron/reminders', { as: 'fake' })).status, 401);
  });

  test('no token -> 401; fake token -> 401', async () => {
    assert.equal((await api('GET', '/api/requests/mine')).status, 401);
    token.fake = 'not-a-real-token';
    assert.equal((await api('GET', '/api/requests/mine', { as: 'fake' })).status, 401);
  });

  test('each role is blocked from other roles\' pages (403)', async () => {
    assert.equal((await api('GET', '/api/admin/overview', { as: 'lecturer' })).status, 403, 'lecturer -> admin');
    assert.equal((await api('GET', '/api/reviews/queue', { as: 'lecturer' })).status, 403, 'lecturer -> approver queue');
    assert.equal((await api('GET', '/api/admin/users', { as: 'chair' })).status, 403, 'chair -> manage users');
    assert.equal((await api('GET', '/api/requests/mine', { as: 'student' })).status, 403, 'student -> lecturer page');
    assert.equal((await api('GET', '/api/reviews/queue', { as: 'student' })).status, 403, 'student -> approver queue');
    assert.equal((await api('GET', '/api/student/requests', { as: 'registrar' })).status, 403, 'registrar -> student page');
    assert.equal((await api('GET', '/api/reviews/queue', { as: 'admin' })).status, 403, 'admin cannot approve grades');
  });

  // ---------- 3. New request (validation) ----------
  test('a request with the same current and new grade is refused', async () => {
    const r = await api('POST', '/api/requests', { as: 'lecturer', form: requestForm({ new_grade: 'C' }) });
    assert.equal(r.status, 400);
    assert.match(r.data.message, /different/);
  });

  test('a request without evidence is refused', async () => {
    const r = await api('POST', '/api/requests', { as: 'lecturer', form: requestForm({}, []) });
    assert.equal(r.status, 400);
    assert.match(r.data.message, /supporting document/);
  });

  test('a fake PDF (renamed program) is refused', async () => {
    const r = await api('POST', '/api/requests', { as: 'lecturer', form: requestForm({}, [['evidence.pdf', 'MZ fake program']]) });
    assert.equal(r.status, 400);
    assert.match(r.data.message, /not a real PDF/);
  });

  test('a request must be for an academic department (not an office like Registry)', async () => {
    const r = await api('POST', '/api/requests', { as: 'lecturer', form: requestForm({ department_id: 4 }) });
    assert.equal(r.status, 400);
    assert.match(r.data.message, /department/);
  });

  test('an unknown student ID is refused', async () => {
    const r = await api('POST', '/api/requests', { as: 'lecturer', form: requestForm({ student_number: '999999999' }) });
    assert.equal(r.status, 400);
    assert.match(r.data.message, /Student ID not found/);
  });

  // ---------- 4. The full approval chain ----------
  test('Lecturer submits a valid request -> With Chair, numbered CT-YYYY-NNNN', async () => {
    const r = await api('POST', '/api/requests', { as: 'lecturer', form: requestForm() });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    requestId = r.data.request.id;
    requestNumber = r.data.request.request_number;
    assert.match(requestNumber, /^CT-\d{4}-\d{4}$/);
    assert.equal(r.data.request.status, 'WITH_CHAIR');
  });

  test('a second open request for the same student, course and term is refused', async () => {
    const r = await api('POST', '/api/requests', { as: 'lecturer', form: requestForm() });
    assert.equal(r.status, 400);
    assert.match(r.data.message, /already an open request/);
  });

  test('a lecturer from another department cannot open the request', async () => {
    const r = await api('GET', `/api/requests/${requestId}`, { as: 'otherLecturer' });
    assert.ok([403, 404].includes(r.status), `got ${r.status}`);
  });

  test('the Chair of another department cannot see or decide it', async () => {
    const queue = await api('GET', '/api/reviews/queue', { as: 'otherChair' });
    assert.ok(!queue.data.queue.some((q) => q.id === requestId));
    assert.equal((await decide('otherChair', { decision: 'APPROVE' })).status, 404);
  });

  test('no skipping: the Dean cannot decide before the Chair', async () => {
    assert.equal((await decide('dean', { decision: 'APPROVE' })).status, 409);
  });

  test('the Chair must give a reason to return a request', async () => {
    const r = await decide('chair', { decision: 'RETURN', comment: '' });
    assert.equal(r.status, 400);
  });

  test('the Chair returns it with a comment -> Returned to lecturer', async () => {
    const r = await decide('chair', { decision: 'RETURN', comment: 'Please attach the grade schedule.' });
    assert.equal(r.status, 200);
    assert.equal(r.data.new_status, 'RETURNED');
  });

  test('the Lecturer corrects and resubmits -> back to the Chair, changes recorded', async () => {
    const form = requestForm({ new_grade: 'B+' }, [['grade-schedule.pdf', '%PDF-1.4 schedule']]);
    const r = await api('PUT', `/api/requests/${requestId}/resubmit`, { as: 'lecturer', form });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.new_status, 'WITH_CHAIR');

    const detail = await api('GET', `/api/requests/${requestId}`, { as: 'lecturer' });
    const last = detail.data.history.at(-1);
    assert.equal(last.decision, 'RESUBMITTED');
    assert.match(last.comment, /Proposed grade: B → B\+/);
    assert.match(last.comment, /Added file: grade-schedule.pdf/);
  });

  test('the Chair approves -> With Dean; a double click is refused', async () => {
    const r = await decide('chair', { decision: 'APPROVE' });
    assert.equal(r.status, 200);
    assert.equal(r.data.new_status, 'WITH_DEAN');
    assert.equal((await decide('chair', { decision: 'APPROVE' })).status, 409);
  });

  test('the Dean of another department cannot see or decide it', async () => {
    const queue = await api('GET', '/api/reviews/queue', { as: 'otherDean' });
    assert.equal(queue.status, 200);
    assert.ok(!queue.data.queue.some((q) => q.id === requestId));
    assert.equal((await decide('otherDean', { decision: 'APPROVE' })).status, 404);
    assert.ok([403, 404].includes((await api('GET', `/api/requests/${requestId}`, { as: 'otherDean' })).status));
  });

  test("the Dean of the request's department sees it in their queue", async () => {
    const queue = await api('GET', '/api/reviews/queue', { as: 'dean' });
    assert.ok(queue.data.queue.some((q) => q.id === requestId));
  });

  test("a lecturer can send a request to ANOTHER department: it goes to that department's Chair", async () => {
    const r = await api('POST', '/api/requests', { as: 'lecturer', form: requestForm({ department_id: 2, course_code: COURSE2 }) });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const id = r.data.request.id;
    const businessChair = await api('GET', '/api/reviews/queue', { as: 'otherChair' });
    assert.ok(businessChair.data.queue.some((q) => q.id === id), 'Business Chair sees it');
    const ownChair = await api('GET', '/api/reviews/queue', { as: 'chair' });
    assert.ok(!ownChair.data.queue.some((q) => q.id === id), "the lecturer's own Chair does not");
  });

  // ---------- 5. Acting approver ----------
  test('Admin sets the Chair as acting Dean for today', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const r = await api('POST', '/api/admin/delegations', {
      as: 'admin', json: { approver_id: ids.dean, delegate_id: ids.chair, start_date: today, end_date: today },
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    delegationId = r.data.id;
  });

  test('an Admin can never be an acting approver', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const r = await api('POST', '/api/admin/delegations', {
      as: 'admin', json: { approver_id: ids.registrar, delegate_id: ids.admin, start_date: today },
    });
    assert.equal(r.status, 400);
  });

  test('the acting Dean sees the Dean queue but cannot approve twice in one round', async () => {
    const queue = await api('GET', `/api/reviews/queue?acting_for=${ids.dean}`, { as: 'chair' });
    assert.equal(queue.status, 200);
    assert.ok(queue.data.queue.some((q) => q.id === requestId));

    const r = await decide('chair', { decision: 'APPROVE', acting_for: ids.dean });
    assert.equal(r.status, 403);
    assert.match(r.data.message, /already approved/);
  });

  test('after the delegation is removed, acting access stops at once', async () => {
    assert.equal((await api('DELETE', `/api/admin/delegations/${delegationId}`, { as: 'admin' })).status, 200);
    const queue = await api('GET', `/api/reviews/queue?acting_for=${ids.dean}`, { as: 'chair' });
    assert.equal(queue.status, 403);
  });

  // ---------- 6. Dean, Registrar, PDF ----------
  test('the Dean approves -> With Registrar', async () => {
    const r = await decide('dean', { decision: 'APPROVE' });
    assert.equal(r.status, 200);
    assert.equal(r.data.new_status, 'WITH_REGISTRAR');
  });

  test('the Registrar must tick "verified" before posting', async () => {
    const r = await decide('registrar', { decision: 'POST' });
    assert.equal(r.status, 400);
  });

  test('the Registrar verifies and posts -> Posted', async () => {
    const r = await decide('registrar', { decision: 'POST', verified: true });
    assert.equal(r.status, 200);
    assert.equal(r.data.new_status, 'POSTED');
  });

  test('a posted request cannot be decided again', async () => {
    assert.equal((await decide('registrar', { decision: 'POST', verified: true })).status, 409);
  });

  test('the history shows every step in the fixed order', async () => {
    const r = await api('GET', `/api/requests/${requestId}`, { as: 'admin' });
    const steps = r.data.history.map((h) => `${h.stage}:${h.decision}`);
    assert.deepEqual(steps, [
      'LECTURER:SUBMITTED', 'CHAIR:RETURNED', 'LECTURER:RESUBMITTED',
      'CHAIR:APPROVED', 'DEAN:APPROVED', 'REGISTRAR:POSTED',
    ]);
  });

  test('the Registrar can download the PDF form; the Lecturer cannot', async () => {
    const r = await api('GET', `/api/requests/${requestId}/pdf`, { as: 'registrar' });
    assert.equal(r.status, 200);
    assert.match(r.type, /application\/pdf/);
    assert.equal((await api('GET', `/api/requests/${requestId}/pdf`, { as: 'lecturer' })).status, 403);
  });

  // ---------- 7. Student tracker (privacy) ----------
  test('the student sees the progress but no grades, comments or names', async () => {
    const r = await api('GET', '/api/student/requests', { as: 'student' });
    assert.equal(r.status, 200);
    const mine = r.data.requests.find((x) => x.request_number === requestNumber);
    assert.ok(mine, 'the student can see their request');
    assert.equal(mine.status_text, 'Posted');
    assert.deepEqual(mine.steps.map((s) => s.state), ['done', 'done', 'done', 'done']);

    const text = JSON.stringify(mine);
    for (const secret of ['current_grade', 'new_grade', 'B+', 'justification', 'ItTest Lecturer', 'ItTest Chair', 'grade schedule']) {
      assert.ok(!text.includes(secret), `student view must not include "${secret}"`);
    }
  });

  // ---------- 8. Admin reports and audit ----------
  test('the audit log lists the decisions and exports a safe CSV', async () => {
    const audit = await api('GET', `/api/admin/audit?search=${encodeURIComponent(requestNumber)}`, { as: 'admin' });
    assert.equal(audit.status, 200);
    assert.ok(audit.data.entries.length >= 6);

    const csv = await api('GET', `/api/admin/audit/export?search=${encodeURIComponent(requestNumber)}`, { as: 'admin' });
    assert.equal(csv.status, 200);
    assert.match(csv.type, /text\/csv/);
    assert.ok(csv.data.includes(requestNumber));
  });

  test('the Admin overview cards add up', async () => {
    const r = await api('GET', '/api/admin/overview', { as: 'admin' });
    assert.equal(r.status, 200);
    const { total, in_review, posted, returned_rejected } = r.data.counts;
    assert.ok(posted >= 1, 'our posted test request is counted');
    assert.equal(in_review + posted + returned_rejected, total, 'the four cards add up');
  });
  // ---------- 9. Admin: accounts, passwords, delete ----------
  const login = (email, password) => api('POST', '/api/auth/login', { json: { email, password } });
  let testStaffId;
  let testStudentId;

  test('Admin must give a valid password when creating an account', async () => {
    const body = { full_name: 'Test Staff', email: TEST_STAFF_EMAIL, role: 'LECTURER', department_id: 1, password: 'short' };
    const r = await api('POST', '/api/admin/users', { as: 'admin', json: body });
    assert.equal(r.status, 400);
    assert.match(r.data.message, /at least 8/);
  });

  test('Admin creates a staff account with a chosen password; it is never sent back', async () => {
    const body = { full_name: 'Test Staff', email: TEST_STAFF_EMAIL, role: 'LECTURER', department_id: 1, password: 'FirstPass123' };
    const r = await api('POST', '/api/admin/users', { as: 'admin', json: body });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    testStaffId = r.data.user.id;
    assert.ok(!JSON.stringify(r.data).includes('FirstPass123'), 'password must not be in the reply');
    assert.equal((await login(TEST_STAFF_EMAIL, 'FirstPass123')).status, 200);
  });

  test('Admin sets a new password: the old one stops working, the new one works', async () => {
    const r = await api('PUT', `/api/admin/users/${testStaffId}/password`, { as: 'admin', json: { password: 'SecondPass456' } });
    assert.equal(r.status, 200);
    assert.equal((await login(TEST_STAFF_EMAIL, 'FirstPass123')).status, 401);
    assert.equal((await login(TEST_STAFF_EMAIL, 'SecondPass456')).status, 200);
  });

  test('the staff list never contains passwords', async () => {
    const r = await api('GET', '/api/admin/users', { as: 'admin' });
    const text = JSON.stringify(r.data);
    assert.ok(!/password|SecondPass456|auth_id/i.test(text));
  });

  test('only the Admin can set passwords or delete accounts', async () => {
    assert.equal((await api('PUT', `/api/admin/users/${testStaffId}/password`, { as: 'chair', json: { password: 'Hacked1234' } })).status, 403);
    assert.equal((await api('DELETE', `/api/admin/users/${testStaffId}`, { as: 'lecturer' })).status, 403);
  });

  test('someone with grade change records cannot be deleted (history is kept)', async () => {
    const r = await api('DELETE', `/api/admin/users/${ids.lecturer}`, { as: 'admin' });
    assert.equal(r.status, 409);
    assert.match(r.data.message, /official history/);
  });

  test('the Admin cannot delete their own account', async () => {
    assert.equal((await api('DELETE', `/api/admin/users/${ids.admin}`, { as: 'admin' })).status, 400);
  });

  test('deleting a staff member removes them and their login', async () => {
    const r = await api('DELETE', `/api/admin/users/${testStaffId}`, { as: 'admin' });
    assert.equal(r.status, 200);
    assert.equal((await login(TEST_STAFF_EMAIL, 'SecondPass456')).status, 401);
    const { rows } = await db.query('SELECT 1 FROM users WHERE id = $1', [testStaffId]);
    assert.equal(rows.length, 0);
  });

  test('student IDs must be numbers only', async () => {
    const body = { student_number: 'S-99990001', full_name: 'Test Student', email: TEST_STUDENT_EMAIL, department_id: 1, password: 'StudentPass1' };
    const r = await api('POST', '/api/admin/students', { as: 'admin', json: body });
    assert.equal(r.status, 400);
    assert.match(r.data.message, /numbers only/);
  });

  test('Admin adds a student with a numeric ID and password; the student can sign in', async () => {
    const noDepartment = { student_number: TEST_STUDENT_NUMBER, full_name: 'Test Student', email: TEST_STUDENT_EMAIL, password: 'StudentPass1' };
    assert.equal((await api('POST', '/api/admin/students', { as: 'admin', json: noDepartment })).status, 400, 'department is required');
    const body = { ...noDepartment, department_id: 1 };
    const r = await api('POST', '/api/admin/students', { as: 'admin', json: body });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    testStudentId = r.data.student.id;
    const signIn = await login(TEST_STUDENT_EMAIL, 'StudentPass1');
    assert.equal(signIn.status, 200);
    assert.equal(signIn.data.user.role, 'STUDENT');
  });

  test('Admin edits everything about a student: ID, name, email and department', async () => {
    const body = { student_number: '99990003', full_name: 'Test Student Edited', email: TEST_STUDENT_EMAIL, department_id: 2 };
    const r = await api('PUT', `/api/admin/students/${testStudentId}`, { as: 'admin', json: body });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.student.student_number, '99990003');
    assert.equal(r.data.student.full_name, 'Test Student Edited');
    assert.equal(r.data.student.department_id, 2);
    const taken = await api('PUT', `/api/admin/students/${testStudentId}`, { as: 'admin', json: { ...body, student_number: STUDENT } });
    assert.equal(taken.status, 400, 'another student already has that ID');
    const letters = await api('PUT', `/api/admin/students/${testStudentId}`, { as: 'admin', json: { ...body, student_number: 'S-1' } });
    assert.equal(letters.status, 400, 'numbers only');
  });

  test('Admin sets a student password, then deletes the student', async () => {
    const set = await api('PUT', `/api/admin/students/${testStudentId}/password`, { as: 'admin', json: { password: 'StudentPass2' } });
    assert.equal(set.status, 200);
    assert.equal((await login(TEST_STUDENT_EMAIL, 'StudentPass2')).status, 200);
    assert.equal((await api('DELETE', `/api/admin/students/${testStudentId}`, { as: 'admin' })).status, 200);
    assert.equal((await login(TEST_STUDENT_EMAIL, 'StudentPass2')).status, 401);
  });

  test('a student with grade change requests cannot be deleted', async () => {
    const { rows } = await db.query('SELECT id FROM students WHERE student_number = $1', [STUDENT]);
    assert.equal(rows.length, 1);
    const r = await api('DELETE', `/api/admin/students/${rows[0].id}`, { as: 'admin' });
    assert.equal(r.status, 409);
  });

  // ---------- 10. Departments ----------
  test('a Chair or Dean must belong to an academic department, not an office', async () => {
    const body = { full_name: 'Test Staff', email: TEST_STAFF_EMAIL, role: 'CHAIR', department_id: 4, password: 'FirstPass123' };
    const r = await api('POST', '/api/admin/users', { as: 'admin', json: body });
    assert.equal(r.status, 400);
    assert.match(r.data.message, /academic department/);
  });

  test('the Admin adds a department; it shows with its Chair and Dean missing', async () => {
    const r = await api('POST', '/api/admin/departments', { as: 'admin', json: { name: TEST_DEPARTMENT, is_academic: true } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal((await api('POST', '/api/admin/departments', { as: 'admin', json: { name: TEST_DEPARTMENT.toUpperCase() } })).status, 400, 'no duplicates');
    const overview = await api('GET', '/api/admin/departments/overview', { as: 'admin' });
    const dept = overview.data.departments.find((d) => d.name === TEST_DEPARTMENT);
    assert.ok(dept && dept.is_academic);
    assert.equal(dept.chairs, null);
    assert.equal(dept.deans, null);
  });

  test('only the Admin can add departments', async () => {
    assert.equal((await api('POST', '/api/admin/departments', { as: 'dean', json: { name: 'Nope Department' } })).status, 403);
  });

  // ---------- 11. Roles (job titles) ----------
  let titleId;
  let titledStaffId;

  test('the Admin adds a role (job title) with Chair powers; no duplicates', async () => {
    const r = await api('POST', '/api/admin/job-titles', { as: 'admin', json: { name: 'ItTest Head of Department', base_role: 'CHAIR' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    titleId = r.data.jobTitle.id;
    assert.equal((await api('POST', '/api/admin/job-titles', { as: 'admin', json: { name: 'ittest head of department', base_role: 'DEAN' } })).status, 400);
    assert.equal((await api('POST', '/api/admin/job-titles', { as: 'admin', json: { name: 'ItTest Wizard', base_role: 'WIZARD' } })).status, 400);
    assert.equal((await api('POST', '/api/admin/job-titles', { as: 'dean', json: { name: 'ItTest Nope', base_role: 'ADMIN' } })).status, 403);
  });

  test('staff given that role get Chair powers and show the title', async () => {
    const body = { full_name: 'Test Head', email: TEST_STAFF_EMAIL, job_title_id: titleId, department_id: 2, password: 'FirstPass123' };
    const r = await api('POST', '/api/admin/users', { as: 'admin', json: body });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    titledStaffId = r.data.user.id;
    assert.equal(r.data.user.role, 'CHAIR');
    assert.equal(r.data.user.job_title, 'ItTest Head of Department');
    const signIn = await api('POST', '/api/auth/login', { json: { email: TEST_STAFF_EMAIL, password: 'FirstPass123' } });
    assert.equal(signIn.data.user.role, 'CHAIR');
    token.titled = signIn.data.session.access_token;
    assert.equal((await api('GET', '/api/reviews/queue', { as: 'titled' })).status, 200, 'can open the Chair queue');
  });

  test('a role in use cannot be removed; a built-in role never', async () => {
    assert.equal((await api('DELETE', `/api/admin/job-titles/${titleId}`, { as: 'admin' })).status, 409);
    const titles = await api('GET', '/api/admin/job-titles', { as: 'admin' });
    const builtin = titles.data.jobTitles.find((t) => t.is_builtin);
    assert.equal((await api('DELETE', `/api/admin/job-titles/${builtin.id}`, { as: 'admin' })).status, 400);
  });

  test('once nobody has it, the role can be removed', async () => {
    assert.equal((await api('DELETE', `/api/admin/users/${titledStaffId}`, { as: 'admin' })).status, 200);
    assert.equal((await api('DELETE', `/api/admin/job-titles/${titleId}`, { as: 'admin' })).status, 200);
  });
});
