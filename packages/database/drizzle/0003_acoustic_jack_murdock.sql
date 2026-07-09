DROP INDEX "memories_embedding_hnsw";--> statement-breakpoint
ALTER TABLE "memories" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "memories" DROP COLUMN "importance";