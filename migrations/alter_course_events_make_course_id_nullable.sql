-- Migration: Make course_id nullable in course_events table
-- This allows events to exist without being associated with a course (standalone events)

-- Drop the NOT NULL constraint on course_id
ALTER TABLE course_events 
ALTER COLUMN course_id DROP NOT NULL;

-- Update comment to reflect the change
COMMENT ON TABLE course_events IS 'Calendar events created by admins or teachers. Can be associated with a course or standalone.';

