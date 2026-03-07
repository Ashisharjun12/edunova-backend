-- Initialize default theme setting
INSERT INTO "public"."admin_settings" ("key", "value", "created_at", "updated_at")
VALUES (
  'color_theme',
  '{"colorTheme": "default", "mode": "system"}'::jsonb,
  now(),
  now()
)
ON CONFLICT ("key") DO NOTHING;

