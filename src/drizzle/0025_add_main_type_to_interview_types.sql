-- Add main_type column to interview_types table
ALTER TABLE "public"."interview_types" 
ADD COLUMN IF NOT EXISTS "main_type" text NOT NULL DEFAULT 'ai_text_voice';

-- Update existing records (if any) to have a default main_type
UPDATE "public"."interview_types" 
SET "main_type" = 'ai_text_voice' 
WHERE "main_type" IS NULL;


