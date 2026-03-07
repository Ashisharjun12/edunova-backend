ALTER TABLE "discussions" ALTER COLUMN "lesson_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "discussions" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "discussions" ADD CONSTRAINT "discussions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;