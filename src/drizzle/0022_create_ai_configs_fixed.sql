-- Create enum types if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_provider') THEN
    CREATE TYPE "public"."ai_provider" AS ENUM('openrouter', 'grok', 'openai', 'anthropic', 'custom');
  END IF;
END $$;--> statement-breakpoint
-- Drop old enum if it exists and create new one with only generation and embedding
DROP TYPE IF EXISTS "public"."ai_use_case";--> statement-breakpoint
CREATE TYPE "public"."ai_use_case" AS ENUM('generation', 'embedding');--> statement-breakpoint
-- Create ai_configs table if it doesn't exist
CREATE TABLE IF NOT EXISTS "public"."ai_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"use_case" "public"."ai_use_case" NOT NULL,
	"name" text NOT NULL,
	"provider" "public"."ai_provider" NOT NULL,
	"base_url" text NOT NULL,
	"api_key" text NOT NULL,
	"model" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);--> statement-breakpoint
-- Create ai_feature_mappings table if it doesn't exist
CREATE TABLE IF NOT EXISTS "public"."ai_feature_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature" text NOT NULL,
	"config_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ai_feature_mappings_feature_unique" UNIQUE("feature")
);--> statement-breakpoint
-- Add foreign key constraint if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ai_feature_mappings_config_id_ai_configs_id_fk'
  ) THEN
    ALTER TABLE "public"."ai_feature_mappings" 
    ADD CONSTRAINT "ai_feature_mappings_config_id_ai_configs_id_fk" 
    FOREIGN KEY ("config_id") 
    REFERENCES "public"."ai_configs"("id") 
    ON DELETE cascade 
    ON UPDATE no action;
  END IF;
END $$;

