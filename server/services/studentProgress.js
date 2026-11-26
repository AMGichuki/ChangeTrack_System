// Turns a request's status + approval history into the 4 simple steps the
// student sees (wireframe page 8):
//   1 Lecturer  Submitted · 12 Nov 2026
//   2 Chair     Approved · 13 Nov 2026
//   3 Dean      Awaiting review · Since 13 Nov 2026
//   4 Registrar Pending Dean approval
//
// PRIVACY: only stage names, plain words and dates leave this file. No grades,
// no comments, no approver names, no evidence.

const STAGES = [
  { stage: 'LECTURER', label: 'Lecturer' },
  { stage: 'CHAIR', label: 'Chair of Department' },
  { stage: 'DEAN', label: 'Dean' },
  { stage: 'REGISTRAR', label: 'Registrar' },
];
const CURRENT_STAGE = { WITH_CHAIR: 'CHAIR', WITH_DEAN: 'DEAN', WITH_REGISTRAR: 'REGISTRAR' };

// What the student sees as the overall status.
const STUDENT_STATUS = {
  WITH_CHAIR: 'With Chair',
  WITH_DEAN: 'With Dean',
  WITH_REGISTRAR: 'With Registrar',
  RETURNED: 'With your lecturer for correction',
  REJECTED: 'Closed · not approved',
  POSTED: 'Posted',
};

const DONE_WORDS = {
  SUBMITTED: 'Submitted',
  RESUBMITTED: 'Resubmitted',
  APPROVED: 'Approved',
  POSTED: 'Posted',
  RETURNED: 'Returned to lecturer',
  REJECTED: 'Not approved',
};

function shortDate(value) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi',
  });
}

function buildSteps(status, history) {
  // Only the latest round counts (everything since the last (re)submission).
  let start = 0;
  history.forEach((h, i) => { if (h.decision === 'SUBMITTED' || h.decision === 'RESUBMITTED') start = i; });
  const round = history.slice(start);
  const lastDate = history.length ? history[history.length - 1].decided_at : null;
  const current = CURRENT_STAGE[status];
  const stopped = status === 'RETURNED' || status === 'REJECTED';

  return STAGES.map(({ stage, label }, index) => {
    const entry = [...round].reverse().find((h) => h.stage === stage);
    if (entry) {
      const state = entry.decision === 'RETURNED' ? 'returned' : entry.decision === 'REJECTED' ? 'rejected' : 'done';
      return { label, state, text: `${DONE_WORDS[entry.decision]} · ${shortDate(entry.decided_at)}` };
    }
    if (stage === current) {
      return { label, state: 'current', text: `Awaiting review · Since ${shortDate(lastDate)}` };
    }
    if (stopped) return { label, state: 'pending', text: 'Not reached' };
    return { label, state: 'pending', text: `Pending ${STAGES[index - 1].label.replace(' of Department', '')} approval` };
  });
}

// requests: rows from the database; historyByRequest: { requestId: [approvals...] }
function toStudentView(requests, historyByRequest) {
  return requests.map((r) => ({
    request_number: r.request_number,
    course_code: r.course_code,
    section: r.section,
    term: r.term,
    status: r.status,
    status_text: STUDENT_STATUS[r.status],
    steps: buildSteps(r.status, historyByRequest[r.id] || []),
  }));
}

module.exports = { toStudentView, buildSteps };
