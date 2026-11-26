-- Migration 003: student IDs are numbers only (e.g. 102341 instead of S-102341).
-- Run once in Supabase -> SQL Editor (or with our migration script).

-- 1. Remove anything that is not a digit from the existing IDs: S-102341 -> 102341
UPDATE students
   SET student_number = regexp_replace(student_number, '[^0-9]', '', 'g')
 WHERE student_number ~ '[^0-9]';

-- 2. From now on the database itself refuses an ID that is not all digits.
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_number_digits;
ALTER TABLE students
  ADD CONSTRAINT students_number_digits CHECK (student_number ~ '^[0-9]{1,20}$');
