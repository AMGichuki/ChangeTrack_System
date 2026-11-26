// Scheduled jobs on the live site (Vercel Cron).
// On Vercel there is no always-on server, so our hourly timer (scheduler.js)
// cannot run. Instead Vercel calls GET /api/cron/reminders once a day
// (see vercel.json) and sends our secret: "Authorization: Bearer <CRON_SECRET>".
// Anyone else calling this address gets 401.
const crypto = require('crypto');
const express = require('express');
const { runReminders } = require('../services/reminderService');

const router = express.Router();

function hasCronSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // not set up -> never allowed
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(req.headers.authorization || '');
  // timingSafeEqual: compare without leaking how many characters matched
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

router.get('/reminders', async (req, res, next) => {
  if (!hasCronSecret(req)) return res.status(401).json({ status: 'error', message: 'Not allowed.' });
  if (process.env.REMINDERS_ENABLED === 'false') return res.json({ status: 'ok', message: 'Reminders are switched off.' });
  try {
    const summary = await runReminders();
    console.log(`Cron reminders: checked ${summary.checked}, sent ${summary.reminders.length} reminder(s), ${summary.escalations.length} escalation(s).`);
    res.json({ status: 'ok', ...summary });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
