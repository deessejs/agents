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
export type Topic =
  | "engineering"
  | "product"
  | "deessejs-errors"
  | "general";
export type Tier = "core" | "archival" | "episodic" | "recall";
export type Visibility = "owner" | "shared" | "public";

// Agent ids. Keep this list in sync with apps/*/package.json names.
// Adding an agent = adding an entry here (no schema migration required).
export type KnownAgentId =
  | "head-of-engineering"
  | "head-of-product"
  | "general-assistant"
  | "deessejs-errors-tech-lead"
  | "home-automation-assistant"
  | "fitness-coach";
export type AgentId = KnownAgentId;
export type AuditAction = "forget" | "share" | "unshare" | "update";

export const KNOWN_AGENT_IDS: readonly KnownAgentId[] = [
  "head-of-engineering",
  "head-of-product",
  "general-assistant",
  "deessejs-errors-tech-lead",
  "home-automation-assistant",
  "fitness-coach",
] as const;

export const TOPIC_VALUES = [
  "engineering",
  "product",
  "deessejs-errors",
  "general",
] as const;
export const TIER_VALUES = ["core", "archival", "episodic", "recall"] as const;
export const VISIBILITY_VALUES = ["owner", "shared", "public"] as const;

// --- memories table ---
export const memories = pgTable(
  "memories",
  {
    id: serial("id").primaryKey(),
    agentId: text("agent_id").notNull().$type<AgentId>(),
    topic: text("topic").notNull().$type<Topic>(),
    tier: text("tier").notNull().$type<Tier>(),
    visibility: text("visibility").notNull().default("owner").$type<Visibility>(),
    visibleTo: text("visible_to").array().$type<AgentId[]>(),
    content: text("content").notNull(),
    filename: text("filename"),
    metadata: jsonb("metadata").notNull().default({} as Record<string, unknown>),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    userId: text("user_id").notNull().default("ceo"),
  },
  (table) => [
    check(
      "memories_topic_check",
      sql`${table.topic} IN ('engineering', 'product', 'deessejs-errors', 'general')`,
    ),
    check(
      "memories_tier_check",
      sql`${table.tier} IN ('core', 'archival', 'episodic', 'recall')`,
    ),
    check(
      "memories_visibility_check",
      sql`${table.visibility} IN ('owner', 'shared', 'public')`,
    ),
    check(
      "memories_visible_to_check",
      sql`(${table.visibility} = 'shared' AND ${table.visibleTo} IS NOT NULL AND array_length(${table.visibleTo}, 1) > 0) OR (${table.visibility} <> 'shared' AND ${table.visibleTo} IS NULL)`,
    ),
    index("memories_agent_tier_idx").on(table.agentId, table.tier),
    index("memories_topic_tier_idx").on(table.topic, table.tier),
    index("memories_visible_to_gin").using("gin", table.visibleTo),
    index("memories_metadata_gin").using("gin", table.metadata),
    index("memories_expires_at_idx").on(table.expiresAt),
    index("memories_created_at_idx").on(table.createdAt),
  ],
);

// --- memory_audit table ---
export const memoryAudit = pgTable(
  "memory_audit",
  {
    id: serial("id").primaryKey(),
    memoryId: serial("memory_id").references(() => memories.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull().$type<AuditAction>(),
    actorAgentId: text("actor_agent_id").notNull().$type<AgentId>(),
    targetAgentId: text("target_agent_id").$type<AgentId>(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "memory_audit_action_check",
      sql`${table.action} IN ('forget', 'share', 'unshare', 'update')`,
    ),
    index("memory_audit_memory_idx").on(table.memoryId),
    index("memory_audit_actor_idx").on(table.actorAgentId),
    index("memory_audit_created_at_idx").on(table.createdAt),
  ],
);

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type MemoryAudit = typeof memoryAudit.$inferSelect;
export type NewMemoryAudit = typeof memoryAudit.$inferInsert;
