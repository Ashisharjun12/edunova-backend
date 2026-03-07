import { pgTable, uuid, timestamp, text, varchar, boolean, integer, pgEnum, unique } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";
import { courses } from "./course.model.js";

// Meeting type enum - can be course, club, or general
export const MEETING_TYPE = pgEnum('meeting_type', ['course', 'club', 'general']);

// Meeting status enum
export const MEETING_STATUS = pgEnum('meeting_status', ['scheduled', 'live', 'ended', 'cancelled']);

// Meetings table
export const meetings = pgTable('meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }), // Nullable for future club/general meetings
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  meetingType: MEETING_TYPE('meeting_type').notNull().default('course'),
  status: MEETING_STATUS('status').notNull().default('scheduled'),
  roomName: varchar('room_name', { length: 255 }).notNull().unique(), // Jitsi room name
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),
  isRecurring: boolean('is_recurring').default(false),
  recurringPattern: text('recurring_pattern'), // JSON string for recurring pattern
  maxParticipants: integer('max_participants'), // Optional limit
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Meeting participants table - tracks who joined/left
export const meetingParticipants = pgTable('meeting_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: uuid('meeting_id').references(() => meetings.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('participant'), // 'moderator' or 'participant'
  joinedAt: timestamp('joined_at').defaultNow(),
  leftAt: timestamp('left_at'),
  isActive: boolean('is_active').default(true),
}, (table) => ({
  uniqueMeetingUser: unique().on(table.meetingId, table.userId),
}));

