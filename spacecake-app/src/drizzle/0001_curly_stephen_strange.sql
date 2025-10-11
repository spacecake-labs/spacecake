ALTER TABLE "element" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "element" ADD COLUMN "last_accessed_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pane" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pane" ADD COLUMN "last_accessed_at" timestamp DEFAULT now() NOT NULL;