-- Add indexes to optimize teacher queries
-- These indexes improve performance for teacher dashboard, stats, events, and announcements

-- Indexes for courses table
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id_status ON courses(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);

-- Indexes for enrollments table (used in teacher stats)
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_id ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_created_at ON enrollments(created_at);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id_created_at ON enrollments(course_id, created_at);

-- Indexes for course_events table (used in teacher calendar)
CREATE INDEX IF NOT EXISTS idx_course_events_created_by ON course_events(created_by);
CREATE INDEX IF NOT EXISTS idx_course_events_course_id ON course_events(course_id);
CREATE INDEX IF NOT EXISTS idx_course_events_start ON course_events(start);
CREATE INDEX IF NOT EXISTS idx_course_events_course_id_start ON course_events(course_id, start);
CREATE INDEX IF NOT EXISTS idx_course_events_created_by_start ON course_events(created_by, start);

-- Indexes for announcements table (used in teacher announcements)
CREATE INDEX IF NOT EXISTS idx_announcements_course_id ON announcements(course_id);
CREATE INDEX IF NOT EXISTS idx_announcements_course_id_created_at ON announcements(course_id, created_at);

-- Indexes for assignments table (used in teacher assignments)
CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course_id_created_at ON assignments(course_id, created_at);

-- Indexes for meetings table (used in teacher go-live)
CREATE INDEX IF NOT EXISTS idx_meetings_course_id ON meetings(course_id);
CREATE INDEX IF NOT EXISTS idx_meetings_course_id_created_at ON meetings(course_id, created_at);

-- Indexes for lessons table (used in course queries)
CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_linked_event_id ON lessons(linked_event_id);

