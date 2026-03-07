-- Ensure admin_settings table exists (idempotent - safe if 0022 already created it)
CREATE TABLE IF NOT EXISTS "public"."admin_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_settings_key_unique" UNIQUE("key")
);--> statement-breakpoint
-- Add foreign key constraint if it doesn't exist (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'admin_settings_updated_by_users_id_fk'
  ) THEN
    ALTER TABLE "public"."admin_settings" 
    ADD CONSTRAINT "admin_settings_updated_by_users_id_fk" 
    FOREIGN KEY ("updated_by") 
    REFERENCES "public"."users"("id") 
    ON DELETE set null 
    ON UPDATE no action;
  END IF;
END $$;

