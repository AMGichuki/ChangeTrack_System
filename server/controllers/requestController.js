// CONTROLLER: creating requests (lecturer) and viewing one request (anyone allowed).
const db = require('../config/db');
const rules = require('../config/rules');
const requestModel = require('../models/requestModel');
const studentModel = require('../models/studentModel');
const userModel = require('../models/userModel');
const delegationModel = require('../models/delegationModel');
const departmentModel = require('../models/departmentModel');
const { checkEvidenceFile, checkTotalSize } = require('../middleware/upload');
const { uploadEvidenceFile, removeEvidenceFiles, createViewLink } = require('../services/storageService');
const { sendReviewNeededEmails } = require('../services/emailService');
const { canViewRequest } = require('../services/requestAccess');
const { writeGradeChangeForm } = require('../services/pdfService');
const { afterResponse } = require('../services/background');

const STATUSES = ['WITH_CHAIR', 'WITH_DEAN', 'WITH_REGISTRAR', 'POSTED', 'RETURNED', 'REJECTED'];

// Never ask the lecturer to review their own request (e.g. while they are acting Chair).
const notMe = (emails, myEmail) => emails.filter((e) => e !== myEmail);

function badRequest(res, message) {
  return res.status(400).json({ status: 'error', message });
}

// "ist2040" or "IST  2040" -> "IST 2040". Returns null if it does not look like a course code.
function normaliseCourseCode(value) {
  const match = String(value || '').trim().toUpperCase().match(/^([A-Z]{2,4})\s*(\d{4})$/);
  return match ? `${match[1]} ${match[2]}` : null;
}

// GET /api/requests/options  -> lists for the form dropdowns
async function getOptions(req, res, next) {
  let departments;
  try {
    departments = (await departmentModel.listDepartments()).filter((d) => d.is_academic);
  } catch (err) {
    return next(err);
  }
  res.json({
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    defaultDepartmentId: departments.some((d) => d.id === req.user.department_id) ? req.user.department_id : null,
    grades: rules.GRADES,
    newGrades: rules.NEW_GRADES,
    reasons: rules.REASONS,
    evidenceHints: rules.EVIDENCE_HINTS,
    terms: rules.getTerms(),
    evidence: { maxFiles: rules.EVIDENCE.maxFiles, maxSizeMb: rules.EVIDENCE.maxSizeMb, maxTotalMb: rules.EVIDENCE.maxTotalMb, accept: '.pdf,.jpg,.jpeg,.png' },
  });
}

// GET /api/requests/student-lookup?number=S-102341
// Shows the student's name on the form so the lecturer can confirm the right person.
async function lookupStudent(req, res, next) {
  try {
    const number = String(req.query.number || '').trim();
    const student = number ? await studentModel.findByStudentNumber(number) : null;
    if (!student) return res.status(404).json({ status: 'error', message: 'Student ID not found.' });
    res.json({ student: { student_number: student.student_number, full_name: student.full_name, department_name: student.department_name } });
  } catch (err) {
    next(err);
  }
}

// Check the request form (used by both Create and Resubmit).
// Returns { data } when everything is fine, or { error } with a message to show.
async function readRequestForm(b) {
  const student = await studentModel.findByStudentNumber(String(b.student_number || '').trim());
  if (!student) return { error: 'Student ID not found. Check the ID, or ask the Admin to add the student.' };

  // The department the request is FOR: its Chair and Dean will decide.
  const department = await departmentModel.findDepartment(Number(b.department_id));
  if (!department || !department.is_academic) return { error: 'Choose the department this request is for.' };

  const courseCode = normaliseCourseCode(b.course_code);
  if (!courseCode) return { error: 'Enter the course code like IST 2040.' };

  const section = String(b.section || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,3}$/.test(section)) return { error: 'Enter the section, e.g. A.' };

  const term = String(b.term || '');
  if (!rules.getTerms().includes(term)) return { error: 'Choose a term.' };

  const currentGrade = String(b.current_grade || '');
  const newGrade = String(b.new_grade || '');
  if (!rules.GRADES.includes(currentGrade)) return { error: 'Choose the current grade.' };
  if (!rules.NEW_GRADES.includes(newGrade)) return { error: 'Choose the proposed grade (it must be a final grade).' };
  if (currentGrade === newGrade) return { error: 'The proposed grade must be different from the current grade.' };

  const reason = String(b.reason || '');
  if (!rules.REASONS.some((r) => r.value === reason)) return { error: 'Choose a reason.' };

  const justification = String(b.justification || '').trim();
  if (justification.length < 20) return { error: 'Explain the reason in at least 20 characters.' };
  if (justification.length > 2000) return { error: 'Keep the justification under 2000 characters.' };

  return { data: { student, department, departmentId: department.id, courseCode, section, term, currentGrade, newGrade, reason, justification } };
}

