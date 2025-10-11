ALTER TABLE "element" DROP CONSTRAINT "element_file_id_file_id_fk";
--> statement-breakpoint
ALTER TABLE "element" ADD CONSTRAINT "element_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;