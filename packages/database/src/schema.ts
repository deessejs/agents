import {
  check,
  index,
  pgTable,
  serial,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
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
    filename: text("filename"),
    metadata: jsonb("metadata").notNull().default({} as Record<string, unknown>),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    userId: text("user_id").notNull().default("ceo"),
  },
  (table) => [
    // Scope CHECK
    check(
      "memories_scope_check",
      sql`${table.scope} IN ('engineering', 'product', 'shared')`,
    ),
    // Tier CHECK
    check(
      "memories_tier_check",
      sql`${table.tier} IN ('core', 'archival', 'episodic', 'recall')`,
    ),
    // Composite filter index
    index("memories_scope_tier_idx").on(table.scope, table.tier),
    // Filename search (B-tree for exact and prefix match)
    index("memories_filename_idx").on(table.filename),
    // JSONB metadata search
    index("memories_metadata_gin").using("gin", table.metadata),
    // B-tree on expires_at
    index("memories_expires_at_idx").on(table.expiresAt),
    // DESC time-range index
    index("memories_created_at_idx").on(table.createdAt),
  ],
);

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
