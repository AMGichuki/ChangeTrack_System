-- Migration 006: job titles (the "roles" the Admin can add).
-- A job title is a name people see, e.g. "Head of Department", linked to the
-- POWERS of one of our 5 system roles (base_role). The approval chain
-- Lecturer -> Chair -> Dean -> Registrar does not change: powers decide what
-- someone can do, the title is what they are called.
-- Run once in Supabase -> SQL Editor (or with our migration script).

CREATE TABLE IF NOT EXISTS job_titles (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  base_role   TEXT NOT NULL CHECK (base_role IN ('LECTURER', 'CHAIR', 'DEAN', 'REGISTRAR', 'ADMIN')),
  is_builtin  BOOLEAN NOT NULL DEFAULT FALSE,   -- the 5 built-in titles cannot be removed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_titles_name_unique ON job_titles (lower(name));
ALTER TABLE job_titles ENABLE ROW LEVEL SECURITY;  -- like every table: only our server can reach it

-- The 5 built-in titles, one per system role.
INSERT INTO job_titles (name, base_role, is_builtin) VALUES
  ('Lecturer',            'LECTURER',  TRUE),
  ('Chair of Department', 'CHAIR',     TRUE),
  ('Dean',                'DEAN',      TRUE),
  ('Registrar',           'REGISTRAR', TRUE),
  ('Administrator',       'ADMIN',     TRUE)
ON CONFLICT DO NOTHING;

-- Each staff member has a title. Existing staff get the built-in title of their role.
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title_id INT REFERENCES job_titles(id);
UPDATE users u
   SET job_title_id = jt.id
  FROM job_titles jt
 WHERE jt.is_builtin AND jt.base_role = u.role AND u.job_title_id IS NULL;
