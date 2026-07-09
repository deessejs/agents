-- Memory schema refactor: replace `scope` with `agent_id` + `topic` + `visibility` + `visible_to`.
-- See docs/internal/reports/memory-schema-refactor-2026-07-09.md.
--
-- Note: applied after TRUNCATE memories CASCADE (4 rows, user-approved destruction).
-- Each statement separated by `--> statement-breakpoint` per drizzle-kit convention.--> statement-breakpoint

-- 1. Add new columns (with defaults to satisfy NOT NULL on existing rows,
-- defaults are dropped immediately after).
ALTER TABLE "memories" ADD COLUMN "agent_id" text NOT NULL DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "topic" text NOT NULL DEFAULT 'general';--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "visibility" text NOT NULL DEFAULT 'owner';--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "visible_to" text[];--> statement-breakpoint

-- 2. Drop the legacy scope column + its check constraint + index that references it.
ALTER TABLE "memories" DROP CONSTRAINT "memories_scope_check";--> statement-breakpoint
DROP INDEX IF EXISTS "memories_scope_tier_idx";--> statement-breakpoint
ALTER TABLE "memories" DROP COLUMN "scope";--> statement-breakpoint

-- 3. Drop placeholder defaults so agent_id/topic/visibility are not silently set.
ALTER TABLE "memories" ALTER COLUMN "agent_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "topic" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "visibility" DROP DEFAULT;--> statement-breakpoint

-- 4. Add new CHECK constraints.
ALTER TABLE "memories" ADD CONSTRAINT "memories_topic_check" CHECK ("memories"."topic" IN ('engineering', 'product', 'deessejs-errors', 'general'));--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_visibility_check" CHECK ("memories"."visibility" IN ('owner', 'shared', 'public'));--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_visible_to_check" CHECK ((("memories"."visibility" = 'shared' AND "memories"."visible_to" IS NOT NULL AND array_length("memories"."visible_to", 1) > 0)) OR (("memories"."visibility" <> 'shared') AND ("memories"."visible_to" IS NULL)));--> statement-breakpoint

-- 5. New indexes replacing the (scope, tier) one.
CREATE INDEX "memories_agent_tier_idx" ON "memories" USING btree ("agent_id","tier");--> statement-breakpoint
CREATE INDEX "memories_topic_tier_idx" ON "memories" USING btree ("topic","tier");--> statement-breakpoint
CREATE INDEX "memories_visible_to_gin" ON "memories" USING gin ("visible_to");--> statement-breakpoint

-- 6. memory_audit table for cross-agent share/forget/update forensics.
CREATE TABLE "memory_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "memory_id" serial,
  "action" text NOT NULL,
  "actor_agent_id" text NOT NULL,
  "target_agent_id" text,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "memory_audit" ADD CONSTRAINT "memory_audit_action_check" CHECK ("memory_audit"."action" IN ('forget', 'share', 'unshare', 'update'));--> statement-breakpoint
ALTER TABLE "memory_audit" ADD CONSTRAINT "memory_audit_memory_id_memorys_id_fk" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "memory_audit_memory_idx" ON "memory_audit" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_audit_actor_idx" ON "memory_audit" USING btree ("actor_agent_id");--> statement-breakpoint
CREATE INDEX "memory_audit_created_at_idx" ON "memory_audit" USING btree ("created_at");
