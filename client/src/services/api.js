// All calls from React to our Express API go through here.
// React never talks to the database or Supabase directly.

const SESSION_KEY = 'changetrack_session';
const EMAIL_KEY = 'changetrack_email';

// "Keep me signed in" ticked   -> localStorage: stays after the browser is closed.
// Not ticked                    -> sessionStorage: gone when the browser is closed.
// We only keep the session tokens, NEVER the password.
export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

// remember: true / false when signing in; left out when a session is refreshed
// (then it stays where it already is).
export function saveSession(session, remember) {
  const keep = remember ?? !sessionStorage.getItem(SESSION_KEY);
  const store = keep ? localStorage : sessionStorage;
  (keep ? sessionStorage : localStorage).removeItem(SESSION_KEY);
  store.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

// The email address shown on the sign-in form next time (only if "Keep me signed in" was ticked).
export function getRememberedEmail() {
  return localStorage.getItem(EMAIL_KEY) || '';
}

export function setRememberedEmail(email) {
  if (email) localStorage.setItem(EMAIL_KEY, email);
  else localStorage.removeItem(EMAIL_KEY);
}

// If several calls fail at the same time, refresh the session only once.
let refreshing = null;

async function refreshSession() {
  const session = getSession();
  if (!session?.refresh_token) return false;
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = await res.json();
        saveSession(data.session);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function request(path, { method = 'GET', body, retry = true } = {}) {
  const session = getSession();
  // Files are sent as FormData (the browser sets its own Content-Type);
  // everything else is sent as JSON.
  const isFormData = body instanceof FormData;
  const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  // Access token expired? Get a new one and try once more.
  if (res.status === 401 && retry && session?.refresh_token) {
    if (await refreshSession()) {
      return request(path, { method, body, retry: false });
    }
    clearSession();
    window.dispatchEvent(new Event('changetrack:signed-out'));
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// Download a file (e.g. the PDF form) with the login token, then save it.
async function downloadFile(path, fileName, retry = true) {
  const session = getSession();
  const res = await fetch(`/api${path}`, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  if (res.status === 401 && retry && (await refreshSession())) {
    return downloadFile(path, fileName, false);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Download failed (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  getHealth: () => request('/health'),

  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password }, retry: false }),
  logout: () => request('/auth/logout', { method: 'POST', retry: false }),
  me: () => request('/auth/me'),
  forgotPassword: (email) =>
    request('/auth/forgot-password', { method: 'POST', body: { email }, retry: false }),
  resetPassword: (token, password) =>
    request('/auth/reset-password', { method: 'POST', body: { token, password }, retry: false }),

  // Admin: System overview
  getOverview: () => request('/admin/overview'),
  getAdminRequests: (filters = {}) => request(`/admin/requests?${new URLSearchParams(filters)}`),
  exportAdminRequests: (filters = {}) =>
    downloadFile(`/admin/requests/export?${new URLSearchParams(filters)}`, `changetrack-requests-${new Date().toISOString().slice(0, 10)}.csv`),

  // Admin: Controls & audit
  getSettings: () => request('/admin/settings'),
  saveSettings: (settings) => request('/admin/settings', { method: 'PUT', body: settings }),
  runReminders: () => request('/admin/reminders/run', { method: 'POST' }),
  getDelegations: () => request('/admin/delegations'),
  createDelegation: (form) => request('/admin/delegations', { method: 'POST', body: form }),
  deleteDelegation: (id) => request(`/admin/delegations/${id}`, { method: 'DELETE' }),
  getAudit: (search = '') => request(`/admin/audit?${new URLSearchParams({ search })}`),
  exportAudit: (search = '') =>
    downloadFile(`/admin/audit/export?${new URLSearchParams({ search })}`, `changetrack-audit-log-${new Date().toISOString().slice(0, 10)}.csv`),

  // Admin: Manage users
  getJobTitles: () => request('/admin/job-titles'),
  createJobTitle: (form) => request('/admin/job-titles', { method: 'POST', body: form }),
  deleteJobTitle: (id) => request(`/admin/job-titles/${id}`, { method: 'DELETE' }),
  getDepartments: () => request('/admin/departments'),
  getDepartmentOverview: () => request('/admin/departments/overview'),
  createDepartment: (form) => request('/admin/departments', { method: 'POST', body: form }),
  getStaff: ({ search = '', role = '' } = {}) =>
    request(`/admin/users?${new URLSearchParams({ search, role })}`),
  createStaff: (form) => request('/admin/users', { method: 'POST', body: form }),
  updateStaff: (id, form) => request(`/admin/users/${id}`, { method: 'PUT', body: form }),
  setStaffPassword: (id, password) => request(`/admin/users/${id}/password`, { method: 'PUT', body: { password } }),
  deleteStaff: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  getStudents: ({ search = '' } = {}) =>
    request(`/admin/students?${new URLSearchParams({ search })}`),
  createStudent: (form) => request('/admin/students', { method: 'POST', body: form }),
  updateStudent: (id, form) => request(`/admin/students/${id}`, { method: 'PUT', body: form }),
  setStudentPassword: (id, password) => request(`/admin/students/${id}/password`, { method: 'PUT', body: { password } }),
  deleteStudent: (id) => request(`/admin/students/${id}`, { method: 'DELETE' }),

  // Lecturer: grade change requests
  getRequestOptions: () => request('/requests/options'),
  lookupStudent: (number) => request(`/requests/student-lookup?${new URLSearchParams({ number })}`),
  createRequest: (formData) => request('/requests', { method: 'POST', body: formData }),
  resubmitRequest: (id, formData) => request(`/requests/${id}/resubmit`, { method: 'PUT', body: formData }),
  getMyRequests: ({ search = '', status = '' } = {}) =>
    request(`/requests/mine?${new URLSearchParams({ search, status })}`),

  // Any allowed role: one request, and a 60-second link to an evidence file
  getRequest: (id) => request(`/requests/${id}`),
  openEvidence: (id, evidenceId) => request(`/requests/${id}/evidence/${evidenceId}`),

  // Student: read-only progress
  getMyProgress: () => request('/student/requests'),

  // Approvers (Chair, Dean, Registrar)
  // actingFor = id of the approver I am acting for today (empty = my own queue)
  getReviewQueue: (actingFor) =>
    request(`/reviews/queue${actingFor ? `?${new URLSearchParams({ acting_for: actingFor })}` : ''}`),
  getReviewHistory: () => request('/reviews/history'),
  decide: (id, decision, comment, verified = false, actingFor = null) =>
    request(`/reviews/${id}/decision`, { method: 'POST', body: { decision, comment, verified, acting_for: actingFor } }),
  downloadPdf: (id, requestNumber) =>
    downloadFile(`/requests/${id}/pdf`, `${requestNumber}-grade-change-form.pdf`),
};
