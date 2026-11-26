// Who may open a request's details and evidence?
//   Lecturer  -> only their own requests
//   Chair, Dean -> only requests FOR their own department
//   Dean, Registrar, Admin -> all requests
//   Student   -> not here (students get a separate, limited progress view)
//   Acting approvers -> what the person they act for could see
const { WORKFLOW } = require('../config/rules');

function canViewRequest(user, request) {
  const actingAllows = (user.acting || []).some((a) =>
    a.role === 'CHAIR' || a.role === 'DEAN' ? a.department_id === request.department_id : true);
  if (actingAllows) return true;
  switch (user.role) {
    case 'LECTURER':
      return request.lecturer_id === user.id;
    case 'CHAIR':
    case 'DEAN':
      return request.department_id === user.department_id;
    case 'REGISTRAR':
    case 'ADMIN':
      return true;
    default:
      return false;
  }
}

// Whole working days (Mon-Fri) between a date and now. Shown as "2 working days".
function workingDaysSince(date, now = new Date()) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let count = 0;
  while (day < today) {
    day.setDate(day.getDate() + 1);
    const weekday = day.getDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

// Which approver "seat" is this person using right now?
//  - no actingFor: their own role (must be Chair, Dean or Registrar)
//  - actingFor = id of the approver they act for (must be an active delegation today)
// Returns { role, flow, departmentId, actingFor } or null if not allowed.
function resolveApproverContext(user, actingFor) {
  if (actingFor) {
    const a = (user.acting || []).find((x) => x.approver_id === Number(actingFor));
    if (!a || !WORKFLOW[a.role]) return null;
    return { role: a.role, flow: WORKFLOW[a.role], departmentId: a.department_id, actingFor: { id: a.approver_id, name: a.approver_name } };
  }
  if (!WORKFLOW[user.role]) return null;
  return { role: user.role, flow: WORKFLOW[user.role], departmentId: user.department_id, actingFor: null };
}

module.exports = { canViewRequest, workingDaysSince, resolveApproverContext };
