-- =====================================================================
-- ChangeTrack test data (sample people from our wireframes).
-- Run AFTER schema.sql. Emails are placeholders: before we test real
-- emails, change them to inboxes our team can open.
-- =====================================================================

-- Departments (ids 1-5)
INSERT INTO departments (name, is_academic) VALUES
  ('Science & Technology', TRUE),   -- 1
  ('Business',             TRUE),   -- 2
  ('Humanities',           TRUE),   -- 3
  ('Registry',             FALSE),  -- 4 (office: Registrar)
  ('ICT',                  FALSE);  -- 5 (office: Admin)

-- Emails: Gmail "+" addresses of the project inbox (changetrack.usiu@gmail.com).
-- Gmail delivers everything after the + to that one inbox, so every sample
-- account gets real emails. Swap any for a real person's Gmail in Manage users.
-- Staff users (ids 1-7). auth_id stays empty until we create logins in Sprint 1.
INSERT INTO users (full_name, email, role, department_id) VALUES
  ('Jane Otieno',   'changetrack.usiu+jane@gmail.com',   'LECTURER',  1),  -- 1
  ('Peter Kamau',   'changetrack.usiu+peter@gmail.com',  'CHAIR',     1),  -- 2
  ('Grace Achieng', 'changetrack.usiu+grace@gmail.com',  'DEAN',      1),  -- 3
  ('Mary Njeri',    'changetrack.usiu+mary@gmail.com',   'REGISTRAR', 4),  -- 4
  ('David Maina',   'changetrack.usiu+david@gmail.com',  'ADMIN',     5),  -- 5
  ('Samuel Kiprop', 'changetrack.usiu+samuel@gmail.com', 'LECTURER',  2),  -- 6 (other department, to test "own department only")
  ('Ann Wambui',    'changetrack.usiu+ann@gmail.com',    'CHAIR',     2);  -- 7

-- Built-in job titles, one per system role (the Admin can add more later).
INSERT INTO job_titles (name, base_role, is_builtin) VALUES
  ('Lecturer',            'LECTURER',  TRUE),
  ('Chair of Department', 'CHAIR',     TRUE),
  ('Dean',                'DEAN',      TRUE),
  ('Registrar',           'REGISTRAR', TRUE),
  ('Administrator',       'ADMIN',     TRUE);
UPDATE users u SET job_title_id = jt.id
  FROM job_titles jt WHERE jt.is_builtin AND jt.base_role = u.role;

-- Students (ids 1-3)
INSERT INTO students (student_number, full_name, email, department_id) VALUES
  ('102341', 'Alex Mwangi',    'changetrack.usiu+alex@gmail.com',  1),  -- 1
  ('102728', 'Brian Ochieng',  'changetrack.usiu+brian@gmail.com', 1),  -- 2
  ('102915', 'Faith Wanjiku',  'changetrack.usiu+faith@gmail.com', 1);  -- 3

-- Requests (ids 1-3). request_number is filled in by the trigger.
-- department_id = the department the request is FOR (1 = Science & Technology).
INSERT INTO requests (lecturer_id, student_id, department_id, course_code, section, term,
                      current_grade, new_grade, reason, justification, status, created_at) VALUES
  (1, 1, 1, 'IST 2040', 'A', 'Fall 2026', 'C',  'B', 'ARITHMETIC',
   'The assessment total was calculated incorrectly.', 'RETURNED',  '2026-11-12 09:00+03'),
  (1, 2, 1, 'IST 3010', 'B', 'Fall 2026', 'I',  'B', 'ILLNESS',
   'Student missed the final exam due to illness and sat the make-up exam.', 'WITH_DEAN', '2026-11-11 10:00+03'),
  (1, 3, 1, 'IST 2030', 'A', 'Fall 2026', 'I',  'C', 'OTHER',
   'Grade was not reported on time; marks are now complete.', 'POSTED', '2026-11-05 08:30+03');

-- Evidence (I grades need documents)
INSERT INTO evidence (request_id, file_name, file_path) VALUES
  (2, 'Medical_note_S-102728.pdf',  'requests/2/Medical_note_S-102728.pdf'),
  (3, 'Grade_schedule_IST2030.pdf', 'requests/3/Grade_schedule_IST2030.pdf');

-- Approval history (this is also our audit trail)
INSERT INTO approvals (request_id, approver_id, stage, decision, comment, decided_at) VALUES
  -- Request 1: submitted, then returned by the Chair
  (1, 1, 'LECTURER',  'SUBMITTED', NULL, '2026-11-12 09:00+03'),
  (1, 2, 'CHAIR',     'RETURNED',  'Please attach the supporting grade schedule.', '2026-11-13 10:30+03'),
  -- Request 2: submitted, Chair approved, now with the Dean
  (2, 1, 'LECTURER',  'SUBMITTED', NULL, '2026-11-11 10:00+03'),
  (2, 2, 'CHAIR',     'APPROVED',  NULL, '2026-11-12 14:00+03'),
  -- Request 3: went all the way and was posted
  (3, 1, 'LECTURER',  'SUBMITTED', NULL, '2026-11-05 08:30+03'),
  (3, 2, 'CHAIR',     'APPROVED',  NULL, '2026-11-06 11:00+03'),
  (3, 3, 'DEAN',      'APPROVED',  NULL, '2026-11-07 09:15+03'),
  (3, 4, 'REGISTRAR', 'POSTED',    NULL, '2026-11-09 15:20+03');

-- Default reminder settings (3 working days, 5 days)
INSERT INTO settings DEFAULT VALUES;
