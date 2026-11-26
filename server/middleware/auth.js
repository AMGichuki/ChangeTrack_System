// Security checks that run BEFORE a controller.
//
// requireAuth        -> is this person signed in? Who are they? What is their role?
// requireRole        -> is their role allowed to use this route?
// requireApprover    -> are they an approver, or ACTING for one today?
// requireRoleOrActing -> like requireRole, but an acting approver also counts
const { supabase } = require('../config/supabase');
const userModel = require('../models/userModel');
const delegationModel = require('../models/delegationModel');
const { WORKFLOW } = require('../config/rules');

// Add "acting" = who this staff member is acting for today (empty for most people).
async function loadActing(profile) {
  profile.acting = profile.role === 'STUDENT' ? [] : await delegationModel.listActingFor(profile.id);
  return profile;
}

async function requireAuth(req, res, next) {
  try {
    // The browser sends:  Authorization: Bearer <access token>
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ status: 'error', message: 'Please sign in.' });
    }

    // Ask Supabase Auth if the token is real and not expired.
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ status: 'error', message: 'Your session has expired. Please sign in again.' });
    }

    // Find their ChangeTrack account and role in OUR database.
    const profile = await userModel.findProfileByAuthId(data.user.id);
    if (!profile || !profile.is_active) {
      return res.status(403).json({ status: 'error', message: 'Your ChangeTrack account is not active. Contact the administrator.' });
    }

    req.user = await loadActing(profile); // controllers use this, e.g. req.user.role
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

// Usage: router.get('/x', requireAuth, requireRole('ADMIN'), controller)
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ status: 'error', message: 'You do not have access to this page.' });
    }
    next();
  };
}

// Chair, Dean, Registrar - or anyone acting for one of them today.
function requireApprover(req, res, next) {
  if (WORKFLOW[req.user.role] || req.user.acting.length > 0) return next();
  return res.status(403).json({ status: 'error', message: 'You do not have access to this page.' });
}

// e.g. requireRoleOrActing('REGISTRAR', 'ADMIN'): an acting Registrar is allowed too.
function requireRoleOrActing(...allowedRoles) {
  return (req, res, next) => {
    if (allowedRoles.includes(req.user.role) || req.user.acting.some((a) => allowedRoles.includes(a.role))) return next();
    return res.status(403).json({ status: 'error', message: 'You do not have access to this page.' });
  };
}

module.exports = { requireAuth, requireRole, requireApprover, requireRoleOrActing, loadActing };
