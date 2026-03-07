-- Create meeting_type enum
CREATE TYPE meeting_type AS ENUM (
  'course',
  'club',
  'general'
);

-- Create meeting_status enum
CREATE TYPE meeting_status AS ENUM (
  'scheduled',
  'live',
  'ended',
  'cancelled'
);

-- Create meetings table
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  meeting_type meeting_type NOT NULL DEFAULT 'course',
  status meeting_status NOT NULL DEFAULT 'scheduled',
  room_name VARCHAR(255) NOT NULL UNIQUE,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  is_recurring BOOLEAN DEFAULT false,
  recurring_pattern TEXT,
  max_participants INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create meeting_participants table
CREATE TABLE IF NOT EXISTS meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'participant',
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(meeting_id, user_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_meetings_course_id ON meetings(course_id);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON meetings(created_by);
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting_id ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user_id ON meeting_participants(user_id);

-- Add comments
COMMENT ON TABLE meetings IS 'Jitsi Meet meetings linked to courses or other entities';
COMMENT ON TABLE meeting_participants IS 'Tracks meeting participants and their roles';


