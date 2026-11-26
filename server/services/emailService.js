// Sends ChangeTrack emails through Gmail (Nodemailer).
// Used now for password reset, and from Sprint 3 for approval notifications.
//
// Privacy rule from our design: emails never contain grades or student names.
//
// If the Gmail settings in .env are not filled in yet, we are in "console mode":
// the email is printed in the server terminal instead of being sent, so we
// can still test. (Never used in production.)
const nodemailer = require('nodemailer');

const { SMTP_USER, SMTP_APP_PASSWORD, NODE_ENV } = process.env;

const isConfigured =
  Boolean(SMTP_USER && SMTP_APP_PASSWORD) &&
  !SMTP_APP_PASSWORD.startsWith('your-') &&
  SMTP_USER !== 'changetrack.demo@gmail.com';

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // encrypted connection
      auth: { user: SMTP_USER, pass: SMTP_APP_PASSWORD },
    })
  : null;

if (!isConfigured && process.env.EMAIL_SILENT !== 'true') {
  console.warn('Email: Gmail is not set up in .env yet, so emails will be PRINTED here instead of sent.');
}

// Wrap the message in a simple branded layout (dark blue + yellow, like the app).
function layout(title, bodyHtml) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #dbe3ef;border-radius:8px;overflow:hidden">
    <div style="background:#0b2a55;color:#ffd43b;font-weight:bold;padding:16px 20px">CHANGETRACK</div>
    <div style="padding:20px;color:#1c2b45">
      <h2 style="color:#0b2a55;margin-top:0">${title}</h2>
      ${bodyHtml}
    </div>
    <div style="background:#f0f4fb;color:#64748b;font-size:12px;padding:12px 20px">
      USIU-Africa · School grade changes. This is an automatic message, please do not reply.
    </div>
  </div>`;
}

async function sendEmail({ to, subject, title, text, html }) {
  const message = {
    from: `"ChangeTrack" <${SMTP_USER}>`,
    to,
    subject,
    text,
    html: layout(title, html),
  };

  // Automated tests set EMAIL_SILENT=true: no emails are sent or printed.
  if (process.env.EMAIL_SILENT === 'true') return;
  if (!isConfigured) {
    if (NODE_ENV === 'production') throw new Error('Email is not configured.');
    console.log('\n========== EMAIL (not sent - console mode) ==========');
    console.log(`To: ${to}\nSubject: ${subject}\n\n${text}`);
    console.log('=====================================================\n');
    return;
  }
  await transporter.sendMail(message);
}

// ---------- The emails ----------

function sendPasswordResetEmail(to, resetLink) {
  return sendEmail({
    to,
    subject: 'Reset your ChangeTrack password',
    title: 'Reset your password',
    text:
      `We received a request to reset your ChangeTrack password.\n\n` +
      `Open this link to choose a new password (it works once and expires in 1 hour):\n${resetLink}\n\n` +
      `If you did not ask for this, you can ignore this email. Your password will not change.`,
    html: `
      <p>We received a request to reset your ChangeTrack password.</p>
      <p style="margin:24px 0">
        <a href="${resetLink}" style="background:#ffd43b;color:#0b2a55;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
          Choose a new password
        </a>
      </p>
      <p style="font-size:13px;color:#64748b">This link works once and expires in 1 hour.
      If you did not ask for this, you can ignore this email. Your password will not change.</p>`,
  });
}

// ---------- Approval chain notifications ----------
// Privacy: only the request number and course code. No grades, no names.

// Make typed text safe to put inside an HTML email.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function appLink(path) {
  return `${process.env.CLIENT_URL || 'http://localhost:5173'}${path}`;
}

function button(link, label) {
  return `<p style="margin:24px 0"><a href="${link}" style="background:#ffd43b;color:#0b2a55;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">${label}</a></p>`;
}

// "A request needs your review" -> next approver(s)
async function sendReviewNeededEmails(recipients, { requestNumber, courseCode, path }) {
  const link = appLink(path);
  for (const to of recipients) {
    await sendEmail({
      to,
      subject: `${requestNumber} · ${courseCode} · A request needs your review`,
      title: 'A request needs your review',
      text: `${requestNumber} · ${courseCode}\nA grade change request is waiting for your decision.\n\nOpen ChangeTrack: ${link}`,
      html: `<p><strong>${escapeHtml(requestNumber)} · ${escapeHtml(courseCode)}</strong></p>
             <p>A grade change request is waiting for your decision.</p>${button(link, 'Open review queue')}`,
    });
  }
}

// "Returned for correction" or "Rejected" -> lecturer, with the reason
async function sendDecisionToLecturerEmail(to, { requestNumber, courseCode, decision, stageLabel, comment }) {
  const returned = decision === 'RETURNED';
  const link = appLink('/lecturer');
  const headline = returned ? 'Returned for correction' : 'Request rejected';
  const action = returned
    ? 'Please correct the request and resubmit it.'
    : 'The request is closed. No further action is possible on it.';
  await sendEmail({
    to,
    subject: `${requestNumber} · ${courseCode} · ${headline}`,
    title: headline,
    text: `${requestNumber} · ${courseCode}\n${headline} by the ${stageLabel}.\n\nReason: ${comment}\n\n${action}\n\nOpen ChangeTrack: ${link}`,
    html: `<p><strong>${escapeHtml(requestNumber)} · ${escapeHtml(courseCode)}</strong></p>
           <p>${headline} by the ${escapeHtml(stageLabel)}.</p>
           <p style="background:#fff4cc;padding:10px 12px;border-radius:6px"><strong>Reason:</strong> ${escapeHtml(comment)}</p>
           <p>${action}</p>${button(link, 'Open my requests')}`,
  });
}

// "Grade posted" -> lecturer and student. Still no grade in the email:
// the student sees the result in the school's grading system.
async function sendGradePostedEmail(recipients, { requestNumber, courseCode }) {
  const link = appLink('/');
  for (const to of recipients) {
    await sendEmail({
      to,
      subject: `${requestNumber} · ${courseCode} · Grade change posted`,
      title: 'Grade change posted',
      text: `${requestNumber} · ${courseCode}
