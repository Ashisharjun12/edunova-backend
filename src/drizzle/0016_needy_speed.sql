ALTER TABLE "notifications" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "expired" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "custom_expiration_hours" integer;