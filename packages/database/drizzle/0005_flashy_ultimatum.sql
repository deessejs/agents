DROP INDEX "memories_filename_idx";--> statement-breakpoint
CREATE INDEX "memories_filename_idx" ON "memories" USING btree ("filename");