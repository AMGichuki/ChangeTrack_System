// The business rules for a grade change request, in ONE place.
// The React form gets these lists from the server (GET /api/requests/options),
// so the dropdowns and the server checks can never disagree.
//
// TO CONFIRM with the Registrar: the exact grade list and terms.

// Grades a course can have.
// (NR and NC were removed from ChangeTrack on 24 Nov 2026.)
const GRADES = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'I'];

// A grade change must end in a FINAL grade, so I (Incomplete) is not
// allowed as the new grade.
const NEW_GRADES = GRADES.filter((g) => g !== 'I');

const REASONS = [
  { value: 'ILLNESS', label: 'Illness' },
  { value: 'DEATH', label: 'Death' },
  { value: 'ARITHMETIC', label: 'Arithmetic' },
  { value: 'OTHER', label: 'Other' },
];

// What evidence each reason usually needs (shown as a hint on the form).
const EVIDENCE_HINTS = {
  ILLNESS: 'Medical documents',
  DEATH: 'Death announcement or certificate',
  ARITHMETIC: 'Grade schedule',
  OTHER: 'Any supporting document',
};

// Terms the lecturer can choose: this year and last year.
function getTerms(today = new Date()) {
  const year = today.getFullYear();
  const terms = [];
  for (const y of [year, year - 1]) {
    terms.push(`Fall ${y}`, `Summer ${y}`, `Spring ${y}`);
  }
  return terms;
}

// Evidence file rules.
const EVIDENCE = {
  maxFiles: 5,
  // All files sent in ONE submission together: our host (Vercel, free plan)
  // accepts at most 4.5 MB per request, so we allow 4 MB of files.
  maxTotalMb: 4,
  maxSizeMb: 4,
  // We check the real file content, not just the name, so a renamed
  // .exe cannot be uploaded as a .pdf.
  types: [
    { ext: '.pdf', mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
    { ext: '.jpg', mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
    { ext: '.jpeg', mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
    { ext: '.png', mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  ],
};

// Request statuses that are still "open" (not finished).
const OPEN_STATUSES = ['WITH_CHAIR', 'WITH_DEAN', 'WITH_REGISTRAR', 'RETURNED'];

// The approval chain. Fixed order, no skipping:
//   Lecturer -> Chair -> Dean -> Registrar
// For each approver role: which requests they can decide on (status),
// what we write in the history (stage), and where "Approve" sends it (next).
// "decisions" = the buttons each role has.
const WORKFLOW = {
  CHAIR: {
    status: 'WITH_CHAIR', stage: 'CHAIR', next: 'WITH_DEAN', nextRole: 'DEAN',
    ownDepartmentOnly: true, decisions: ['APPROVE', 'RETURN', 'REJECT'],
  },
  DEAN: {
    status: 'WITH_DEAN', stage: 'DEAN', next: 'WITH_REGISTRAR', nextRole: 'REGISTRAR',
    ownDepartmentOnly: true, decisions: ['APPROVE', 'RETURN', 'REJECT'],
  },
  // The Registrar does not "approve": they enter the grade in the school's
  // grading system, then confirm here with "Mark as posted".
  REGISTRAR: {
    status: 'WITH_REGISTRAR', stage: 'REGISTRAR', next: 'POSTED', nextRole: null,
    ownDepartmentOnly: false, decisions: ['POST', 'RETURN', 'REJECT'],
  },
};

// What each button writes in the history (APPROVALS.decision).
const DECISIONS = {
  APPROVE: 'APPROVED',
  POST: 'POSTED',
  RETURN: 'RETURNED',
  REJECT: 'REJECTED',
};

module.exports = {
  GRADES, NEW_GRADES, REASONS, EVIDENCE_HINTS, getTerms, EVIDENCE, OPEN_STATUSES, WORKFLOW, DECISIONS,
};