// Check uploaded files are real PDF/JPG/PNG. Returns an error message or null.
function checkFiles(files) {
  const tooBig = checkTotalSize(files);
  if (tooBig) return tooBig;
  for (const file of files) {
    const problem = checkEvidenceFile(file);
    if (problem) return problem;
  }
  return null;
}

// POST /api/requests   (form fields + evidence files)
async function createRequest(req, res, next) {
  try {
    const files = req.files || [];

    // ---- 1. Check the form ----
    const { data, error } = await readRequestForm(req.body);
    if (error) return badRequest(res, error);
    const { student, departmentId, courseCode, section, term, currentGrade, newGrade, reason, justification } = data;

    if (files.length === 0) return badRequest(res, 'Attach at least one supporting document.');
    const fileProblem = checkFiles(files);
    if (fileProblem) return badRequest(res, fileProblem);

    const duplicate = await requestModel.findOpenDuplicate(student.id, courseCode, term);
    if (duplicate) {
      return badRequest(res, `There is already an open request (${duplicate.request_number}) for this student, course and term.`);
    }

    // ---- 2. Save everything together (transaction) ----
    const client = await db.getClient();
    const uploadedPaths = [];
    try {
      await client.query('BEGIN');

      const saved = await requestModel.insertRequest(client, {
        lecturerId: req.user.id,
        studentId: student.id,
        departmentId,
        courseCode, section, term, currentGrade, newGrade, reason, justification,
      });

      for (const file of files) {
        const path = await uploadEvidenceFile(saved.id, file);
        uploadedPaths.push(path);
        await requestModel.insertEvidence(client, saved.id, file.originalname, path);
      }

      // First line of the approval history: "Lecturer · Submitted".
      await requestModel.insertApproval(client, {
        requestId: saved.id,
        approverId: req.user.id,
        stage: 'LECTURER',
        decision: 'SUBMITTED',
      });

      await client.query('COMMIT');
      res.status(201).json({ request: saved });

      // Tell the Chair(s) of the request's department. Sent after saving, and an
      // email problem never undoes the request (it is logged instead).
      afterResponse('Email to Chair', () => delegationModel.listStageEmails('CHAIR', departmentId)
        .then((emails) => sendReviewNeededEmails(notMe(emails, req.user.email), { requestNumber: saved.request_number, courseCode, path: '/chair' })));
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      await removeEvidenceFiles(uploadedPaths).catch(() => {}); // no orphan files left behind
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

// GET /api/requests/mine?search=&status=
async function listMine(req, res, next) {
  try {
    const search = String(req.query.search || '').trim();
    const status = STATUSES.includes(req.query.status) ? req.query.status : '';
    const [requests, counts] = await Promise.all([
      requestModel.listForLecturer(req.user.id, { search, status }),
      requestModel.countsForLecturer(req.user.id),
    ]);
    res.json({ counts, requests });
  } catch (err) {
    next(err);
  }
}

// Write a short "what changed" summary for the history, e.g.
// "Proposed grade: B → B+; Added file: schedule.pdf". This keeps an honest record,
// because the request's fields are overwritten by the correction.
function describeChanges(before, after, addedFiles, removedFiles) {
  const changes = [];
  const compare = (label, oldValue, newValue) => {
    if (String(oldValue) !== String(newValue)) changes.push(`${label}: ${oldValue} → ${newValue}`);
  };
  compare('Student', before.student_number, after.student.student_number);
  compare('Department', before.department_name, after.department.name);
  compare('Course', before.course_code, after.courseCode);
  compare('Section', before.section, after.section);
  compare('Term', before.term, after.term);
  compare('Current grade', before.current_grade, after.currentGrade);
  compare('Proposed grade', before.new_grade, after.newGrade);
  compare('Reason', before.reason, after.reason);
  if (before.justification !== after.justification) changes.push('Justification updated');
  addedFiles.forEach((name) => changes.push(`Added file: ${name}`));
  removedFiles.forEach((name) => changes.push(`Removed file: ${name}`));
  return changes.length ? `Changes: ${changes.join('; ')}` : 'No changes to the details.';
}

// PUT /api/requests/:id/resubmit   (form fields + new files + remove_evidence ids + optional note)
async function resubmitRequest(req, res, next) {
  try {
    const id = Number(req.params.id);
    const before = Number.isInteger(id) ? await requestModel.findById(id) : null;
    if (!before || before.lecturer_id !== req.user.id) {
      return res.status(404).json({ status: 'error', message: 'Request not found.' });
    }
    if (before.status !== 'RETURNED') {
      return res.status(409).json({ status: 'error', message: 'Only a request returned for correction can be edited.' });
    }

    // ---- 1. Check the form (same rules as a new request) ----
    const { data, error } = await readRequestForm(req.body);
    if (error) return badRequest(res, error);

    const note = String(req.body.note || '').trim();
    if (note.length > 500) return badRequest(res, 'Keep the note to the Chair under 500 characters.');

    // ---- 2. Check the files: existing - removed + new ----
    const newFiles = req.files || [];
    const fileProblem = checkFiles(newFiles);
    if (fileProblem) return badRequest(res, fileProblem);

    const existing = await requestModel.listEvidence(id);
    const removeIds = [].concat(req.body.remove_evidence || [])
      .map(Number)
      .filter((evId) => existing.some((e) => e.id === evId));
    const remaining = existing.length - removeIds.length + newFiles.length;
    if (remaining === 0) return badRequest(res, 'Keep or attach at least one supporting document.');
    if (remaining > rules.EVIDENCE.maxFiles) {
      return badRequest(res, `A request can have up to ${rules.EVIDENCE.maxFiles} files in total.`);
    }

    const duplicate = await requestModel.findOpenDuplicate(data.student.id, data.courseCode, data.term, id);
    if (duplicate) {
      return badRequest(res, `There is already an open request (${duplicate.request_number}) for this student, course and term.`);
    }

    // ---- 3. Save everything together ----
    const client = await db.getClient();
    const uploadedPaths = [];
    let removed = [];
    try {
      await client.query('BEGIN');

      const updated = await requestModel.updateReturnedRequest(client, id, { ...data, studentId: data.student.id });
      if (!updated) {
        await client.query('ROLLBACK');
        return res.status(409).json({ status: 'error', message: 'This request has already been resubmitted.' });
      }

      removed = await requestModel.deleteEvidence(client, id, removeIds);
      for (const file of newFiles) {
        const path = await uploadEvidenceFile(id, file);
        uploadedPaths.push(path);
        await requestModel.insertEvidence(client, id, file.originalname, path);
      }

      const summary = describeChanges(before, data, newFiles.map((f) => f.originalname), removed.map((r) => r.file_name));
      await requestModel.insertApproval(client, {
        requestId: id,
        approverId: req.user.id,
        stage: 'LECTURER',
        decision: 'RESUBMITTED',
        comment: note ? `${note}\n${summary}` : summary,
      });

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      await removeEvidenceFiles(uploadedPaths).catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    res.json({ status: 'ok', request_number: before.request_number, new_status: 'WITH_CHAIR' });

    // After saving: delete the removed files from storage, and tell the Chair(s).
    afterResponse('Deleting removed evidence files', () => removeEvidenceFiles(removed.map((r) => r.file_path)));
    afterResponse('Email to Chair', () => delegationModel.listStageEmails('CHAIR', data.departmentId)
      .then((emails) => sendReviewNeededEmails(notMe(emails, req.user.email), { requestNumber: before.request_number, courseCode: data.courseCode, path: '/chair' })));
  } catch (err) {
    next(err);
  }
}

// Load a request and check the signed-in person may see it. Sends 404 if not
// (we say "not found" rather than "forbidden", so nobody learns which numbers exist).
async function loadVisibleRequest(req, res) {
  const id = Number(req.params.id);
  const request = Number.isInteger(id) ? await requestModel.findById(id) : null;
  if (!request || !canViewRequest(req.user, request)) {
    res.status(404).json({ status: 'error', message: 'Request not found.' });
    return null;
  }
  return request;
}

// GET /api/requests/:id   -> details + evidence list + approval history
async function getRequest(req, res, next) {
  try {
    const request = await loadVisibleRequest(req, res);
    if (!request) return;
    const [evidence, history] = await Promise.all([
      requestModel.listEvidence(request.id),
      requestModel.listHistory(request.id),
    ]);
    res.json({ request, evidence, history });
  } catch (err) {
    next(err);
  }
}

// GET /api/requests/:id/evidence/:evidenceId   -> a short-lived link to view the file
async function openEvidence(req, res, next) {
  try {
    const request = await loadVisibleRequest(req, res);
    if (!request) return;
    const file = await requestModel.findEvidence(request.id, Number(req.params.evidenceId));
    if (!file) return res.status(404).json({ status: 'error', message: 'File not found.' });
    const url = await createViewLink(file.file_path);
    res.json({ url, file_name: file.file_name });
  } catch (err) {
    next(err);
  }
}

// GET /api/requests/:id/pdf   -> the Grade Change Form as a PDF download
async function downloadPdf(req, res, next) {
  try {
    const request = await loadVisibleRequest(req, res);
    if (!request) return;
    const [evidence, history] = await Promise.all([
      requestModel.listEvidence(request.id),
      requestModel.listHistory(request.id),
    ]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${request.request_number}-grade-change-form.pdf"`);
    writeGradeChangeForm(res, { request, evidence, history });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOptions, lookupStudent, createRequest, resubmitRequest, listMine, getRequest, openEvidence, downloadPdf, loadVisibleRequest,
  // exported only so the unit tests can check them
  normaliseCourseCode, describeChanges,
};
