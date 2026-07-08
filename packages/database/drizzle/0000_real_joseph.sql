CREATE TABLE "memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"tier" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"importance" real DEFAULT 0.5 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"user_id" text DEFAULT 'ceo' NOT NULL,
	CONSTRAINT "memories_scope_check" CHECK ("memories"."scope" IN ('engineering', 'product', 'shared')),
	CONSTRAINT "memories_tier_check" CHECK ("memories"."tier" IN ('core', 'archival', 'episodic', 'recall'))
);
--> statement-breakpoint
CREATE INDEX "memories_embedding_hnsw" ON "memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memories_scope_tier_idx" ON "memories" USING btree ("scope","tier");--> statement-breakpoint
CREATE INDEX "memories_metadata_gin" ON "memories" USING gin ("metadata");--> statement-breakpoint
CREATE INDEX "memories_expires_at_idx" ON "memories" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "memories_created_at_idx" ON "memories" USING btree ("created_at");