-- Migration 004: the grades NR and NC are removed from ChangeTrack.
-- Run once in Supabase -> SQL Editor (or with our migration script).

-- 1. The only NR in our data is the SAMPLE request CT-2026-0003 (NR -> C).
--    We change its current grade to I (Incomplete), the closest grade we keep.
UPDATE requests SET current_grade = 'I' WHERE current_grade = 'NR';

-- 2. From now on the database refuses any grade that is not on our list.
--    (The proposed grade must be a final grade, so I is not allowed there.)
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_current_grade_valid;
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_new_grade_valid;
ALTER TABLE requests
  ADD CONSTRAINT requests_current_grade_valid
    CHECK (current_grade IN ('A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F','I')),
  ADD CONSTRAINT requests_new_grade_valid
    CHECK (new_grade IN ('A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F'));
