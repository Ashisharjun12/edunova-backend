import { pgTable, uuid, timestamp, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";
import { courses, lessons } from "./course.model.js";



export const enrollments = pgTable('enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  progressPercent: integer('progress_percent').notNull().default(0),
  lastAccessedLessonId: uuid('last_accessed_lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [
  uniqueIndex('enrollment_unique_user_course').on(t.userId, t.courseId)
])

// Per-lesson completion state for each enrollment
export const enrollmentLessons = pgTable('enrollment_lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').references(() => enrollments.id, { onDelete: 'cascade' }).notNull(),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }).notNull(),
  completed: boolean('completed').notNull().default(false),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [
  uniqueIndex('enrollment_lesson_unique').on(t.enrollmentId, t.lessonId)
])