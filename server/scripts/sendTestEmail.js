// Checks that real emails work: sends ONE test email to our own Gmail address
// (SMTP_USER in .env). Run with:  npm run test-email
require('dotenv').config({ quiet: true });
process.env.NODE_ENV = 'production'; // no "console mode": it must really send, or fail

const { sendEmail } = require('../services/emailService');

async function main() {
  const to = process.env.SMTP_USER;
  if (!to) {
    console.error('SMTP_USER is empty in .env. Add the Gmail address first.');
    process.exit(1);
  }
  console.log(`Sending a test email to ${to} ...`);
  await sendEmail({
    to,
    subject: 'ChangeTrack test email',
    title: 'Email is working',
    text: 'This is a test from ChangeTrack. If you can read this, email sending works.',
    html: '<p>This is a test from ChangeTrack. If you can read this, email sending works.</p>',
  });
  console.log('Sent. Check the inbox (and the Spam folder) of that Gmail account.');
}

main().catch((err) => {
  console.error('\nThe test email was NOT sent:', err.message);
  if (/not configured/i.test(err.message)) {
    console.error('-> Fill in SMTP_USER and SMTP_APP_PASSWORD in server/.env (not the example values).');
  } else if (/535|Invalid login|Username and Password not accepted/i.test(err.message)) {
    console.error('-> Gmail refused the login. Check the 16-letter App Password (no spaces) and that 2-Step Verification is on.');
  } else if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(err.message)) {
    console.error('-> Could not reach Gmail. Check the internet connection (some networks block email ports).');
  }
  process.exit(1);
});
