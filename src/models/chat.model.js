import { pgTable, uuid, text, timestamp, boolean, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";
import { courses } from "./course.model.js";

// Sender role enum for chat messages
export const SENDER_ROLE = pgEnum('sender_role', ['teacher', 'student']);

// Conversations table - one-on-one conversations between teacher and student per course
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  lastMessageAt: timestamp('last_message_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Unique constraint: one conversation per course-teacher-student combination
  uniqueConversation: uniqueIndex('conversation_unique_course_teacher_student').on(
    table.courseId,
    table.teacherId,
    table.studentId
  ),
  // Indexes for efficient queries
  courseIdIdx: index('conversations_course_id_idx').on(table.courseId),
  teacherIdIdx: index('conversations_teacher_id_idx').on(table.teacherId),
  studentIdIdx: index('conversations_student_id_idx').on(table.studentId),
  // Composite indexes for better query performance (scalability)
  teacherLastMsgIdx: index('idx_conversations_teacher_lastmsg').on(table.teacherId, table.lastMessageAt),
  studentLastMsgIdx: index('idx_conversations_student_lastmsg').on(table.studentId, table.lastMessageAt),
}));

// Chat messages table
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  senderRole: SENDER_ROLE('sender_role').notNull(), // 'teacher' or 'student'
  content: text('content').notNull(),
  isRead: boolean('is_read').default(false).notNull(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // Indexes for efficient queries
  conversationIdIdx: index('chat_messages_conversation_id_idx').on(table.conversationId),
  createdAtIdx: index('chat_messages_created_at_idx').on(table.createdAt),
  senderIdIdx: index('chat_messages_sender_id_idx').on(table.senderId),
  isReadIdx: index('chat_messages_is_read_idx').on(table.isRead),
  // Composite indexes for better query performance (scalability)
  convReadRoleIdx: index('idx_chat_messages_conv_read_role').on(table.conversationId, table.isRead, table.senderRole),
  convCreatedIdx: index('idx_chat_messages_conv_created').on(table.conversationId, table.createdAt),
}));

