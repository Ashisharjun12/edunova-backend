ALTER TABLE "quiz_questions" ALTER COLUMN "section_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "lesson_id" uuid;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "points" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;