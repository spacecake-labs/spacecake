CREATE TYPE "public"."diff_kind" AS ENUM('unified', 'split');--> statement-breakpoint
ALTER TYPE "public"."view_kind" ADD VALUE 'diff';--> statement-breakpoint
ALTER TABLE "editor" ADD COLUMN "base_ref" text;--> statement-breakpoint
ALTER TABLE "editor" ADD COLUMN "target_ref" text;--> statement-breakpoint
ALTER TABLE "editor" ADD COLUMN "diff_kind" "diff_kind";
