ALTER TABLE "interviews" ADD COLUMN "difficulty_level" text;
ALTER TABLE "interviews" ADD COLUMN "question_generation_status" text DEFAULT 'pending';
ALTER TABLE "interviews" ADD COLUMN "job_id" uuid;
--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint


