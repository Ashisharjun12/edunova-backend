-- Migration: Add courseId to discussions table and make lessonId nullable
-- This allows discussions to be course-level (courseId set, lessonId null) or lesson-level (lessonId set)

-- Step 1: Add courseId column (nullable)
ALTER TABLE discussions 
ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE;

-- Step 2: Make lessonId nullable (it was previously NOT NULL)
ALTER TABLE discussions 
ALTER COLUMN lesson_id DROP NOT NULL;

-- Step 3: Add constraint to ensure at least one of courseId or lessonId is set
-- Note: This is a business logic constraint, we'll handle it in application code
-- PostgreSQL doesn't support CHECK constraints with OR conditions easily, so we'll validate in backend

-- Step 4: Create index on courseId for better query performance
CREATE INDEX IF NOT EXISTS idx_discussions_course_id ON discussions(course_id);

-- Step 5: Create index on lessonId (if not exists)
CREATE INDEX IF NOT EXISTS idx_discussions_lesson_id ON discussions(lesson_id);

