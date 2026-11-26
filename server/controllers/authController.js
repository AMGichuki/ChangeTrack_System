// CONTROLLER: sign in, refresh session, sign out, "who am I", forgot/reset password.
const { supabase, createAuthClient } = require('../config/supabase');
const userModel = require('../models/userModel');
const { sendPasswordResetEmail } = require('../services/emailService');
const { loadActing } = require('../middleware/auth');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Our password rule: at least 8 characters, with at least one letter and one number.
// Returns an error message, or null if the password is fine.
function checkPasswordRule(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 72) return 'Use 72 characters or fewer.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use at least one letter and one number.';
  return null;
}

// Only send the browser what it needs from a Supabase session.
function publicSession(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  };
}

// POST /api/auth/login   { email, password }
async function login(req, res, next) {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Enter your email address and password.' });
    }

    const { data, error } = await createAuthClient().auth.signInWithPassword({ email, password });
    if (error) {
      // Same message for "no such email" and "wrong password", so attackers
      // cannot use the login form to find out which emails exist.
      return res.status(401).json({ status: 'error', message: 'Wrong email or password.' });
    }

    const profile = await userModel.findProfileByAuthId(data.user.id);
    if (!profile || !profile.is_active) {
      await supabase.auth.admin.signOut(data.session.access_token).catch(() => {});
      return res.status(403).json({ status: 'error', message: 'Your ChangeTrack account is not active. Contact the administrator.' });
    }

    res.json({ session: publicSession(data.session), user: await loadActing(profile) });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/refresh   { refresh_token }
// The access token lasts about 1 hour. This swaps the refresh token for a new one,
// so people are not thrown out while they work.
async function refresh(req, res, next) {
  try {
    const refreshToken = req.body.refresh_token;
    if (!refreshToken) {
      return res.status(400).json({ status: 'error', message: 'Missing refresh token.' });
    }
    const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      return res.status(401).json({ status: 'error', message: 'Your session has expired. Please sign in again.' });
    }
    res.json({ session: publicSession(data.session) });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/logout   (signed in)
async function logout(req, res, next) {
  try {
    // Cancels this person's session on Supabase, not just in the browser.
    await supabase.auth.admin.signOut(req.token).catch(() => {});
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me   (signed in)
function me(req, res) {
  res.json({ user: req.user });
}

// POST /api/auth/forgot-password   { email }
// We ALWAYS give the same answer, whether the email has an account or not,
// so this form cannot be used to find out who has an account.
async function forgotPassword(req, res, next) {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ status: 'error', message: 'Enter a valid email address.' });
  }
  const answer = {
    status: 'ok',
    message: 'If this email has a ChangeTrack account, we have sent a link to reset the password. Check your inbox.',
  };

  try {
    const account = await userModel.findActiveLoginByEmail(email);
    if (account) {
      // Ask Supabase for a one-time recovery code. generateLink does NOT send
      // an email itself; we send our own email with Nodemailer.
      const { data, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email: account.email });
      if (error) throw error;
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const link = `${clientUrl}/reset-password?token=${encodeURIComponent(data.properties.hashed_token)}`;
      await sendPasswordResetEmail(account.email, link);
    }
    res.json(answer);
  } catch (err) {
    // Log the real problem for us, but still give the same answer to the browser.
    console.error('Forgot password failed:', err.message);
    if (process.env.NODE_ENV === 'production') return res.json(answer);
    next(err);
  }
}

// POST /api/auth/reset-password   { token, password }
async function resetPassword(req, res, next) {
  try {
    const token = String(req.body.token || '');
    const password = req.body.password;
    const passwordProblem = checkPasswordRule(password);
    if (passwordProblem) return res.status(400).json({ status: 'error', message: passwordProblem });

    const invalidLink = { status: 'error', message: 'This reset link is invalid, already used or expired. Please ask for a new one.' };
    if (!token) return res.status(400).json(invalidLink);

    // Check the one-time code with Supabase. It works only once and expires after 1 hour.
    const { data, error } = await createAuthClient().auth.verifyOtp({ token_hash: token, type: 'recovery' });
    if (error || !data.user) return res.status(400).json(invalidLink);

    const profile = await userModel.findProfileByAuthId(data.user.id);
    if (!profile || !profile.is_active) {
      return res.status(403).json({ status: 'error', message: 'Your ChangeTrack account is not active. Contact the administrator.' });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(data.user.id, { password });
    if (updateError) return res.status(400).json({ status: 'error', message: updateError.message });

    // Sign the person out everywhere (other browsers, phones), in case someone else had access.
    if (data.session) {
      await supabase.auth.admin.signOut(data.session.access_token, 'global').catch(() => {});
    }

    res.json({ status: 'ok', message: 'Your password has been changed. You can now sign in.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, refresh, logout, me, forgotPassword, resetPassword, checkPasswordRule };
