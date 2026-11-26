// UNIT TESTS: small helpers used by the New request and Correct request forms.
require('../helpers/fakeEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const { normaliseCourseCode, describeChanges } = require('../../controllers/requestController');

test('course codes are tidied into one format', () => {
  assert.equal(normaliseCourseCode('ist2040'), 'IST 2040');
  assert.equal(normaliseCourseCode('  IST   2040 '), 'IST 2040');
  assert.equal(normaliseCourseCode('ACC 1010'), 'ACC 1010');
});

test('wrong course codes are refused', () => {
  assert.equal(normaliseCourseCode('2040'), null);
  assert.equal(normaliseCourseCode('IST 20400'), null);
  assert.equal(normaliseCourseCode(''), null);
  assert.equal(normaliseCourseCode(undefined), null);
});

const before = {
  department_name: 'Science & Technology',
  student_number: '102341', course_code: 'IST 2040', section: 'A', term: 'Fall 2026',
  current_grade: 'C+', new_grade: 'B', reason: 'ARITHMETIC', justification: 'Marks added wrongly.',
};
const sameAfter = {
  department: { name: 'Science & Technology' },
  student: { student_number: '102341' }, courseCode: 'IST 2040', section: 'A', term: 'Fall 2026',
  currentGrade: 'C+', newGrade: 'B', reason: 'ARITHMETIC', justification: 'Marks added wrongly.',
};

test('resubmission: the history records exactly what changed', () => {
  const after = { ...sameAfter, newGrade: 'B+', justification: 'Marks for question 4 were left out.' };
  assert.equal(
    describeChanges(before, after, ['schedule.pdf'], ['old-scan.pdf']),
    'Changes: Proposed grade: B → B+; Justification updated; Added file: schedule.pdf; Removed file: old-scan.pdf',
  );
});

test('resubmission: a change of department is recorded', () => {
  const after = { ...sameAfter, department: { name: 'Business' } };
  assert.equal(describeChanges(before, after, [], []), 'Changes: Department: Science & Technology → Business');
});

test('resubmission with no changes says so', () => {
  assert.equal(describeChanges(before, sameAfter, [], []), 'No changes to the details.');
});
