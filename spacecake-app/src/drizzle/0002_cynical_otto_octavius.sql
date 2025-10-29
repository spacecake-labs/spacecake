ALTER TABLE "editor" ALTER COLUMN "last_accessed_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "editor" ALTER COLUMN "last_accessed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "file" ALTER COLUMN "last_accessed_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "file" ALTER COLUMN "last_accessed_at" DROP NOT NULL;