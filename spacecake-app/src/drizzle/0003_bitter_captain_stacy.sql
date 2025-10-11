ALTER TABLE "element" RENAME TO "editor";--> statement-breakpoint
ALTER TABLE "editor" DROP CONSTRAINT "element_pane_id_pane_id_fk";
--> statement-breakpoint
ALTER TABLE "editor" DROP CONSTRAINT "element_file_id_file_id_fk";
--> statement-breakpoint
DROP INDEX "element_pane_file_idx";--> statement-breakpoint
ALTER TABLE "editor" ADD CONSTRAINT "editor_pane_id_pane_id_fk" FOREIGN KEY ("pane_id") REFERENCES "public"."pane"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor" ADD CONSTRAINT "editor_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "editor_pane_file_idx" ON "editor" USING btree ("pane_id","file_id");