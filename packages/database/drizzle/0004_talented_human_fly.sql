ALTER TABLE "memories" ADD COLUMN "filename" text;--> statement-breakpoint
CREATE INDEX "memories_filename_idx" ON "memories" USING gin ("filename" gin_trgm_ops);