import { integer, pgEnum, pgTable, varchar } from "drizzle-orm/pg-core";
import { uuid, text, timestamp } from "drizzle-orm/pg-core";

// Simplified image types for course creation
const IMAGE_STATUS = pgEnum('image_status', ['processing', 'done', 'failed']);
const IMAGE_TYPE = pgEnum('image_type', ['profile', 'course_thumbnail', 'college_logo']);

// Images table - simplified for course thumbnails and profiles
export const images = pgTable('images', {
    id: uuid('id').primaryKey().defaultRandom(),
    imageType: IMAGE_TYPE('image_type').notNull(),
    imageStatus: IMAGE_STATUS('image_status').notNull().default('processing'),
    url: text('url'), 
    fileId: text('file_id'), 
    filePath: text('file_path'), 
    size: integer('size'), 
    createdAt: timestamp('created_at').defaultNow(),
});