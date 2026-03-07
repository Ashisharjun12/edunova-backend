import { pgTable, uuid, timestamp, text, varchar, boolean, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";
import { courses } from "./course.model.js";

// Event color enum
export const EVENT_COLOR = pgEnum('event_color', [
  'sky',
  'amber',
  'orange',
  'emerald',
  'rose',
  'violet',
  'indigo',
  'pink',
  'lime',
  'cyan'
]);

// Event calendar table - for course-specific events and standalone events
// Linked to courses table via courseId (many-to-one relationship)
// One course can have many events
// courseId can be null for standalone events that can be manually associated with courses later
export const courseEvents = pgTable('course_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }), // Made nullable for standalone events
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  start: timestamp('start').notNull(),
  end: timestamp('end').notNull(),
  allDay: boolean('all_day').notNull().default(false),
  location: varchar('location', { length: 255 }),
  meetingLink: text('meeting_link'), // Jitsi meeting link or other video conferencing link
  color: EVENT_COLOR('color').notNull().default('sky'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

