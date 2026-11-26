// How each request status is shown on screen.
export const STATUS_LABEL = {
  WITH_CHAIR: 'With Chair',
  WITH_DEAN: 'With Dean',
  WITH_REGISTRAR: 'With Registrar',
  POSTED: 'Posted',
  RETURNED: 'Returned',
  REJECTED: 'Rejected',
}

export const STAGE_LABEL = {
  LECTURER: 'Lecturer',
  CHAIR: 'Chair',
  DEAN: 'Dean',
  REGISTRAR: 'Registrar',
}

export const DECISION_LABEL = {
  SUBMITTED: 'Submitted',
  RESUBMITTED: 'Resubmitted',
  APPROVED: 'Approved',
  RETURNED: 'Returned',
  REJECTED: 'Rejected',
  POSTED: 'Posted',
}

export const REASON_LABEL = {
  ILLNESS: 'Illness',
  DEATH: 'Death',
  ARITHMETIC: 'Arithmetic',
  OTHER: 'Other',
}

// "2026-11-12T06:00:00Z" -> "12 Nov 2026"
export function formatDate(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
