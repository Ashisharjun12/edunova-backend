-- Migration: Add linked_event_id column to lessons table
-- This allows lessons to be linked to calendar events

-- Add linked_event_id column to lessons table
ALTER TABLE lessons 
ADD COLUMN IF NOT EXISTS linked_event_id UUID REFERENCES course_events(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_lessons_linked_event_id ON lessons(linked_event_id);

-- Add comment
COMMENT ON COLUMN lessons.linked_event_id IS 'Optional link to a calendar event associated with this lesson';

