// UNIT TESTS: security helpers (file checks, passwords, CSV safety, rate limit, acting approvers).
require('../helpers/fakeEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkEvidenceFile, checkTotalSize } = require('../../middleware/upload');
const { checkPasswordRule } = require('../../controllers/authController');
const { csvCell } = require('../../controllers/adminReportController');
const { canActFor } = require('../../controllers/adminControlsController');
const { rateLimit } = require('../../middleware/rateLimit');

const file = (originalname, firstBytes) => ({ originalname, buffer: Buffer.from(firstBytes) });

test('evidence: real PDF, JPG and PNG files are accepted', () => {
  assert.equal(checkEvidenceFile(file('medical.pdf', '%PDF-1.7 ...')), null);
  assert.equal(checkEvidenceFile(file('scan.JPG', [0xff, 0xd8, 0xff, 0xe0])), null);
  assert.equal(checkEvidenceFile(file('photo.png', [0x89, 0x50, 0x4e, 0x47, 0x0d])), null);
});

test('evidence: a program renamed to .pdf is refused', () => {
  const fakePdf = file('medical.pdf', 'MZ\x90\x00 this is really an .exe');
  assert.match(checkEvidenceFile(fakePdf), /not a real PDF/);
});

test('evidence: other file types are refused', () => {
  assert.match(checkEvidenceFile(file('virus.exe', 'MZ')), /not allowed/);
  assert.match(checkEvidenceFile(file('notes.docx', 'PK')), /not allowed/);
});

test('evidence: all files together must be 4 MB or less', () => {
  const MB = 1024 * 1024;
  assert.equal(checkTotalSize([{ size: 1 * MB }, { size: 2.5 * MB }]), null, '3.5 MB is fine');
  assert.equal(checkTotalSize([{ size: 4 * MB }]), null, 'exactly 4 MB is fine');
  assert.match(checkTotalSize([{ size: 3 * MB }, { size: 2 * MB }]), /at most 4 MB in total/);
});

test('passwords need 8+ characters with a letter and a number', () => {
  assert.equal(checkPasswordRule('ChangeTrack@2026'), null);
  assert.match(checkPasswordRule('abc123'), /at least 8/);
  assert.match(checkPasswordRule('onlyletters'), /letter and one number/);
  assert.match(checkPasswordRule('12345678'), /letter and one number/);
  assert.match(checkPasswordRule(undefined), /at least 8/);
});

test('CSV export: values that Excel would run as a formula are made safe', () => {
  assert.equal(csvCell('=HYPERLINK("http://bad")'), `"'=HYPERLINK(""http://bad"")"`);
  assert.equal(csvCell('+254700'), `"'+254700"`);
  assert.equal(csvCell('-1'), `"'-1"`);
  assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`);
});

test('CSV export: normal values, quotes and empty values', () => {
  assert.equal(csvCell('IST 2040'), '"IST 2040"');
  assert.equal(csvCell('He said "ok"'), '"He said ""ok"""');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(42), '"42"');
});

test('acting approver: who may act for whom', () => {
  const chair = { id: 2, role: 'CHAIR', department_id: 1 };
  const dean = { id: 3, role: 'DEAN', department_id: 1 };
  const sameDeptLecturer = { id: 1, role: 'LECTURER', department_id: 1, is_active: true };
  const otherDeptChair = { id: 7, role: 'CHAIR', department_id: 2, is_active: true };

  assert.equal(canActFor(chair, sameDeptLecturer), true, 'lecturer from the same department');
  assert.equal(canActFor(chair, otherDeptChair), false, 'acting Chair must be from the same department');
  assert.equal(canActFor(dean, otherDeptChair), false, 'acting Dean must be from the same department');
  assert.equal(canActFor(dean, { ...chair, is_active: true }), true, 'the Chair of the same department can act as Dean');
  const registrar = { id: 4, role: 'REGISTRAR', department_id: 4 };
  assert.equal(canActFor(registrar, otherDeptChair), true, 'the Registrar can be covered from any department');
  assert.equal(canActFor(chair, { ...chair, is_active: true }), false, 'not themselves');
  assert.equal(canActFor(dean, { id: 5, role: 'ADMIN', department_id: 1, is_active: true }), false, 'never an Admin');
  assert.equal(canActFor(chair, { ...sameDeptLecturer, is_active: false }), false, 'not a deactivated account');
});

test('rate limit: blocks after the limit with status 429', () => {
  const limit = rateLimit({ windowMinutes: 15, max: 2, keyFrom: (req) => req.ip, message: 'Too many' });
  const send = (ip) => {
    let status = 200;
    let passed = false;
    const res = { status(code) { status = code; return this; }, json() { return this; } };
    limit({ ip }, res, () => { passed = true; });
    return passed ? 200 : status;
  };
  assert.equal(send('1.1.1.1'), 200);
  assert.equal(send('1.1.1.1'), 200);
  assert.equal(send('1.1.1.1'), 429, 'third try is blocked');
  assert.equal(send('2.2.2.2'), 200, 'another computer is not affected');
});
