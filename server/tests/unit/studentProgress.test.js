// UNIT TESTS: the student's progress view (wireframe page 8) and its privacy rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const { toStudentView, buildSteps } = require('../../services/studentProgress');

const at = (day) => `2026-11-${day}T10:00:00Z`;
const submitted = { stage: 'LECTURER', decision: 'SUBMITTED', decided_at: at(12) };
const chairApproved = { stage: 'CHAIR', decision: 'APPROVED', decided_at: at(13) };

test('a request with the Dean shows Chair done, Dean current, Registrar pending', () => {
  const steps = buildSteps('WITH_DEAN', [submitted, chairApproved]);
  assert.deepEqual(steps.map((s) => s.state), ['done', 'done', 'current', 'pending']);
  assert.equal(steps[1].text, 'Approved · 13 Nov 2026');
  assert.equal(steps[2].text, 'Awaiting review · Since 13 Nov 2026');
  assert.equal(steps[3].text, 'Pending Dean approval');
});

test('a returned request shows where it stopped', () => {
  const returned = { stage: 'CHAIR', decision: 'RETURNED', decided_at: at(13) };
  const steps = buildSteps('RETURNED', [submitted, returned]);
  assert.deepEqual(steps.map((s) => s.state), ['done', 'returned', 'pending', 'pending']);
  assert.equal(steps[2].text, 'Not reached');
});

test('after a resubmission only the new round counts', () => {
  const returned = { stage: 'CHAIR', decision: 'RETURNED', decided_at: at(13) };
  const resubmitted = { stage: 'LECTURER', decision: 'RESUBMITTED', decided_at: at(16) };
  const steps = buildSteps('WITH_CHAIR', [submitted, returned, resubmitted]);
  assert.equal(steps[0].text, 'Resubmitted · 16 Nov 2026');
  assert.equal(steps[1].state, 'current', 'the old "returned" step is not shown any more');
});

test('a posted request shows all four steps done', () => {
  const history = [submitted, chairApproved,
    { stage: 'DEAN', decision: 'APPROVED', decided_at: at(14) },
    { stage: 'REGISTRAR', decision: 'POSTED', decided_at: at(15) }];
  assert.deepEqual(buildSteps('POSTED', history).map((s) => s.state), ['done', 'done', 'done', 'done']);
});

test('PRIVACY: the student view never contains grades, comments, names or evidence', () => {
  const fromDatabase = {
    id: 7, request_number: 'CT-2026-0007', course_code: 'IST 2040', section: 'A', term: 'Fall 2026',
    status: 'WITH_DEAN', current_grade: 'C+', new_grade: 'B', justification: 'Marks were added wrongly.',
    lecturer_name: 'Jane Otieno',
  };
  const history = { 7: [submitted, { ...chairApproved, comment: 'Looks fine', decided_by: 'Peter Kamau' }] };
  const [view] = toStudentView([fromDatabase], history);

  assert.deepEqual(Object.keys(view).sort(), ['course_code', 'request_number', 'section', 'status', 'status_text', 'steps', 'term']);
  const text = JSON.stringify(view);
  for (const secret of ['C+', '"B"', 'Marks were added', 'Jane', 'Peter', 'Looks fine']) {
    assert.ok(!text.includes(secret), `student view must not include ${secret}`);
  }
  assert.equal(view.status_text, 'With Dean');
});
