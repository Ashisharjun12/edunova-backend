import { pgTable, uuid, varchar, text, integer, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { courses, lessons, quizQuestions, quizOptions } from "./course.model.js";
import { users } from "./user.model.js";

// Assignment type enum
export const ASSIGNMENT_TYPE = pgEnum('assignment_type', ['quiz', 'pdf_upload']);

// Submission status enum
export const SUBMISSION_STATUS = pgEnum('submission_status', ['submitted', 'graded', 'returned']);

// Assignments table
export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }), // Nullable for standalone course assignments
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  type: ASSIGNMENT_TYPE('type').notNull(),
  points: integer('points').default(100),
  dueDate: timestamp('due_date'),
  maxAttempts: integer('max_attempts').default(1),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Assignment submissions table
export const assignmentSubmissions = pgTable('assignment_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').references(() => assignments.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  attemptNumber: integer('attempt_number').notNull().default(1),
  status: SUBMISSION_STATUS('status').notNull().default('submitted'),
  score: integer('score'), // Nullable until graded
  feedback: text('feedback'),
  submittedAt: timestamp('submitted_at').defaultNow(),
  gradedAt: timestamp('graded_at'),
});

// Quiz submissions table (for quiz answers)
export const quizSubmissions = pgTable('quiz_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submission_id').references(() => assignmentSubmissions.id, { onDelete: 'cascade' }).notNull(),
  questionId: uuid('question_id').references(() => quizQuestions.id, { onDelete: 'cascade' }).notNull(),
  selectedOptionId: uuid('selected_option_id').references(() => quizOptions.id, { onDelete: 'cascade' }).notNull(),
  isCorrect: boolean('is_correct').notNull().default(false),
});

// PDF submissions table (for PDF file uploads)
export const pdfSubmissions = pgTable('pdf_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submission_id').references(() => assignmentSubmissions.id, { onDelete: 'cascade' }).notNull(),
  fileUrl: text('file_url').notNull(),
  providerFileId: text('provider_file_id'),
});

