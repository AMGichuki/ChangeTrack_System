-- Migration 005: every request and every student belongs to a department,
-- and Chairs AND Deans only handle their own department's requests.
-- Run once in Supabase -> SQL Editor (or with our migration script).

-- 1. Academic departments (have lecturers, Chairs, Deans, students, requests)
--    vs offices (Registry, ICT: Registrar and Admin work there).
ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_academic BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE departments SET is_academic = FALSE WHERE name IN ('Registry', 'ICT');

-- 2. The department a request is FOR (chosen by the lecturer).
--    Existing requests get their lecturer's department, so nothing moves.
ALTER TABLE requests ADD COLUMN IF NOT EXISTS department_id INT REFERENCES departments(id);
UPDATE requests r
   SET department_id = u.department_id
  FROM users u
 WHERE u.id = r.lecturer_id AND r.department_id IS NULL;
ALTER TABLE requests ALTER COLUMN department_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_requests_department ON requests(department_id);

-- 3. The department a student belongs to (set by the Admin).
--    Existing students get the department of their latest request (if any).
ALTER TABLE students ADD COLUMN IF NOT EXISTS department_id INT REFERENCES departments(id);
UPDATE students s
   SET department_id = (SELECT r.department_id FROM requests r
                         WHERE r.student_id = s.id ORDER BY r.created_at DESC LIMIT 1)
 WHERE s.department_id IS NULL;
