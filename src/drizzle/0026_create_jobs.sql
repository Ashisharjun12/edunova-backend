-- Create jobs table
CREATE TABLE IF NOT EXISTS "public"."jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text,
  "department" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Add foreign key constraint
ALTER TABLE "public"."jobs" 
ADD CONSTRAINT "jobs_created_by_users_id_fk" 
FOREIGN KEY ("created_by") 
REFERENCES "public"."users"("id") 
ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "jobs_is_active_idx" ON "public"."jobs"("is_active");
CREATE INDEX IF NOT EXISTS "jobs_created_by_idx" ON "public"."jobs"("created_by");
CREATE INDEX IF NOT EXISTS "jobs_name_idx" ON "public"."jobs"("name");

