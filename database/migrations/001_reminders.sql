-- Migration 001 (Sprint 4): remember when reminders were sent, so each
-- reminder goes out only ONCE per stage. Safe to run more than once.
--   reminded_at  = last reminder to the approver(s)
--   escalated_at = last escalation email to the Admin
ALTER TABLE requests ADD COLUMN IF NOT EXISTS reminded_at  TIMESTAMPTZ;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
