-- Update enum type: remove ai_interview, job_matching, custom
-- This migration is safe to run even if ai_configs table doesn't exist
DO $$ 
BEGIN
  -- Only proceed if ai_configs table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_configs') THEN
    -- First, convert column to text
    ALTER TABLE "public"."ai_configs" ALTER COLUMN "use_case" SET DATA TYPE text;
    
    -- Delete any rows with invalid enum values
    DELETE FROM "public"."ai_configs" WHERE "use_case" NOT IN ('generation', 'embedding');
  END IF;
  
  -- Drop old enum type if it exists (safe even if table doesn't exist)
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_use_case') THEN
    DROP TYPE "public"."ai_use_case";
  END IF;
END $$;--> statement-breakpoint
-- Create new enum with only generation and embedding (only if it doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_use_case') THEN
    CREATE TYPE "public"."ai_use_case" AS ENUM('generation', 'embedding');
  END IF;
END $$;--> statement-breakpoint
-- Convert column back to enum if table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_configs') THEN
    ALTER TABLE "public"."ai_configs" ALTER COLUMN "use_case" SET DATA TYPE "public"."ai_use_case" USING "use_case"::"public"."ai_use_case";
  END IF;
END $$;