import { text, uuid, timestamp, varchar, integer, pgTable, pgEnum, boolean } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";
import { courses } from "./course.model.js";

// Review rating enum (1-5 stars)
export const REVIEW_RATING = pgEnum('review_rating', ['1', '2', '3', '4', '5']);

// Reviews table
export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  rating: integer('rating').notNull(), // 1-5 stars
  comment: text('comment'), // Optional comment
  isVerified: boolean('is_verified').default(false), // Verified purchase/enrollment
  likesCount: integer('likes_count').default(0), // Number of likes
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Review likes table
export const reviewLikes = pgTable('review_likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id').references(() => reviews.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Review replies table
export const reviewReplies = pgTable('review_replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id').references(() => reviews.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  parentReplyId: uuid('parent_reply_id').references(() => reviewReplies.id, { onDelete: 'cascade' }), // For nested replies
  comment: text('comment').notNull(),
  likesCount: integer('likes_count').default(0), // Number of likes on reply
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Reply likes table
export const replyLikes = pgTable('reply_likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  replyId: uuid('reply_id').references(() => reviewReplies.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
