CREATE TABLE "terminal" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "surface_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cwd_path" text NOT NULL,
  "custom_title" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "terminal" ADD CONSTRAINT "terminal_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
