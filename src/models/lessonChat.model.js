import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";
import { lessons } from "./course.model.js";

// A chat session scoped to a specific lesson and user
export const lessonChats = pgTable('lesson_chats', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }).notNull(),
  title: text('title'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Messages within a lesson chat (simple text for now)
export const lessonChatMessages = pgTable('lesson_chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id').references(() => lessonChats.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});


