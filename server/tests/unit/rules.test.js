// UNIT TESTS: the business rules in config/rules.js
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../../config/rules');

test('NR and NC are not grades in ChangeTrack', () => {
  for (const removed of ['NR', 'NC']) {
    assert.ok(!rules.GRADES.includes(removed), `${removed} must not be a grade`);
    assert.ok(!rules.NEW_GRADES.includes(removed));
  }
  assert.deepEqual(rules.GRADES, ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'I']);
});

test('the proposed grade must be a final grade (no I)', () => {
  assert.ok(rules.GRADES.includes('I'), 'I can be the current grade');
  assert.ok(!rules.NEW_GRADES.includes('I'));
  assert.ok(rules.NEW_GRADES.includes('A'));
});

test('terms offered are this year and last year', () => {
  const terms = rules.getTerms(new Date('2026-11-24'));
  assert.deepEqual(terms, ['Fall 2026', 'Summer 2026', 'Spring 2026', 'Fall 2025', 'Summer 2025', 'Spring 2025']);
});

test('the approval chain is fixed: Chair -> Dean -> Registrar -> Posted', () => {
  const { CHAIR, DEAN, REGISTRAR } = rules.WORKFLOW;
  assert.equal(CHAIR.status, 'WITH_CHAIR');
  assert.equal(CHAIR.next, 'WITH_DEAN');
  assert.equal(DEAN.status, 'WITH_DEAN');
  assert.equal(DEAN.next, 'WITH_REGISTRAR');
  assert.equal(REGISTRAR.status, 'WITH_REGISTRAR');
  assert.equal(REGISTRAR.next, 'POSTED');
});

test('the Chair AND the Dean are limited to their own department', () => {
  assert.equal(rules.WORKFLOW.CHAIR.ownDepartmentOnly, true);
  assert.equal(rules.WORKFLOW.DEAN.ownDepartmentOnly, true);
  assert.equal(rules.WORKFLOW.REGISTRAR.ownDepartmentOnly, false);
});

test('the Registrar posts instead of approving', () => {
  assert.ok(rules.WORKFLOW.REGISTRAR.decisions.includes('POST'));
  assert.ok(!rules.WORKFLOW.REGISTRAR.decisions.includes('APPROVE'));
  assert.ok(rules.WORKFLOW.CHAIR.decisions.includes('APPROVE'));
});

test('evidence: up to 5 files, 4 MB in total, PDF / JPG / PNG only', () => {
  assert.equal(rules.EVIDENCE.maxFiles, 5);
  assert.equal(rules.EVIDENCE.maxTotalMb, 4, 'Vercel accepts at most 4.5 MB per request');
  assert.ok(rules.EVIDENCE.maxSizeMb <= rules.EVIDENCE.maxTotalMb);
  assert.deepEqual(rules.EVIDENCE.types.map((t) => t.ext), ['.pdf', '.jpg', '.jpeg', '.png']);
});
