// UNIT TESTS: who may see a request, working days, and acting approvers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { canViewRequest, workingDaysSince, resolveApproverContext } = require('../../services/requestAccess');

// A request from department 1 (Science & Technology), written by lecturer 1.
const request = { lecturer_id: 1, department_id: 1 };

test('a lecturer sees only their own requests', () => {
  assert.equal(canViewRequest({ id: 1, role: 'LECTURER', department_id: 1 }, request), true);
  assert.equal(canViewRequest({ id: 6, role: 'LECTURER', department_id: 1 }, request), false);
});

test('a Chair sees only requests from their own department', () => {
  assert.equal(canViewRequest({ id: 2, role: 'CHAIR', department_id: 1 }, request), true);
  assert.equal(canViewRequest({ id: 7, role: 'CHAIR', department_id: 2 }, request), false);
});

test('a Dean sees only requests for their own department', () => {
  assert.equal(canViewRequest({ id: 3, role: 'DEAN', department_id: 1 }, request), true);
  assert.equal(canViewRequest({ id: 8, role: 'DEAN', department_id: 2 }, request), false);
});

test('an acting Dean sees only the department they cover', () => {
  const acting = { id: 6, role: 'LECTURER', department_id: 2, acting: [{ role: 'DEAN', department_id: 2, approver_id: 8 }] };
  assert.equal(canViewRequest(acting, request), false);
  const sameDept = { ...acting, acting: [{ role: 'DEAN', department_id: 1, approver_id: 3 }] };
  assert.equal(canViewRequest(sameDept, request), true);
});

test('Registrar and Admin see all requests; a student does not', () => {
  for (const role of ['REGISTRAR', 'ADMIN']) {
    assert.equal(canViewRequest({ id: 9, role, department_id: 5 }, request), true, role);
  }
  assert.equal(canViewRequest({ id: 1, role: 'STUDENT' }, request), false);
});

test('an acting Chair sees requests from the department they cover', () => {
  const actingChair = { id: 6, role: 'LECTURER', department_id: 1, acting: [{ role: 'CHAIR', department_id: 1, approver_id: 2 }] };
  assert.equal(canViewRequest(actingChair, request), true);
  const otherDept = { ...actingChair, acting: [{ role: 'CHAIR', department_id: 2, approver_id: 7 }] };
  assert.equal(canViewRequest(otherDept, request), false);
});

test('working days skip Saturday and Sunday', () => {
  // 20 Nov 2026 is a Friday, 23 Nov 2026 is a Monday.
  assert.equal(workingDaysSince('2026-11-20T09:00:00', new Date('2026-11-20T17:00:00')), 0, 'same day');
  assert.equal(workingDaysSince('2026-11-20T09:00:00', new Date('2026-11-23T09:00:00')), 1, 'Friday to Monday');
  assert.equal(workingDaysSince('2026-11-16T09:00:00', new Date('2026-11-23T09:00:00')), 5, 'one full week');
  assert.equal(workingDaysSince('2026-11-21T09:00:00', new Date('2026-11-22T09:00:00')), 0, 'Saturday to Sunday');
});

test('an approver uses their own role when not acting', () => {
  const ctx = resolveApproverContext({ id: 3, role: 'DEAN', department_id: 1 });
  assert.equal(ctx.role, 'DEAN');
  assert.equal(ctx.actingFor, null);
});

test('a lecturer or admin is not an approver', () => {
  assert.equal(resolveApproverContext({ id: 1, role: 'LECTURER' }), null);
  assert.equal(resolveApproverContext({ id: 5, role: 'ADMIN' }), null);
});

test('acting only works for someone they are acting for today', () => {
  const jane = { id: 1, role: 'LECTURER', department_id: 1, acting: [{ approver_id: 2, approver_name: 'Peter Kamau', role: 'CHAIR', department_id: 1 }] };
  const ctx = resolveApproverContext(jane, '2');
  assert.equal(ctx.role, 'CHAIR');
  assert.deepEqual(ctx.actingFor, { id: 2, name: 'Peter Kamau' });
  assert.equal(resolveApproverContext(jane, '3'), null, 'not acting for the Dean');
});
