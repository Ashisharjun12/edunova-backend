CREATE TYPE "public"."ai_provider" AS ENUM('openrouter', 'grok', 'openai', 'anthropic', 'custom');--> statement-breakpoint
CREATE TYPE "public"."ai_use_case" AS ENUM('generation', 'embedding', 'ai_interview', 'job_matching', 'custom');--> statement-breakpoint
CREATE TABLE "ai_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"use_case" "ai_use_case" NOT NULL,
	"name" text NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"base_url" text NOT NULL,
	"api_key" text NOT NULL,
	"model" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
