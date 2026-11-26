-- =====================================================================
-- ChangeTrack database schema (PostgreSQL on Supabase)
-- Run this whole file once in Supabase: SQL Editor -> New query -> Run.
-- 8 tables, in 3NF. Changes from the first ERD are marked "NEW".
-- =====================================================================

-- Start clean (safe to re-run while we are still building).
DROP TABLE IF EXISTS delegations, settings, approvals, evidence, requests, students, users, job_titles, departments CASCADE;

-- ---------------------------------------------------------------------
-- 1. DEPARTMENTS
-- ---------------------------------------------------------------------
CREATE TABLE departments (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  is_academic  BOOLEAN NOT NULL DEFAULT TRUE  -- FALSE for offices (Registry, ICT): no lecturers, Chairs, Deans, students or requests
);

-- ---------------------------------------------------------------------
-- 1b. JOB TITLES (the "roles" the Admin adds, e.g. "Head of Department")
-- Each title has the POWERS of one system role (base_role). The approval
-- chain only looks at powers; the title is what people are called.
-- ---------------------------------------------------------------------
CREATE TABLE job_titles (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  base_role   TEXT NOT NULL CHECK (base_role IN ('LECTURER', 'CHAIR', 'DEAN', 'REGISTRAR', 'ADMIN')),
  is_builtin  BOOLEAN NOT NULL DEFAULT FALSE,   -- the 5 built-in titles cannot be removed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX job_titles_name_unique ON job_titles (lower(name));

-- ---------------------------------------------------------------------
-- 2. USERS (staff: Lecturer, Chair, Dean, Registrar, Admin)
-- Passwords are NOT stored here. Supabase Auth stores them hashed.
-- auth_id links this row to the person's Supabase Auth login.
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  auth_id        UUID UNIQUE,                                   -- NEW
  full_name      TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  role           TEXT NOT NULL
                 CHECK (role IN ('LECTURER', 'CHAIR', 'DEAN', 'REGISTRAR', 'ADMIN')),
  department_id  INT NOT NULL REFERENCES departments(id),
  job_title_id   INT REFERENCES job_titles(id),                 -- the title people see; powers come from role
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,                 -- NEW (disable instead of delete)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()             -- NEW
);

-- ---------------------------------------------------------------------
-- 3. STUDENTS (view progress only)
-- ---------------------------------------------------------------------
CREATE TABLE students (
  id              SERIAL PRIMARY KEY,
  auth_id         UUID UNIQUE,                                  -- NEW
  student_number  TEXT NOT NULL UNIQUE
                  CONSTRAINT students_number_digits CHECK (student_number ~ '^[0-9]{1,20}$'), -- numbers only, e.g. 102341
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  department_id   INT REFERENCES departments(id),               -- the student's department (set by the Admin)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()            -- NEW
);

