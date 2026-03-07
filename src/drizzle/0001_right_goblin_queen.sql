ALTER TABLE "course_materials" ALTER COLUMN "material_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "course_materials" ALTER COLUMN "material_type" DROP NOT NULL;--> statement-breakpoint
DROP TYPE "public"."course_material_type";