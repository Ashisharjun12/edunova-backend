CREATE TYPE "public"."event_color" AS ENUM('sky', 'amber', 'orange', 'emerald', 'rose', 'violet', 'indigo', 'pink', 'lime', 'cyan');--> statement-breakpoint
CREATE TABLE "course_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"start" timestamp NOT NULL,
	"end" timestamp NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" varchar(255),
	"meeting_link" text,
	"color" "event_color" DEFAULT 'sky' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "course_events" ADD CONSTRAINT "course_events_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_events" ADD CONSTRAINT "course_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;