-- ---------------------------------------------------------------------
-- 4. REQUESTS (one grade change request)
-- ---------------------------------------------------------------------
CREATE TABLE requests (
  id              SERIAL PRIMARY KEY,
  request_number  TEXT UNIQUE,                                  -- NEW e.g. CT-2026-0001 (filled by trigger below)
  lecturer_id     INT NOT NULL REFERENCES users(id),
  student_id      INT NOT NULL REFERENCES students(id),
  department_id   INT NOT NULL REFERENCES departments(id),      -- the department the request is FOR (its Chair and Dean decide)
  course_code     TEXT NOT NULL,
  section         TEXT NOT NULL,                                -- NEW
  term            TEXT NOT NULL,                                -- e.g. 'Fall 2026'
  current_grade   TEXT NOT NULL,
  new_grade       TEXT NOT NULL,
  reason          TEXT NOT NULL
                  CHECK (reason IN ('ILLNESS', 'DEATH', 'ARITHMETIC', 'OTHER')),
  justification   TEXT NOT NULL,                                -- NEW
  status          TEXT NOT NULL DEFAULT 'WITH_CHAIR'
                  CHECK (status IN ('WITH_CHAIR', 'WITH_DEAN', 'WITH_REGISTRAR',
                                    'POSTED', 'RETURNED', 'REJECTED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),           -- NEW (the "Submitted" date)
  reminded_at     TIMESTAMPTZ,                                  -- Sprint 4: last reminder to approver
  escalated_at    TIMESTAMPTZ,                                  -- Sprint 4: last escalation to Admin
  CHECK (current_grade <> new_grade),
  -- Our grade list (NR and NC are not used). The new grade must be final, so no I.
  CONSTRAINT requests_current_grade_valid
    CHECK (current_grade IN ('A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F','I')),
  CONSTRAINT requests_new_grade_valid
    CHECK (new_grade IN ('A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F'))
);

-- Gives every new request a readable number: CT-<year>-<id with 4 digits>.
CREATE OR REPLACE FUNCTION set_request_number() RETURNS TRIGGER AS $$
BEGIN
  NEW.request_number := 'CT-' || to_char(now(), 'YYYY') || '-' || lpad(NEW.id::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_request_number
  BEFORE INSERT ON requests
  FOR EACH ROW EXECUTE FUNCTION set_request_number();

-- ---------------------------------------------------------------------
-- 5. EVIDENCE (files are kept in a PRIVATE Supabase Storage bucket)
-- ---------------------------------------------------------------------
CREATE TABLE evidence (
  id           SERIAL PRIMARY KEY,
  request_id   INT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,                                   -- name the user sees
  file_path    TEXT NOT NULL,                                   -- NEW: where the file sits in Storage
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()               -- NEW
);

-- ---------------------------------------------------------------------
-- 6. APPROVALS (every decision = the audit record)
-- The lecturer's submit is also saved here (stage LECTURER), so the
-- student tracker can show "Submitted · 12 Nov".
-- ---------------------------------------------------------------------
CREATE TABLE approvals (
  id           SERIAL PRIMARY KEY,
  request_id   INT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  approver_id  INT NOT NULL REFERENCES users(id),
  stage        TEXT NOT NULL
               CHECK (stage IN ('LECTURER', 'CHAIR', 'DEAN', 'REGISTRAR')),
  decision     TEXT NOT NULL
               CHECK (decision IN ('SUBMITTED', 'RESUBMITTED', 'APPROVED',
                                   'RETURNED', 'REJECTED', 'POSTED')),
  comment      TEXT,
  decided_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  acting_for_id INT REFERENCES users(id),                -- Sprint 5: set when an ACTING approver decided
  -- A comment is required when returning or rejecting.
  CHECK (decision NOT IN ('RETURNED', 'REJECTED') OR (comment IS NOT NULL AND length(trim(comment)) > 0))
);

-- ---------------------------------------------------------------------
-- 7. SETTINGS (NEW) - reminder timing from the Admin "Controls" screen.
-- Only one row is allowed (id is always 1).
-- ---------------------------------------------------------------------
CREATE TABLE settings (
  id                      INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  approver_reminder_days  INT NOT NULL DEFAULT 3 CHECK (approver_reminder_days > 0),
  admin_escalation_days   INT NOT NULL DEFAULT 5 CHECK (admin_escalation_days > 0),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 8. DELEGATIONS (NEW) - acting approver while someone is away.
-- ---------------------------------------------------------------------
CREATE TABLE delegations (
  id           SERIAL PRIMARY KEY,
  approver_id  INT NOT NULL REFERENCES users(id),   -- the person who is away
  delegate_id  INT NOT NULL REFERENCES users(id),   -- the acting approver
  start_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date     DATE,                                -- empty = until removed
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (approver_id <> delegate_id),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ---------------------------------------------------------------------
-- Indexes for the screens we search most (queues and "my requests").
-- ---------------------------------------------------------------------
CREATE INDEX idx_requests_status   ON requests(status);
CREATE INDEX idx_requests_lecturer ON requests(lecturer_id);
CREATE INDEX idx_requests_student  ON requests(student_id);
CREATE INDEX idx_requests_department ON requests(department_id);
CREATE INDEX idx_approvals_request ON approvals(request_id);
CREATE INDEX idx_evidence_request  ON evidence(request_id);
CREATE INDEX idx_delegations_delegate ON delegations(delegate_id);

-- ---------------------------------------------------------------------
-- Security: switch on Row Level Security with NO policies.
-- This blocks the browser from reading tables directly through the
-- public Supabase API. Only our Express server (which uses the private
-- database connection) can read and write. Role checks live in Express.
-- ---------------------------------------------------------------------
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_titles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE students    ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence    ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegations ENABLE ROW LEVEL SECURITY;
