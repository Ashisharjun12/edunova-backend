import { pgTable, uuid, timestamp, varchar, text, boolean, pgEnum, jsonb, integer } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";
import { courses } from "./course.model.js";

// Notification type enum
export const NOTIFICATION_TYPE = pgEnum('notification_type', ['lesson_added', 'assignment_added', 'announcement', 'manual', 'meeting_started']);

// Notifications table
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // 'lesson_added', 'assignment_added', 'announcement', 'manual', 'meeting_started'
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  metadata: jsonb('metadata'), // Stores related entity IDs (lessonId, assignmentId, etc.)
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  readAt: timestamp('read_at'),
  expiresAt: timestamp('expires_at'), // When the notification expires
  expired: boolean('expired').default(false).notNull(), // Flag to mark as expired
  customExpirationHours: integer('custom_expiration_hours'), // Custom expiration hours set by admin (nullable)
});

