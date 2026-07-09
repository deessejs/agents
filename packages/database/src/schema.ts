import {
  check,
  index,
  pgTable,
  serial,
  text,
  real,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// --- Types ---
export type Scope = "engineering" | "product" | "shared";
export type Tier = "core" | "archival" | "episodic" | "recall";

// --- Schema ---
export const memories = pgTable(
  "memories",
  {
    id: serial("id").primaryKey(),
    scope: text("scope").notNull() as ReturnType<typeof text> & { _brand: Scope },
    tier: text("tier").notNull() as ReturnType<typeof text> & { _brand: Tier },
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    importance: real("importance").notNull().default(0.5),
    metadata: jsonb("metadata").notNull().default({} as Record<string, unknown>),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    userId: text("user_id").notNull().default("ceo"),
  },
  (table) => [
    // Scope CHECK (manual sql to avoid drizzle-kit bug #3713)
    check(
      "memories_scope_check",
      sql`${table.scope} IN ('engineering', 'product', 'shared')`,
    ),
    // Tier CHECK (manual sql to avoid drizzle-kit bug #3713)
    check(
      "memories_tier_check",
      sql`${table.tier} IN ('core', 'archival', 'episodic', 'recall')`,
    ),
    // HNSW vector search: cosine distance
    index("memories_embedding_hnsw").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    // Composite filter index
    index("memories_scope_tier_idx").on(table.scope, table.tier),
    // JSONB metadata search
    index("memories_metadata_gin").using("gin", table.metadata),
    // B-tree on expires_at (partial index via .where() broken in drizzle-kit — issue #3349)
    index("memories_expires_at_idx").on(table.expiresAt),
    // DESC time-range index
    index("memories_created_at_idx").on(table.createdAt),
  ],
);

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
