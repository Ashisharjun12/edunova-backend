CREATE TABLE "ai_feature_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature" text NOT NULL,
	"config_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ai_feature_mappings_feature_unique" UNIQUE("feature")
);
--> statement-breakpoint
ALTER TABLE "ai_feature_mappings" ADD CONSTRAINT "ai_feature_mappings_config_id_ai_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."ai_configs"("id") ON DELETE cascade ON UPDATE no action;