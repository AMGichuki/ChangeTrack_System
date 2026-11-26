// FOR TESTING ONLY.
// Gives every SAMPLE account (changetrack.usiu+...@gmail.com) a Supabase login
// with the same test password, and links it to their row (auth_id).
// Accounts of real people (any other email) are never changed.
// Run with:  npm run test-logins
//
// No emails are sent by this script. Before the real launch we
// delete these test accounts; real accounts are created by the Admin.
require('dotenv').config({ quiet: true });
const db = require('../config/db');
const { supabase } = require('../config/supabase');

const TEST_PASSWORD = process.env.TEST_PASSWORD || 'ChangeTrack@2026';

// Find an existing Supabase login by email (used if the script is run twice).
async function findAuthUserByEmail(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureLogin(email) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true, // mark as confirmed so no email is needed
  });
  if (!error) return data.user.id;

  const existing = await findAuthUserByEmail(email);
  if (!existing) throw error;
  // Already there: reset the password so everyone knows the test password.
  await supabase.auth.admin.updateUserById(existing.id, { password: TEST_PASSWORD });
  return existing.id;
}

async function main() {
  // ONLY the sample accounts (Gmail "+" addresses of the project inbox).
  // Real people's accounts are never touched, so their passwords stay theirs.
  const SAMPLE = 'changetrack.usiu+%@gmail.com';
  const people = (await db.query(`
    SELECT 'users' AS tbl, id, email, role FROM users WHERE email LIKE $1 AND email NOT LIKE '%+ittest-%'
    UNION ALL
    SELECT 'students', id, email, 'STUDENT' FROM students WHERE email LIKE $1 AND email NOT LIKE '%+ittest-%'
    ORDER BY tbl, id
  `, [SAMPLE])).rows;

  console.log(`Creating test logins (password: ${TEST_PASSWORD})\n`);
  for (const p of people) {
    const authId = await ensureLogin(p.email);
    // tbl comes from our own query above (only 'users' or 'students'), never from user input.
    await db.query(`UPDATE ${p.tbl} SET auth_id = $1 WHERE id = $2`, [authId, p.id]);
    console.log(`  ${p.role.padEnd(10)} ${p.email}`);
  }
  console.log('\nDone. You can now sign in as any of the people above.');
}

main()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.pool.end());
