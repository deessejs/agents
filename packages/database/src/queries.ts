import { and, cosineDistance, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb } from "./client.js";
import { memories } from "./schema.js";

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchOptions {
  embedding: number[];
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
  similarity: number;
}

export async function searchMemories(opts: SearchOptions): Promise<MemoryRow[]> {
  const similarity = sql`1 - ${cosineDistance(memories.embedding, opts.embedding)}`;

  const rows = await getDb()
    .select({
      id: memories.id,
      scope: memories.scope,
      tier: memories.tier,
      content: memories.content,
      metadata: memories.metadata,
      createdAt: memories.createdAt,
      similarity,
    })
    .from(memories)
    .where(
      and(
        isNotNull(memories.embedding),
        eq(memories.userId, opts.userId ?? "ceo"),
        or(isNull(memories.expiresAt), sql`${memories.expiresAt} > now()`),
        opts.scopes?.length ? inArray(memories.scope, opts.scopes) : undefined,
        opts.tiers?.length ? inArray(memories.tier, opts.tiers) : undefined,
      ),
    )
    .orderBy(sql`${similarity} DESC`)
    .limit(opts.limit ?? 10);

  return rows as MemoryRow[];
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface WriteOptions {
  scope: string;
  tier: string;
  content: string;
  embedding?: number[] | null;
  importance?: number;
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
      embedding: input.embedding ?? null,
      importance: input.importance ?? 0.5,
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
  newEmbedding?: number[] | null,
) {
  if (mode === "append") {
    const [row] = await getDb()
      .update(memories)
      .set({
        content: sql`${memories.content} || ${"\n"} || ${content}`,
        embedding: newEmbedding ?? memories.embedding,
        updatedAt: sql`now()`,
      })
      .where(eq(memories.id, id))
      .returning();
    return row;
  } else {
    const [row] = await getDb()
      .update(memories)
      .set({
        content,
        embedding: newEmbedding ?? null,
        updatedAt: sql`now()`,
      })
      .where(eq(memories.id, id))
      .returning();
    return row;
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function forgetMemory(id: number): Promise<void> {
  await getDb()
    .update(memories)
    .set({ expiresAt: sql`now()` })
    .where(eq(memories.id, id));
}

// ---------------------------------------------------------------------------
// Core memory (read all core rows for user)
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

  return rows.map((r: { content: string }) => r.content).join("\n");
}
