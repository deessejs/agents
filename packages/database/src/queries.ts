import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "./client.js";
import { memories, memoryAudit, type AgentId, type Topic, type Tier, type Visibility } from "./schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchOptions {
  /** Required: who is searching. Determines ownership/visibility filter. */
  agentId: AgentId;
  query: string;
  filename?: string;
  userId?: string;
  scopes?: never; // legacy, ignored
  topics?: Topic[];
  tiers?: Tier[];
  /**
   * If `true` (default), only memories the agent can read are returned.
   * `false` returns every memory regardless of visibility (admin only).
   */
  enforceVisibility?: boolean;
  limit?: number;
}

export interface MemoryRow {
  id: number;
  agentId: AgentId;
  topic: Topic;
  tier: Tier;
  visibility: Visibility;
  visibleTo: AgentId[] | null;
  content: string;
  filename: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Search memories. The `agentId` parameter is the *viewer* — it determines
 * which rows are visible. A row is visible to viewer X if:
 *  - row.agent_id === X (the viewer owns it), OR
 *  - row.visibility === 'public', OR
 *  - row.visibility === 'shared' AND X ∈ row.visible_to
 *
 * Bypassing visibility (`enforceVisibility: false`) is reserved for admin
 * tooling, never for runtime agent code.
 */
export async function searchMemories(opts: SearchOptions): Promise<MemoryRow[]> {
  const {
    agentId: viewerId,
    query,
    filename,
    userId = "ceo",
    topics,
    tiers,
    enforceVisibility = true,
    limit = 10,
  } = opts;

  const conditions: SQL[] = [];

  // Keyword search
  conditions.push(sql`${memories.content} ILIKE ${"%" + query + "%"}`);

  // Filename filter
  if (filename) {
    conditions.push(sql`${memories.filename} ILIKE ${"%" + filename + "%"}`);
  }

  // Standard filters
  conditions.push(eq(memories.userId, userId));
  if (topics?.length) conditions.push(inArray(memories.topic, topics));
  if (tiers?.length) conditions.push(inArray(memories.tier, tiers));

  // Expiry filter — inline to avoid `or()`'s `SQL | undefined` return type
  // not matching the `SQL` expected by `.and()`.
  conditions.push(sql`(${memories.expiresAt} IS NULL OR ${memories.expiresAt} > now())`);

  // Visibility filter (unless bypassed)
  if (enforceVisibility) {
    // Inline to avoid `or()`'s `SQL | undefined` return type vs `SQL` expected.
    conditions.push(sql`(${memories.agentId} = ${viewerId} OR ${memories.visibility} = 'public' OR (${memories.visibility} = 'shared' AND ${viewerId} = ANY(${memories.visibleTo})))`);
  }

  const rows = await getDb()
    .select({
      id: memories.id,
      agentId: memories.agentId,
      topic: memories.topic,
      tier: memories.tier,
      visibility: memories.visibility,
      visibleTo: memories.visibleTo,
      content: memories.content,
      filename: memories.filename,
      metadata: memories.metadata,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(and(...conditions))
    .orderBy(sql`${memories.createdAt} DESC`)
    .limit(limit);

  return rows as MemoryRow[];
}

/**
 * Read a single memory by id, with visibility check.
 * Returns null if the viewer cannot see it.
 */
export async function getMemory(
  id: number,
  viewerId: AgentId,
): Promise<MemoryRow | null> {
  const rows = await getDb()
    .select({
      id: memories.id,
      agentId: memories.agentId,
      topic: memories.topic,
      tier: memories.tier,
      visibility: memories.visibility,
      visibleTo: memories.visibleTo,
      content: memories.content,
      filename: memories.filename,
      metadata: memories.metadata,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(
      and(
        eq(memories.id, id),
        sql`(${memories.expiresAt} IS NULL OR ${memories.expiresAt} > now())`,
      ),
    )
    .limit(1);

  const row = rows[0] as MemoryRow | undefined;
  if (!row) return null;
  if (!canView(row, viewerId)) return null;
  return row;
}

function canView(row: MemoryRow, viewerId: AgentId): boolean {
  if (row.agentId === viewerId) return true;
  if (row.visibility === "public") return true;
  if (row.visibility === "shared" && row.visibleTo?.includes(viewerId)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface WriteOptions {
  /** Required: who is writing. Always supplied by the runtime. */
  agentId: AgentId;
  topic: Topic;
  tier: Tier;
  content: string;
  filename?: string | null;
  visibility?: Visibility;
  visibleTo?: AgentId[];
  metadata?: Record<string, unknown>;
  expiresAt?: Date | null;
  userId?: string;
}

export async function writeMemory(input: WriteOptions) {
  const visibility = input.visibility ?? "owner";

  // Enforce CHECK invariant at the application layer too.
  if (visibility === "shared" && (!input.visibleTo || input.visibleTo.length === 0)) {
    throw new Error("visibility='shared' requires visibleTo with at least one agent");
  }
  if (visibility !== "shared" && input.visibleTo && input.visibleTo.length > 0) {
    throw new Error(`visibility='${visibility}' requires visibleTo to be null/empty`);
  }

  const [row] = await getDb()
    .insert(memories)
    .values({
      agentId: input.agentId,
      topic: input.topic,
      tier: input.tier,
      content: input.content,
      filename: input.filename ?? null,
      visibility,
      visibleTo: visibility === "shared" ? input.visibleTo! : null,
      metadata: input.metadata ?? {},
      expiresAt: input.expiresAt ?? null,
      userId: input.userId ?? "ceo",
    })
    .returning();

  if (row) {
    await getDb().insert(memoryAudit).values({
      memoryId: row.id,
      action: "update",
      actorAgentId: input.agentId,
    });
  }

  return row;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdateOptions {
  id: number;
  viewerId: AgentId;
  content: string;
  mode: "append" | "overwrite";
  filename?: string | null;
}

export async function updateMemory(opts: UpdateOptions) {
  // Ownership check: only the writer can update.
  const existing = await getDb()
    .select({ agentId: memories.agentId })
    .from(memories)
    .where(eq(memories.id, opts.id))
    .limit(1);

  if (!existing[0] || existing[0].agentId !== opts.viewerId) {
    throw new Error("Only the owning agent can update this memory");
  }

  const setFields = opts.filename !== undefined
    ? { content: buildContentUpdate(opts), filename: opts.filename, updatedAt: sql`now()` }
    : { content: buildContentUpdate(opts), updatedAt: sql`now()` };

  const [row] = await getDb()
    .update(memories)
    .set(setFields)
    .where(eq(memories.id, opts.id))
    .returning();

  if (row) {
    await getDb().insert(memoryAudit).values({
      memoryId: row.id,
      action: "update",
      actorAgentId: opts.viewerId,
    });
  }

  return row;
}

function buildContentUpdate(opts: UpdateOptions) {
  if (opts.mode === "append") return sql`${memories.content} || ${"\n"} || ${opts.content}`;
  return opts.content;
}

// ---------------------------------------------------------------------------
// Share / Unshare
// ---------------------------------------------------------------------------

export interface ShareOptions {
  memoryId: number;
  ownerId: AgentId;          // runtime-supplied; must equal row.agent_id
  targetAgentId: AgentId;
  reason?: string;
}

export async function shareMemory(opts: ShareOptions) {
  if (opts.ownerId === opts.targetAgentId) {
    throw new Error("Cannot share a memory with its owner");
  }

  const existing = await getDb()
    .select({ agentId: memories.agentId, visibleTo: memories.visibleTo })
    .from(memories)
    .where(eq(memories.id, opts.memoryId))
    .limit(1);

  if (!existing[0] || existing[0].agentId !== opts.ownerId) {
    throw new Error("Only the owning agent can share this memory");
  }

  const newVisibleTo = Array.from(
    new Set([...(existing[0].visibleTo ?? []), opts.targetAgentId]),
  );

  const [row] = await getDb()
    .update(memories)
    .set({
      visibility: "shared",
      visibleTo: newVisibleTo,
      updatedAt: sql`now()`,
    })
    .where(eq(memories.id, opts.memoryId))
    .returning();

  await getDb().insert(memoryAudit).values({
    memoryId: opts.memoryId,
    action: "share",
    actorAgentId: opts.ownerId,
    targetAgentId: opts.targetAgentId,
    reason: opts.reason ?? null,
  });

  return row;
}

export async function unshareMemory(opts: {
  memoryId: number;
  ownerId: AgentId;
  targetAgentId: AgentId;
}) {
  const existing = await getDb()
    .select({ agentId: memories.agentId, visibleTo: memories.visibleTo })
    .from(memories)
    .where(eq(memories.id, opts.memoryId))
    .limit(1);

  if (!existing[0] || existing[0].agentId !== opts.ownerId) {
    throw new Error("Only the owning agent can unshare this memory");
  }
  if (existing[0].visibleTo === null) return null;

  const filtered = existing[0].visibleTo.filter((a) => a !== opts.targetAgentId);
  if (filtered.length === existing[0].visibleTo.length) return null;

  // If no shared readers remain, revert to 'owner'.
  const newVisibility: Visibility = filtered.length === 0 ? "owner" : "shared";
  const newVisibleTo: AgentId[] | null = filtered.length === 0 ? null : filtered;

  const [row] = await getDb()
    .update(memories)
    .set({
      visibility: newVisibility,
      visibleTo: newVisibleTo,
      updatedAt: sql`now()`,
    })
    .where(eq(memories.id, opts.memoryId))
    .returning();

  await getDb().insert(memoryAudit).values({
    memoryId: opts.memoryId,
    action: "unshare",
    actorAgentId: opts.ownerId,
    targetAgentId: opts.targetAgentId,
  });

  return row;
}

// ---------------------------------------------------------------------------
// Forget (soft delete)
// ---------------------------------------------------------------------------

export interface ForgetOptions {
  id: number;
  viewerId: AgentId;
}

export async function forgetMemory(opts: ForgetOptions) {
  const existing = await getDb()
    .select({ agentId: memories.agentId })
    .from(memories)
    .where(eq(memories.id, opts.id))
    .limit(1);

  if (!existing[0] || existing[0].agentId !== opts.viewerId) {
    throw new Error("Only the owning agent can forget this memory");
  }

  await getDb()
    .update(memories)
    .set({ expiresAt: sql`now()` })
    .where(eq(memories.id, opts.id));

  await getDb().insert(memoryAudit).values({
    memoryId: opts.id,
    action: "forget",
    actorAgentId: opts.viewerId,
  });
}

// ---------------------------------------------------------------------------
// Core memory (auto-injected at session start)
// ---------------------------------------------------------------------------

export interface CoreMemoryOptions {
  viewerId: AgentId;
  userId?: string;
}

export async function readCoreMemory(opts: CoreMemoryOptions): Promise<string> {
  const rows = await getDb()
    .select({ content: memories.content })
    .from(memories)
    .where(
      and(
        eq(memories.userId, opts.userId ?? "ceo"),
        eq(memories.tier, "core"),
        eq(memories.agentId, opts.viewerId),  // scope to the calling agent
        or(isNull(memories.expiresAt), sql`${memories.expiresAt} > now()`),
      ),
    )
    .orderBy(memories.createdAt);

  return rows.map((r) => r.content).join("\n");
}
