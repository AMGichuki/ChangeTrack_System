-- Migration 002 (Sprint 5): acting approvers.
-- When someone decides as an ACTING approver (from the DELEGATIONS table),
-- we record whose place they took, so the audit log shows for example:
--   "Approved by Ann Wambui (acting for Peter Kamau)".
-- Empty for normal decisions. Safe to run more than once.
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS acting_for_id INT REFERENCES users(id);

-- Fast lookup of "is this person acting for someone today?"
CREATE INDEX IF NOT EXISTS idx_delegations_delegate ON delegations(delegate_id);
