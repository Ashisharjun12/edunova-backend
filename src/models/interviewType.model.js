import { text, uuid, boolean, timestamp, pgTable } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";

export const interviewTypes = pgTable('interview_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(), // 'hr', 'technical', 'behavioral', 'general', 'telephonic'
  mainType: text('main_type').notNull(), // 'ai_text_voice', 'ai_coding', 'human_to_human'
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

