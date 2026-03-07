-- Create assignment_type enum
CREATE TYPE assignment_type AS ENUM ('quiz', 'pdf_upload');

-- Create submission_status enum
CREATE TYPE submission_status AS ENUM ('submitted', 'graded', 'returned');

-- Create assignments table
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type assignment_type NOT NULL,
  points INTEGER DEFAULT 100,
  due_date TIMESTAMP,
  max_attempts INTEGER DEFAULT 1,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create assignment_submissions table
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status submission_status NOT NULL DEFAULT 'submitted',
  score INTEGER,
  feedback TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  graded_at TIMESTAMP
);

-- Create quiz_submissions table
CREATE TABLE IF NOT EXISTS quiz_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_option_id UUID NOT NULL REFERENCES quiz_options(id) ON DELETE CASCADE,
  is_correct BOOLEAN NOT NULL DEFAULT false
);

-- Create pdf_submissions table
CREATE TABLE IF NOT EXISTS pdf_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  provider_file_id TEXT
);

-- Modify quiz_questions table to support assignments
-- Make section_id nullable (for backward compatibility)
ALTER TABLE quiz_questions ALTER COLUMN section_id DROP NOT NULL;

-- Add lesson_id column (nullable)
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE;

-- Add assignment_id column (nullable, foreign key added separately to avoid circular dependency)
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS assignment_id UUID;

-- Add points column
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 10;

-- Add foreign key constraint for assignment_id (after assignments table is created)
ALTER TABLE quiz_questions 
  ADD CONSTRAINT fk_quiz_questions_assignment_id 
  FOREIGN KEY (assignment_id) 
  REFERENCES assignments(id) 
  ON DELETE CASCADE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_lesson_id ON assignments(lesson_id);
CREATE INDEX IF NOT EXISTS idx_assignments_created_by ON assignments(created_by);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_id ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_user_id ON assignment_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_submission_id ON quiz_submissions(submission_id);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_question_id ON quiz_submissions(question_id);
CREATE INDEX IF NOT EXISTS idx_pdf_submissions_submission_id ON pdf_submissions(submission_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_assignment_id ON quiz_questions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_lesson_id ON quiz_questions(lesson_id);

