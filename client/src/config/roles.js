// Where each role lands after sign in, and the menu each role sees.
// Taken from our wireframes.

export const ROLE_HOME = {
  LECTURER: '/lecturer',
  CHAIR: '/chair',
  DEAN: '/dean',
  REGISTRAR: '/registrar',
  ADMIN: '/admin',
  STUDENT: '/student',
};

export const ROLE_LABEL = {
  LECTURER: 'Lecturer',
  CHAIR: 'Chair',
  DEAN: 'Dean',
  REGISTRAR: 'Registrar',
  ADMIN: 'Admin',
  STUDENT: 'Student',
};

export const ROLE_MENU = {
  LECTURER: [
    { to: '/lecturer', label: 'My requests' },
    { to: '/lecturer/new', label: 'New request' },
  ],
  CHAIR: [
    { to: '/chair', label: 'Review queue' },
    { to: '/chair/history', label: 'Request history' },
  ],
  DEAN: [
    { to: '/dean', label: 'Review queue' },
    { to: '/dean/history', label: 'Request history' },
  ],
  REGISTRAR: [
    { to: '/registrar', label: 'Review queue' },
    { to: '/registrar/history', label: 'Request history' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Overview' },
    { to: '/admin/users', label: 'Manage users' },
    { to: '/admin/structure', label: 'Departments & roles' },
    { to: '/admin/controls', label: 'Controls & audit' },
  ],
};
