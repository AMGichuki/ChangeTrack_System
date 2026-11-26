// Reminder emails (Sprint 4):
//   - approver(s) of the waiting stage after N working days   (settings: approver_reminder_days, default 3)
//   - Admin(s) after M working days                           (settings: admin_escalation_days, default 5)
// Each one is sent only ONCE per stage visit: when a request moves on (or comes
// back after a correction) the clock and the reminders start again.
const requestModel = require('../models/requestModel');
const userModel = require('../models/userModel');
const delegationModel = require('../models/delegationModel');
const { workingDaysSince } = require('./requestAccess');
const { sendReminderEmails, sendEscalationEmails } = require('./emailService');

// Who must act at each stage.
const STAGES = {
  WITH_CHAIR: { role: 'CHAIR', label: 'Chair', path: '/chair', ownDepartment: true },
  WITH_DEAN: { role: 'DEAN', label: 'Dean', path: '/dean', ownDepartment: true },
  WITH_REGISTRAR: { role: 'REGISTRAR', label: 'Registrar', path: '/registrar', ownDepartment: false },
};

async function runReminders(now = new Date()) {
  const settings = await requestModel.getSettings();
  const waiting = await requestModel.listWaitingForReminders();
  const summary = { checked: waiting.length, reminders: [], escalations: [] };

  for (const r of waiting) {
    const stage = STAGES[r.status];
    const days = workingDaysSince(r.waiting_since, now);
    const info = { requestNumber: r.request_number, courseCode: r.course_code, days };

    // 1. Remind the approver(s)
    if (days >= settings.approver_reminder_days && (await requestModel.claimReminder(r.id, 'reminded_at', r.waiting_since))) {
      // approvers of this stage + anyone acting for them today
      const emails = await delegationModel.listStageEmails(stage.role, stage.ownDepartment ? r.department_id : null);
      await sendReminderEmails(emails, { ...info, path: stage.path });
      summary.reminders.push(`${r.request_number} -> ${stage.label} (${days} working days)`);
    }

    // 2. Escalate to the Admin(s)
    if (days >= settings.admin_escalation_days && (await requestModel.claimReminder(r.id, 'escalated_at', r.waiting_since))) {
      const admins = await userModel.listActiveEmailsByRole('ADMIN');
      await sendEscalationEmails(admins, { ...info, stageLabel: stage.label });
      summary.escalations.push(`${r.request_number} with ${stage.label} (${days} working days)`);
    }
  }
  return summary;
}

module.exports = { runReminders };
