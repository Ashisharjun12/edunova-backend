import { text, uuid, timestamp, varchar, integer, boolean, pgTable, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";
import { images } from "./document.model.js";
import { branches, semesters, subjects } from "./branch.model.js";
import { courseEvents } from "./eventcalender.model.js";

// Course status enum
export const COURSE_STATUS = pgEnum('course_status', ['draft', 'published', 'unpublished']);

// Course difficulty enum
export const COURSE_DIFFICULTY = pgEnum('course_difficulty', ['beginner', 'intermediate', 'advanced']);

// Lesson type enum - simplified for YouTube focus
export const LESSON_TYPE = pgEnum('lesson_type', ['youtube_video', 'youtube_embed']);

// Courses table
export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
  semesterId: uuid('semester_id').references(() => semesters.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  shortDescription: varchar('short_description', { length: 500 }),
  thumbnailId: uuid('thumbnail_id').references(() => images.id, { onDelete: 'set null' }),
  status: COURSE_STATUS('status').notNull().default('draft'),
  difficulty: COURSE_DIFFICULTY('difficulty').notNull().default('beginner'),
  price: integer('price').default(0), // Price in cents
  duration: integer('duration').default(0), // Total duration in seconds
  studentCount: integer('student_count').default(0),
  rating: integer('rating').default(0), // Average rating (0-5)
  ratingCount: integer('rating_count').default(0),
  tags: jsonb('tags'), // Array of tags
  requirements: jsonb('requirements'), // Array of requirements
  learningOutcomes: jsonb('learning_outcomes'), // Array of learning outcomes
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  publishedAt: timestamp('published_at'),
});

// Note: Course events are linked via courseEvents table (see eventcalender.model.js)
// Each course can have multiple events (one-to-many relationship)
// Foreign key: courseEvents.courseId -> courses.id

// Sections within a course
export const sections = pgTable('sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});


// Lessons table - simplified for YouTube videos
export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  lessonType: LESSON_TYPE('lesson_type').notNull().default('youtube_video'),
  position: integer('position').notNull().default(0),
  duration: integer('duration').default(0), 
  // YouTube video details
  youtubeVideoId: text('youtube_video_id'), // YouTube video ID
  youtubeUrl: text('youtube_url'), // Direct YouTube URL
  youtubeEmbedUrl: text('youtube_embed_url'), // YouTube embed URL
  youtubeTitle: text('youtube_title'), // YouTube video title
  youtubeDescription: text('youtube_description'), // YouTube video description
  youtubeThumbnail: text('youtube_thumbnail'), // YouTube thumbnail URL
  youtubeDuration: integer('youtube_duration'), // YouTube video duration in seconds
  linkedEventId: uuid('linked_event_id').references(() => courseEvents.id, { onDelete: 'set null' }), // Link to course event (can be null)
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Course materials table for PDFs, images, links
export const courseMaterials = pgTable('course_materials', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }),
  sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  // store type as text to avoid enum mismatch issues ('external_url' | 'file')
  materialType: text('material_type'),
  // Optional provider fields for ImageKit or external URLs
  fileUrl: text('file_url'),
  providerFileId: text('provider_file_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});


// Quiz tables - can be linked to section (legacy) or lesson/assignment (new)
export const quizQuestions = pgTable('quiz_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'cascade' }), // Made nullable for lesson-based quizzes
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }), // New: for lesson-based quizzes
  assignmentId: uuid('assignment_id'), // New: references assignments table (handled in migration to avoid circular dependency)
  question: text('question').notNull(),
  explanation: text('explanation'),
  points: integer('points').default(10), // Points for this question
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const quizOptions = pgTable('quiz_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id').references(() => quizQuestions.id, { onDelete: 'cascade' }).notNull(),
  text: text('text').notNull(),
  isCorrect: boolean('is_correct').notNull().default(false),
});
