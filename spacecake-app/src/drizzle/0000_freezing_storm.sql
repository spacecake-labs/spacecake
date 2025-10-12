CREATE TYPE "public"."view_kind" AS ENUM('rich', 'source');--> statement-breakpoint
CREATE TABLE "editor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pane_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"view_kind" "view_kind" NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"cid" text NOT NULL,
	"mtime" timestamp NOT NULL,
	"buffer" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pane" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system" (
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"is_open" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "editor" ADD CONSTRAINT "editor_pane_id_pane_id_fk" FOREIGN KEY ("pane_id") REFERENCES "public"."pane"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor" ADD CONSTRAINT "editor_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pane" ADD CONSTRAINT "pane_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "editor_pane_file_idx" ON "editor" USING btree ("pane_id","file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_path_idx" ON "file" USING btree ("path");--> statement-breakpoint
CREATE UNIQUE INDEX "pane_workspace_position_idx" ON "pane" USING btree ("workspace_id","index");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_path_idx" ON "workspace" USING btree ("path");