The grade change has been approved by all stages and posted by the Registrar in the school's grading system.

Open ChangeTrack: ${link}`,
      html: `<p><strong>${escapeHtml(requestNumber)} · ${escapeHtml(courseCode)}</strong></p>
             <p>The grade change has been approved by all stages and posted by the Registrar in the school's grading system.</p>${button(link, 'Open ChangeTrack')}`,
    });
  }
}

// ---------- Reminders ----------

// Reminder to the approver(s) of the stage where the request is waiting.
async function sendReminderEmails(recipients, { requestNumber, courseCode, days, path }) {
  const link = appLink(path);
  for (const to of recipients) {
    await sendEmail({
      to,
      subject: `Reminder: ${requestNumber} · ${courseCode} is waiting for your review`,
      title: 'Reminder: a request is waiting',
      text: `${requestNumber} · ${courseCode}\nThis grade change request has been waiting for your decision for ${days} working days.\n\nOpen ChangeTrack: ${link}`,
      html: `<p><strong>${escapeHtml(requestNumber)} · ${escapeHtml(courseCode)}</strong></p>
             <p>This grade change request has been waiting for your decision for <strong>${days} working days</strong>.</p>${button(link, 'Open review queue')}`,
    });
  }
}

// Escalation to the Admin(s) when a request has waited too long.
async function sendEscalationEmails(recipients, { requestNumber, courseCode, days, stageLabel }) {
  const link = appLink('/admin');
  for (const to of recipients) {
    await sendEmail({
      to,
      subject: `Escalation: ${requestNumber} · ${courseCode} waiting ${days} working days with the ${stageLabel}`,
      title: 'A request needs attention',
      text: `${requestNumber} · ${courseCode}\nThis request has been waiting ${days} working days with the ${stageLabel}. The approver has already been reminded.\nYou may want to follow up or set an acting approver.\n\nOpen ChangeTrack: ${link}`,
      html: `<p><strong>${escapeHtml(requestNumber)} · ${escapeHtml(courseCode)}</strong></p>
             <p>This request has been waiting <strong>${days} working days</strong> with the ${escapeHtml(stageLabel)}. The approver has already been reminded.</p>
             <p>You may want to follow up or set an acting approver.</p>${button(link, 'Open admin overview')}`,
    });
  }
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendReviewNeededEmails,
  sendDecisionToLecturerEmail,
  sendGradePostedEmail,
  sendReminderEmails,
  sendEscalationEmails,
  isConfigured,
};
