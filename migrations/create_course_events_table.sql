-- Create event_color enum
CREATE TYPE event_color AS ENUM (
  'sky',
  'amber',
  'orange',
  'emerald',
  'rose',
  'violet',
  'indigo',
  'pink',
  'lime',
  'cyan'
);

-- Create course_events table
CREATE TABLE IF NOT EXISTS course_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE, -- Made nullable for standalone events
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start TIMESTAMP NOT NULL,
  "end" TIMESTAMP NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  location VARCHAR(255),
  meeting_link TEXT,
  color event_color NOT NULL DEFAULT 'sky',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_course_events_course_id ON course_events(course_id);
CREATE INDEX IF NOT EXISTS idx_course_events_start ON course_events(start);
CREATE INDEX IF NOT EXISTS idx_course_events_created_by ON course_events(created_by);

-- Add comment
COMMENT ON TABLE course_events IS 'Course-specific calendar events created by admins or teachers';

