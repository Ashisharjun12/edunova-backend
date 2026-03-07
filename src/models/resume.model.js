import { text, uuid, jsonb, timestamp, pgTable } from "drizzle-orm/pg-core";
import { users } from "./user.model.js";

export const resumes = pgTable('resumes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileId: text('file_id').notNull(), // ImageKit file ID
  extractedText: text('extracted_text'), // Full extracted text
  summary: text('summary'), // AI-generated resume summary
  processingStatus: text('processing_status').notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed'
  chunks: jsonb('chunks'), // Array of text chunks
  metadata: jsonb('metadata'), // File metadata (size, type, etc.)
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});


