// Runs the reminder check automatically: 1 minute after the server starts,
// then every hour. Turn it off with REMINDERS_ENABLED=false in .env.
const { runReminders } = require('./reminderService');

const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * ONE_MINUTE;

function startReminderSchedule() {
  if (process.env.REMINDERS_ENABLED === 'false') {
    console.log('Reminders: switched off (REMINDERS_ENABLED=false).');
    return;
  }

  let running = false; // never run two checks at the same time
  async function check() {
    if (running) return;
    running = true;
    try {
      const summary = await runReminders();
      const sent = summary.reminders.length + summary.escalations.length;
      if (sent > 0) {
        console.log(`Reminders: sent ${summary.reminders.length} reminder(s) and ${summary.escalations.length} escalation(s).`);
      }
    } catch (err) {
      console.error('Reminders: check failed:', err.message);
    } finally {
      running = false;
    }
  }

  setTimeout(check, ONE_MINUTE);
  setInterval(check, ONE_HOUR);
  console.log('Reminders: checking every hour (first check in 1 minute).');
}

module.exports = { startReminderSchedule };
