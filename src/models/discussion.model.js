


import { text, uuid, timestamp, pgTable, integer, boolean } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";
import { lessons, courses } from "./course.model.js";

// Main discussions table - like YouTube comments
// Can be lesson-wise (lessonId set) or course-wise (courseId set, lessonId null)
export const discussions = pgTable('discussions', {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }), // For course-level discussions
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }), // For lesson-level discussions (nullable)
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    parentId: uuid('parent_id').references(() => discussions.id, { onDelete: 'cascade' }), // For replies to comments
    content: text('content').notNull(), // Comment content
    likesCount: integer('likes_count').default(0), // Number of likes
    repliesCount: integer('replies_count').default(0), // Number of replies
    isEdited: boolean('is_edited').default(false), // If comment was edited
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Discussion likes table
export const discussionLikes = pgTable('discussion_likes', {
    id: uuid('id').primaryKey().defaultRandom(),
    discussionId: uuid('discussion_id').references(() => discussions.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// User mentions in comments (like @username)
export const discussionMentions = pgTable('discussion_mentions', {
    id: uuid('id').primaryKey().defaultRandom(),
    discussionId: uuid('discussion_id').references(() => discussions.id, { onDelete: 'cascade' }).notNull(),
    mentionedUserId: uuid('mentioned_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    mentionedByUserId: uuid('mentioned_by_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    isRead: boolean('is_read').default(false), // Whether the mention has been read
    createdAt: timestamp('created_at').defaultNow(),
});