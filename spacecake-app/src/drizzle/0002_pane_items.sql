CREATE TYPE "public"."pane_item_kind" AS ENUM('editor');--> statement-breakpoint
CREATE TABLE "pane_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pane_id" uuid NOT NULL,
	"kind" "pane_item_kind" NOT NULL,
	"editor_id" uuid,
	"index" integer NOT NULL,
	"last_accessed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pane" ADD COLUMN "active_pane_item_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "active_pane_id" uuid;--> statement-breakpoint
ALTER TABLE "pane_item" ADD CONSTRAINT "pane_item_pane_id_pane_id_fk" FOREIGN KEY ("pane_id") REFERENCES "public"."pane"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pane_item" ADD CONSTRAINT "pane_item_editor_id_editor_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."editor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pane_item_pane_position_idx" ON "pane_item" USING btree ("pane_id","index");--> statement-breakpoint
CREATE UNIQUE INDEX "pane_item_pane_editor_idx" ON "pane_item" USING btree ("pane_id","editor_id");--> statement-breakpoint
ALTER TABLE "pane" ADD CONSTRAINT "pane_active_pane_item_id_pane_item_id_fk" FOREIGN KEY ("active_pane_item_id") REFERENCES "public"."pane_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_active_pane_id_pane_id_fk" FOREIGN KEY ("active_pane_id") REFERENCES "public"."pane"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor" DROP COLUMN "index" CASCADE;--> statement-breakpoint
ALTER TABLE "editor" DROP COLUMN "is_active" CASCADE;--> statement-breakpoint
ALTER TABLE "editor" DROP COLUMN "last_accessed_at" CASCADE;--> statement-breakpoint
ALTER TABLE "pane" DROP COLUMN "is_active" CASCADE;
