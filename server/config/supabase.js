// Supabase client for Auth (logins, password reset) and Storage (evidence files).
// It uses the SERVICE ROLE key, which has full access, so it must only
// ever live on the server. Never put this key in the React app.
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// A fresh, separate client used only to sign someone in or refresh a session.
// We do not sign in on the shared "supabase" client above, so its admin
// access is never mixed up with a normal user's login.
function createAuthClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Name of the PRIVATE Storage bucket that holds evidence files.
const EVIDENCE_BUCKET = 'evidence';

module.exports = { supabase, createAuthClient, EVIDENCE_BUCKET };
