import { pgTable, uuid, timestamp, varchar, text } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";
import { courses } from "./course.model.js";

// Announcements table
export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

