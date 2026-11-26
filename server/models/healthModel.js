// MODEL: talks to the database. No HTTP code here.
const db = require('../config/db');

async function checkDatabase() {
  const { rows } = await db.query(`
    SELECT now() AS server_time,
           (SELECT count(*)::int FROM departments) AS departments,
           (SELECT count(*)::int FROM users)       AS users,
           (SELECT count(*)::int FROM students)    AS students,
           (SELECT count(*)::int FROM requests)    AS requests
  `);
  return rows[0];
}

module.exports = { checkDatabase };
