CREATE TABLE IF NOT EXISTS "admin_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_configs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "ai_feature_mappings" CASCADE;--> statement-breakpoint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'admin_settings_updated_by_users_id_fk'
  ) THEN
    ALTER TABLE "admin_settings" ADD CONSTRAINT "admin_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."ai_provider";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."ai_use_case";