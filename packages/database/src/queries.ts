import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "./client.js";
import { memories } from "./schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchOptions {
  query: string;
  userId?: string;
  scopes?: string[];
  tiers?: string[];
  limit?: number;
}

export interface MemoryRow {
  id: number;
  scope: string;
  tier: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Search (keyword / full-text)
// ---------------------------------------------------------------------------

export async function searchMemories(opts: SearchOptions): Promise<MemoryRow[]> {
  const { query, userId = "ceo", scopes, tiers, limit = 10 } = opts;

  const conditions: SQL[] = [];

  // Keyword search — always applied
  conditions.push(sql`${memories.content} ILIKE ${"%" + query + "%"}`);

  if (userId) conditions.push(eq(memories.userId, userId));
  if (scopes?.length) conditions.push(inArray(memories.scope, scopes));
  if (tiers?.length) conditions.push(inArray(memories.tier, tiers));
  const expiresCondition = or(
    isNull(memories.expiresAt),
    sql`${memories.expiresAt} > now()`
  );
  if (expiresCondition) conditions.push(expiresCondition);

  const rows = await getDb()
    .select({
      id: memories.id,
      scope: memories.scope,
      tier: memories.tier,
      content: memories.content,
      metadata: memories.metadata,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(and(...conditions))
    .orderBy(sql`${memories.createdAt} DESC`)
    .limit(limit);

  return rows as MemoryRow[];
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface WriteOptions {
  scope: string;
  tier: string;
  content: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date | null;
  userId?: string;
}

export async function writeMemory(input: WriteOptions) {
  const [row] = await getDb()
    .insert(memories)
    .values({
      scope: input.scope,
      tier: input.tier,
      content: input.content,
      metadata: input.metadata ?? {},
      expiresAt: input.expiresAt ?? null,
      userId: input.userId ?? "ceo",
    })
    .returning();

  return row;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateMemory(
  id: number,
  content: string,
  mode: "append" | "overwrite",
) {
  if (mode === "append") {
    const [row] = await getDb()
      .update(memories)
      .set({
        content: sql`${memories.content} || ${"\n"} || ${content}`,
        updatedAt: sql`now()`,
      })
      .where(eq(memories.id, id))
      .returning();
    return row;
  } else {
    const [row] = await getDb()
      .update(memories)
      .set({ content, updatedAt: sql`now()` })
      .where(eq(memories.id, id))
      .returning();
    return row;
  }
}

// ---------------------------------------------------------------------------
// Delete (soft)
// ---------------------------------------------------------------------------

export async function forgetMemory(id: number): Promise<void> {
  await getDb()
    .update(memories)
    .set({ expiresAt: sql`now()` })
    .where(eq(memories.id, id));
}

// ---------------------------------------------------------------------------
// Core memory
// ---------------------------------------------------------------------------

export async function readCoreMemory(userId = "ceo"): Promise<string> {
  const rows = await getDb()
    .select({ content: memories.content })
    .from(memories)
    .where(
      and(
        eq(memories.userId, userId),
        eq(memories.tier, "core"),
        or(isNull(memories.expiresAt), sql`${memories.expiresAt} > now()`),
      ),
    )
    .orderBy(memories.createdAt);

  return rows.map((r) => r.content).join("\n");
}
