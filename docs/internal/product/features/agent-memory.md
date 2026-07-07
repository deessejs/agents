---
title: Agent Memory Layer
status: proposed
owner: Head of Engineering + Head of Product
last-updated: 2026-07-07
updated-reason: "2026-07-07 — web research via fresh: (1) drizzle-orm@0.45.2 ✓, drizzle-kit@0.31.10 ✓; (2) bug #3349 still OPEN; (3) bug #3713 OPEN despite has-pr label — manual CHECK with sql still required; (4) pgvector is now 0.8.4 (was 0.8.x in spec) — stability release, no behavior change for our use; (5) Neon Free limits confirmed accurate (0.5 GB / 100 CU-h / 5 GB / 5-min idle); (6) Managed Neon integrations now preferred over Manual for production — nuance added; (7) Vercel AI Gateway confirmed: text-embedding-3-small ✓, text-embedding-2 does NOT exist; (8) MiniMax-M3 confirmed: no embeddings API."
---

# Agent Memory Layer

## 1. Problem

Today, both deployed agents (`head-of-engineering`, `head-of-product`) carry
**only the conversation history of their current durable session**. Everything
eve + the Workflow SDK gives us out of the box — `defineState`, compaction,
append-only history — is **scoped to one session**.

The moment a new session starts (a fresh Telegram conversation, a new `eve dev`
URL, a channel switch), the agent starts blank. It does not remember:

- who the CEO is or how they prefer to be addressed
- decisions taken in past sessions ("we agreed to drop the legacy auth path")
- project state ("the migration is 60% done, blocker on Stripe webhook")
- durable facts about Deessejs (stack, conventions, repo layout, stakeholders)

The user (CEO) has to repeat context every time. This is unacceptable for an
agent that nominally has long-term ownership of a domain.

## 2. Goal

Give every agent **persistent, retrievable long-term memory** that:

1. Survives session restarts, channel switches, and redeployments.
2. Is **scoped per agent** (Engineering memory ≠ Product memory) with a shared
   common tier for facts that both need.
3. Is **retrievable on demand** via the standard tool loop, and **injected into
   context** for high-priority facts (the "core" tier).
4. Is **fully owned by us** — no third-party memory provider, no provider
   lock-in, runs inside the Vercel ecosystem.
5. Costs effectively nothing at our scale (Neon free tier covers it).

## 3. Non-Goals (for v1)

- **Cross-agent reasoning over memory** (one agent searching the other's memory
  in-flight). Memory is read by its owner; cross-pollination happens through
  delegation, not memory.
- **Automatic fact extraction** from every turn. v1 is **explicit-only**:
  memory is written when the agent (or the user) decides to call the memory
  tool. Automatic extraction is a v2 hook, see §10.
- **Multi-tenant support**. `user_id` exists in the schema for forward
  compatibility, but there is exactly one user (the CEO) at v1.
- **Bash-backed memory tool** (Route B). The structured-action interface (Route
  A) covers all known v1 needs with a strictly smaller safety surface.
- **Provider-defined memory tools** (Anthropic Memory Tool). Lock-in to a
  single provider contradicts the rest of the architecture (we run on
  MiniMax-M3 today, may switch tomorrow).

## 4. Memory Tier Model

We adopt the four-tier model from the ai-sdk `06-memory.mdx` doc and the Letta
nomenclature it cites, mapped to eve primitives.

| Tier | Content | Lifetime | Read path | Write path | eve primitive |
|---|---|---|---|---|---|
| **Working** | Scratchpad, in-flight variables, todo list | One turn | Auto-injected | Auto | `todo` (built-in) |
| **Session** | Full conversation history of one session | Days–weeks (durable session) | Auto-injected via prompt | Auto on each message | Workflow SDK + compaction (built-in) |
| **Procedural** | "How to" playbooks (PR template, spec template, incident runbook) | Stable, rarely updated | `load_skill` on demand | Authored at build time | `agent/skills/` |
| **Core** | A few hundred bytes of high-priority facts (CEO name, prefs, current project, conventions) | Long | Injected every turn via dynamic instructions | Memory tool (`create` / `update`) | `defineDynamic` reading from Neon |
| **Archival** | Timestamped notes, decisions, summaries | Long, queryable by keyword | Memory tool (`search`) | Memory tool (`create`) | Neon row, semantic search |
| **Recall** | Every conversation ever (Telegram + eve) | Forever (or until TTL) | Memory tool (`search` over JSONL view) | Hook on `message.completed` | Neon row, JSONB content |

Notes:

- **Procedural** is already solved by eve skills; this feature is not about it.
- **Working** + **Session** + **Procedural** are already solved by eve/ai-sdk
  defaults and require no new code.
- This feature ships **Core + Archival + Recall** as one cohesive layer on top
  of Neon + pgvector.

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  eve runtime                                                    │
│                                                                 │
│  ┌──────────────────────────┐    ┌──────────────────────────┐   │
│  │ agent/instructions/      │    │ agent/tools/memory.ts    │   │
│  │ core-injection.ts       │    │ (Route A, re-exported   │   │
│  │ (defineDynamic)         │    │  from @ds-team/database) │   │
│  └──────────┬─────────────┘    └──────────┬───────────────┘   │
│             │                               │                   │
│             │ readCoreMemory()             │ dispatcher →      │
│             │ from Neon                    │ queries.ts        │
│             │ every session               │                  │
│             ▼                               ▼                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  @ds-team/database/src/queries.ts                        │  │
│  │  @ds-team/database/src/schema.ts                        │  │
│  │  @ds-team/database/src/lib/embed.ts                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│             │                                                   │
└─────────────┼───────────────────────────────────────────────────┘
               ▼
    ┌──────────────────────┐     ┌──────────────────────────────┐
    │  Neon Postgres        │     │  @ds-team/database (pkg)    │
    │  - DATABASE_URL       │     │  - schema (Drizzle source) │
    │  - pgvector 0.8.x    │     │  - queries, embed, client  │
    │  - memories table      │     │  - drizzle/migrations       │
    └──────────────────────┘     └──────────────────────────┘

  Optional (v2):
  ┌────────────────────────────────────────────────────────────┐
  │  agent/hooks/extract-memories.ts                           │
  │  - subscribes to message.completed                       │
  │  - runs MiniMax-M3 on turn end                         │
  │  - writes facts via @ds-team/database                    │
  └────────────────────────────────────────────────────────────┘
```

**Key choice**: the schema lives in TypeScript (`schema.ts`) and is the
single source of truth. SQL migrations are *generated* from it by
`drizzle-kit`, never authored by hand. See §6 for the full rationale.

## 6. Backend: Neon Postgres + pgvector, managed via Drizzle

### 6.1 Database setup

Sign up at **neon.tech** directly (Free plan) and create one project
called `deessejs-memories`. Copy the pooled `DATABASE_URL` from the Neon
dashboard. Paste it into the **Environment Variables** of both Vercel
projects (`deessejs-hoe-agent` and `deessejs-hop-agent`) via
*Settings → Environment Variables*. Both agents share the same DB.

> **Why direct signup, not the Vercel Marketplace?** Neon offers three
> paths to Vercel: Vercel-Managed (Neon created from Vercel, unified
> billing), Neon-Managed (existing Neon account, connected via Marketplace),
> and Manual (just set `DATABASE_URL` manually). The managed paths are now
> preferred for production use and additionally provide preview-branch
> isolation. The **Manual** path remains valid and is the right choice when
> you want zero Marketplace engagement, Neon billing on neon.tech, and full
> control over the connection string from local dev, GitHub Actions, and
> Vercel prod with the same `DATABASE_URL`. We use **Manual** — it's the
> simpler fit for two fixed production deployments with no per-PR preview
> DBs. We can migrate to Neon-Managed later if preview-branch isolation
> becomes useful.

**Free plan limits we should know about** (per [Neon Free plan FAQ](https://neon.com/faqs/free-plan-limits-and-quotas)):

- 100 projects, 10 branches per project (we'll use 2: `main` and `dev`)
- 100 CU-hours per project per month — at our expected load this is
  effectively unlimited (a 0.25 CU compute = ~400 h/mo)
- 0.5 GB storage per project — our memory rows are tiny (text + 1536-dim
  vector ≈ 6 KB/row), so this is ~80k memories before we hit the cap
- 5 GB public network transfer per month
- Compute idles after 5 minutes of inactivity (always-on on Free, but
  resumes on first connection — ~1–2 s cold-start penalty, not an outage)
- Autoscaling up to 2 CU (≈8 GB RAM) when active

**Region selection**: pick the Neon region closest to our Vercel
deployment region (`iad1` for US East, `fra1` for Frankfurt — the
project domains suggest Vercel's `iad1` edge). Same-region = lowest
latency over `neon-http`. Mismatch = +20-50 ms per query.

We enable `pgvector` once per database (Neon includes it, no add-on; current version
on Neon is **0.8.0** on PG14–17, **0.8.4** on PG18 — the spec said `0.8.x`
which covers both):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This is committed as the first Drizzle migration (`drizzle/0000_init.sql`),
generated by `drizzle-kit generate --custom`.

### 6.2 Schema-as-code (Drizzle)

The schema is the **single source of truth**, written once in TypeScript.
SQL migrations are derived from it.

`packages/database/src/schema.ts`:

```ts
import {
  check,
  index,
  pgTable,
  serial,
  text,
  real,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Validate string unions at the TypeScript level. DB CHECK constraints are
// added manually via sql`` to avoid the open Drizzle bug #3713 where $type<>
// would generate $1/$2 placeholders instead of literal values in CHECK.
type Scope  = 'engineering' | 'product' | 'shared';
type Tier   = 'core' | 'archival' | 'episodic' | 'recall';

export const memories = pgTable(
  'memories',
  {
    id:         serial('id').primaryKey(),
    scope:      text('scope').notNull()      as ReturnType<typeof text> & { _brand: Scope },
    tier:       text('tier').notNull()       as ReturnType<typeof text> & { _brand: Tier },
    content:    text('content').notNull(),
    embedding:   vector('embedding', { dimensions: 1536 }),
    importance:  real('importance').notNull().default(0.5),
    metadata:   jsonb('metadata').notNull().default({} as Record<string, unknown>),
    createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt:  timestamp('expires_at', { withTimezone: true }),
    userId:     text('user_id').notNull().default('ceo'),
  },
  (table) => [
    // -- Scope CHECK (manual sql to avoid drizzle-kit bug #3713)
    check('memories_scope_check',
      sql`${table.scope} IN ('engineering', 'product', 'shared')`,
    ),
    // -- Tier CHECK (manual sql to avoid drizzle-kit bug #3713)
    check('memories_tier_check',
      sql`${table.tier} IN ('core', 'archival', 'episodic', 'recall')`,
    ),
    // ANN vector search: HNSW + cosine distance
    index('memories_embedding_hnsw').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
    // Composite filter index (scope + tier)
    index('memories_scope_tier_idx').on(table.scope, table.tier),
    // JSONB metadata search
    index('memories_metadata_gin').using('gin', table.metadata),
    // Normal index on expires_at (partial index via .where() is broken in
    // drizzle-kit — see issue #3349; trade-off is acceptable at our scale)
    index('memories_expires_at_idx').on(table.expiresAt),
    // DESC time-range index (created_at is 1-based column ref, not a raw SQL expr)
    index('memories_created_at_idx').on(table.createdAt),
  ],
);

export type Memory    = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
```

**Validation strategy**:
- TS-level: string literals typed as `Scope` / `Tier` unions catch
  typos at compile time. A utility type helper (` branded type pattern) keeps
  the column types narrow in tool inputs.
- DB-level: the two `check()` constraints with explicit `sql` template
  literals bypass drizzle-kit bug [#3713](https://github.com/drizzle-team/drizzle-orm/issues/3713)
  (open — despite a `has-pr` label the issue shows no merged PR, and `$1`
  placeholders are still generated when using `$type<>` inside CHECK).
- Drizzle bug [#3349](https://github.com/drizzle-team/drizzle-orm/issues/3349)
  blocks partial indexes via `.where()`; we use a plain B-tree index on
  `expires_at` instead. Acceptable at << 80 k rows.

### 6.3 Migration workflow

```bash
# 1. After editing schema.ts, generate the SQL migration + snapshot
pnpm --filter @ds-team/agent-core drizzle-kit generate

# 2. Inspect the generated drizzle/<timestamp>_<name>/migration.sql
#    Commit it alongside schema.ts.

# 3. Apply to the live Neon DB
pnpm --filter @ds-team/agent-core drizzle-kit migrate

# 4. (Optional) Inspect locally
pnpm --filter @ds-team/agent-core drizzle-kit studio
```

The migration files live in `packages/database/drizzle/` and are committed.
This guarantees `git diff` shows schema changes as code reviewable PRs.

The generated SQL for our schema (from `drizzle-kit generate`):

```sql
CREATE TABLE "memories" (
  "id" serial PRIMARY KEY,
  "scope" text NOT NULL,
  "tier" text NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1536),
  "importance" real DEFAULT 0.5 NOT NULL,
  "metadata" jsonb DEFAULT '{}' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz,
  "user_id" text DEFAULT 'ceo' NOT NULL
);
ALTER TABLE "memories" ADD CONSTRAINT "memories_scope_check"
  CHECK ("scope" IN ('engineering', 'product', 'shared'));
ALTER TABLE "memories" ADD CONSTRAINT "memories_tier_check"
  CHECK ("tier" IN ('core', 'archival', 'episodic', 'recall'));
CREATE INDEX "memories_embedding_hnsw"
  ON "memories" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "memories_scope_tier_idx"
  ON "memories" ("scope", "tier");
CREATE INDEX "memories_metadata_gin"
  ON "memories" USING gin ("metadata");
CREATE INDEX "memories_expires_at_idx"
  ON "memories" ("expires_at");
CREATE INDEX "memories_created_at_idx"
  ON "memories" ("created_at");
```

### 6.4 Drizzle config

`packages/database/drizzle.config.ts`:

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

### 6.5 Client setup (Drizzle + neon-http)

`packages/database/src/db/client.ts`:

```ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql, schema });
```

Why **`neon-http`** (not `pg` / `postgres.js` / `neon-serverless`):

- Queries over HTTP — no connection pool, no idle timeout. Perfect for
  Vercel serverless where each invocation may be a cold start.
- Single-shot, non-interactive transactions (no `BEGIN`/`COMMIT`). Matches
  our memory use case (one query per tool call).
- Recommended by Drizzle's own Neon integration guide for serverless
  environments.

### 6.6 Read query (Drizzle)

```ts
// packages/database/src/queries.ts
import { and, cosineDistance, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from './client';
import { memories } from './schema';

export async function searchMemories(opts: {
  embedding: number[];
  userId: string;
  scopes?: string[];
  tiers?: string[];
  limit?: number;
}) {
  const similarity = sql`1 - ${cosineDistance(memories.embedding, opts.embedding)}`;

  const rows = await db
    .select({
      id:        memories.id,
      scope:     memories.scope,
      tier:      memories.tier,
      content:   memories.content,
      metadata:  memories.metadata,
      createdAt: memories.createdAt,
      similarity,
    })
    .from(memories)
    .where(
      and(
        isNotNull(memories.embedding),
        eq(memories.userId, opts.userId),
        or(isNull(memories.expiresAt), sql`${memories.expiresAt} > now()`),
        opts.scopes?.length ? inArray(memories.scope, opts.scopes) : undefined,
        opts.tiers?.length  ? inArray(memories.tier,  opts.tiers)  : undefined,
      ),
    )
    .orderBy(sql`${similarity} DESC`)
    .limit(opts.limit ?? 10);

  return rows;
}
```

`cosineDistance(col, value)` from `drizzle-orm` generates `col <=> value`.
`similarity` is derived inline via `sql` so we order by it with `sql\`…\` DESC`.
`inArray` generates `= ANY(…)`. `undefined` clauses are skipped.

### 6.7 Write helpers

```ts
// packages/database/src/queries.ts (continued)

export async function writeMemory(input: {
  scope:     string;           // validated at the Zod level in the tool
  tier:      string;           // validated at the Zod level in the tool
  content:   string;
  embedding?: number[];        // nullable; core tier may skip embedding
  importance?: number;
  metadata?: Record<string, unknown>;
  expiresAt?: Date | null;
}) {
  const [row] = await db.insert(memories).values({
    scope:      input.scope,
    tier:       input.tier,
    content:    input.content,
    embedding:  input.embedding,
    importance: input.importance ?? 0.5,
    metadata:   input.metadata ?? {},
    expiresAt:  input.expiresAt ?? null,
  }).returning();
  return row;
}

export async function forgetMemory(id: number) {
  await db
    .update(memories)
    .set({ expiresAt: sql`now()` })
    .where(eq(memories.id, id));
}

export async function readCoreMemory(userId = 'ceo'): Promise<string> {
  const rows = await db
    .select({ content: memories.content })
    .from(memories)
    .where(
      and(
        eq(memories.userId, userId),
        eq(memories.tier,  'core'),
        or(isNull(memories.expiresAt), sql`${memories.expiresAt} > now()`),
      ),
    )
    .orderBy(memories.createdAt);
  return rows.map((r) => r.content).join('\n');
}
```

### 6.8 Embedding pipeline

- Provider: **Vercel AI Gateway** with `openai/text-embedding-3-small`.
  (MiniMax-M3 does not expose an embeddings endpoint — see §10 note.)
  Cost: ~$0.02 / 1M tokens. At our scale (a few hundred writes per month)
  this is sub-dollar.
- Call site: `packages/database/src/lib/embed.ts`:
```ts
import { embed } from 'ai';
import { gateway } from '@ai-sdk/gateway';

export async function embedText(text: string): Promise<number[]> {
  const result = await embed({
    model: gateway.textEmbeddingModel('openai/text-embedding-3-small'),
    value: text,
  });
  return result.embedding;
}
```
- Failure mode: if the embed call fails, the write still succeeds with
  `embedding = NULL` (memory stays retrievable by keyword but not by
  semantic similarity. Logged but not retried automatically.

### 6.9 Scale-to-zero

Neon's free tier keeps compute **always-on** but idles after 5 minutes of
inactivity. Cold-start resume penalty is ~1–2 s. Acceptable for our use:
the LLM call itself takes 1–5 s, so the cold-start is masked. Overuse of any
monthly quota (storage, CU-hours, egress) does suspend compute until the next
billing cycle — so storage is the real watch item at our scale. **Upgrade
trigger**: when sustained traffic approaches the free tier compute allowance,
move to the Launch plan ($19/mo).

### 6.10 Why Drizzle (vs alternatives)

| Concern | Drizzle | Raw SQL (`pg`/`postgres.js`) | Kysely | Prisma |
|---|---|---|---|---|
| Schema-as-code | ✅ TS file is source of truth | ❌ | ❌ (interface separated) | ✅ `.prisma` file |
| Migrations out of box | ✅ `drizzle-kit` | ❌ | ❌ | ✅ `prisma migrate` |
| pgvector type-safety | ✅ `vector({ dimensions })` | ⚠️ manual cast | ⚠️ manual | ⚠️ `Unsupported()` |
| HNSW index in schema | ✅ `.using('hnsw', col.op('vector_cosine_ops'))` | ❌ | ❌ | ⚠️ raw SQL escape |
| Bundle size | ~7-15 KB gzip | ~20 KB (postgres.js) | ~14 KB | 50-200 KB |
| Edge / Vercel runtime | ✅ native | ✅ | ✅ | ⚠️ OK since Prisma 6 |
| Raw SQL escape hatch | ✅ `sql\`...\`` | ✅ (always) | ✅ | ⚠️ `$queryRaw` partial |
| Multi-DB portability | ✅ Postgres/MySQL/SQLite/D1 | ❌ | ✅ | ⚠️ Postgres-first |

Drizzle is the only option that gives us **typed pgvector + first-class
schema migrations + raw-SQL escape hatch + small bundle**, all without
leaving the Vercel ecosystem.

## 7. Tool Interface (Route A: Structured Actions)

One tool, five commands. Zod-validated input, no shell surface.

The tool lives in `packages/database`. Each agent re-exports it:

```ts
// apps/<agent>/agent/tools/memory.ts
export { default } from "@ds-team/database/tools/memory";
```

The actual definition is in `packages/database`:

```ts
// packages/database/src/tools/memory.ts
import { defineTool } from "eve/tools";
import { z } from "zod";

const memoryInputSchema = z.object({
  command: z.enum(["view", "create", "update", "search", "forget"]),
  path:    z.string().optional(),
  content: z.string().optional(),
  mode:    z.enum(["append", "overwrite"]).optional(),
  query:   z.string().optional(),
  scope:   z.enum(["engineering", "product", "shared"]).optional(),
  tier:    z.enum(["core", "archival", "episodic", "recall"]).optional(),
  id:      z.number().int().optional(),
  limit:   z.number().int().min(1).max(50).optional(),
});

export default defineTool({
  description: `Read and maintain long-term memory under /memories.

Rules:
- Search before answering when the user prompt depends on past decisions,
  preferences, project state, or people.
- For high-priority durable facts (name, preferences, current project), use
  command 'update' on path '/memories/core.md' with mode 'append'.
- For dated notes and decisions, use 'create' with a path under
  '/memories/notes/YYYY-MM-DD.md'.
- For full conversation recall, search scope='shared', tier='recall'.
- Use 'forget' with an id from a previous search result to honor RGPD.`,
  inputSchema: memoryInputSchema,
  async execute(input, ctx) {
    // dispatcher → memory-store.ts
  },
});
```

### 7.1 Command semantics

| Command | Required inputs | Behavior |
|---|---|---|
| `view` | `path` | Returns the content at `path`. Resolves logical paths (`/memories/core.md`) to the row(s) that compose that view. |
| `create` | `scope`, `tier`, `content` | Creates a new row. Embeds `content` automatically. Returns the new `id`. |
| `update` | `id`, `content`, `mode` | `mode='append'` adds a new line; `mode='overwrite'` replaces. Re-embeds if content materially changed. |
| `search` | `query`, optional `scope`/`tier`/`limit` | Embeds `query`, runs the read query from §6.6, returns top-K rows with similarity score. |
| `forget` | `id` | Soft-deletes the row by setting `expires_at = now()`. Reversible within 30 days (sweep job, see §9). |

### 7.2 Path conventions

Logical paths under `/memories` map to physical rows like this:

| Path | Implementation |
|---|---|
| `/memories/core.md` | All rows where `tier='core'` concatenated in `created_at` order |
| `/memories/notes/YYYY-MM-DD.md` | Rows where `tier='archival'` and `metadata->>'date' = YYYY-MM-DD` |
| `/memories/conversations.jsonl` | Rows where `tier='recall'` |
| Any other path | `metadata->>'path' = <path>` |

This keeps the LLM-facing API in familiar file-path form while the storage is
relational.

## 8. Core Injection (eve `defineDynamic`)

A dynamic instructions resolver reads `core.md` from Neon on every session
start and prepends it to the system prompt:

```ts
// apps/<agent>/agent/instructions/core-injection.ts
import { defineDynamic, defineInstructions } from "eve/instructions";
import { readCoreMemory } from "@ds-team/database/queries";

export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => {
      const core = await readCoreMemory();   // Neon SELECT tier='core'
      return defineInstructions({
        markdown: `## Long-term memory (auto-injected, edit via memory tool)

${core}

---
`,
      });
    },
  },
});
```

This is the analog of ai-sdk's `prepareCall` hook, expressed in eve's
vocabulary. It runs **once per session**, not every turn — cheap because core
memory is small (< 1 KB).

**Why not per-turn**: eve's instructions are baked at session start. Per-turn
injection would require an `onStepStart`-style resolver, which eve does not
support for instructions. If we need per-turn re-injection of core (because the
agent updates core mid-session), we can switch to `turn.started` at the cost of
a small per-turn fetch — the row is tiny, the latency is acceptable.

## 9. RGPD / Right to be Forgotten

- **Soft delete**: `forget` sets `expires_at = now() + 30d`. The row is
  invisible to all queries (`WHERE expires_at > now()`) but recoverable for
  30 days in case of accidental deletion.
- **Hard sweep**: a Vercel Cron Job (cheap, runs daily at 03:00 UTC) executes
  `DELETE FROM memories WHERE expires_at < now() - interval '30 days'`.
- **Export**: a future `command='export'` can dump everything for a `user_id`
  as JSON, for portability.

## 10. Auto-extraction Hook (v2, optional)

Triggered on `message.completed`. Runs a lightweight LLM on the assistant's
last turn with this prompt:

> "Extract any durable facts about the user, the project, or decisions taken
> from this turn. Output JSON: `{ facts: [{ tier, content, importance }] }.
> If nothing durable was said, output `{ facts: [] }`."

For each fact with `importance >= 0.6`, write to the archival tier via the
Drizzle `writeMemory()` helper. Cost at our expected volume: <$1/mo.

**Embedding model** (the pre-requisite for semantic search):

> ⚠️ **MiniMax-M3 does not support embeddings.** The MiniMax API
> (platform.minimax.io/docs/llms.txt) covers LLM chat, TTS, and video
> only. Vercel AI Gateway's MiniMax-M3 model card confirms no embeddings
> capability. `openai/text-embedding-3-small` via the Gateway is the
> only viable option for our setup (1536 dimensions, MTEB 62.3%, ~$0.02 / 1M
> tokens — a good fit for memory recall where latency matters more than
> peak benchmark score). `openai/text-embedding-3-large` (3072 dims, MTEB
> 64.6%) is also available but costs ~10× more; not worth it for our scale.
> No `openai/text-embedding-2` exists — the lineup is ada-002 → 3-small →
> 3-large.

**Extraction model** (configurable per agent via env var):

- **Default**: MiniMax-M3 via its Anthropic-compatible endpoint — the same
  model powering the agents, so extraction speaks the same "language" as the
  turns it summarizes. The call is a simple chat completion (extract facts from
  a turn → return JSON), within MiniMax-M3's capability.
- **Fallback / budget mode**: `openai/gpt-4o-mini` via Vercel AI Gateway —
  cheaper and faster for a shallow extraction task.
- **Heuristic pre-filter** (always on): if the turn is short
  (< 500 chars) or matches a low-signal regex (greetings,
  thank-yous, status pings), skip the LLM call entirely. This avoids
  burning tokens on the ~80% of turns that produce no durable facts.

Disabled by default; opt-in per agent via
`agent/hooks/extract-memories.ts`. **Not in scope for v1.**

## 11. File Layout

```
packages/
├── agent-core/                                 # shared eve primitives only (no DB dep)
│   └── src/channels/, connections/             # eve channels + connections
│
└── database/                                  # schema, queries, embed, migrations — no eve dep
    ├── drizzle.config.ts                      # drizzle-kit config
    ├── drizzle/                              # GENERATED migrations + snapshots
    │   ├── 0000_init/
    │   │   ├── migration.sql
    │   │   └── snapshot.json
    │   └── meta/
    │       └── _journal.json
    └── src/
        ├── schema.ts                         # Drizzle schema (SOURCE OF TRUTH)
        ├── client.ts                         # drizzle(neon(DATABASE_URL), { schema })
        ├── queries.ts                       # readCoreMemory / writeMemory / searchMemories / forgetMemory
        ├── lib/
        │   └── embed.ts                     # Vercel AI Gateway text-embedding-3-small wrapper
        └── tools/
            └── memory.ts                    # Route A tool (default export)

apps/head-of-engineering/
└── agent/
    ├── instructions/
    │   └── core-injection.ts                # defineDynamic, reads readCoreMemory()
    └── tools/
        └── memory.ts                        # re-export from @ds-team/database/tools/memory

apps/head-of-product/
└── agent/
    ├── instructions/
    │   └── core-injection.ts                # defineDynamic, reads readCoreMemory()
    └── tools/
        └── memory.ts                        # re-export from @ds-team/database/tools/memory
```

Schema changes flow: edit `packages/database/src/schema.ts` →
`pnpm --filter @ds-team/database drizzle-kit generate` → commit the
generated migration + snapshot → `pnpm --filter @ds-team/database drizzle-kit migrate`.
No hand-written SQL.

## 12. Configuration

### 12.1 New env var

`DATABASE_URL` — the pooled connection string from neon.tech
(*Project dashboard → Connection Details → Pooled connection*). Paste
into both Vercel projects via *Settings → Environment Variables*, scoped
to **Production** (and **Preview** if we want previews to share the same
memory — recommended for now). Vercel exposes it as `process.env.DATABASE_URL`
at runtime.

> If we ever want isolated DB branches per Vercel preview, we can switch
> to the Neon-Managed Marketplace integration later without code changes.

### 12.2 New dependencies

In `packages/database/package.json`:

```json
{
  "dependencies": {
    "drizzle-orm": "^0.45.0",
    "@neondatabase/serverless": "^0.10.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.0",
    "tsx": "^4.0.0"
  }
}
```

> Note: `drizzle-orm@0.45.2` and `drizzle-kit@0.31.10` are the latest
> stable versions (both confirmed on npm as of mid-2026). Do not use
> `@rc` variants for production.
```

Total runtime overhead: **~15 KB gzipped** (Drizzle core + neon-http
driver). Lazy-import inside `tools/memory.ts` so agents that don't call
the tool don't pay the cost on every turn. Cold-start impact: ~5 ms,
within the noise of LLM latency.

### 12.3 Turborepo cache

Add `DATABASE_URL` to `globalEnv` in `turbo.json` so cache invalidates
when the connection string changes:

```json
{
  "globalEnv": [
    "GITHUB_TOKEN",
    "EXA_API_KEY",
    "MINIMAX_API_KEY",
    "MINIMAX_API_BASE_URL",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET_TOKEN",
    "TELEGRAM_BOT_USERNAME",
    "DATABASE_URL"
  ]
}
```

### 12.4 CI gate

Add `drizzle-kit check` to the typecheck pipeline. It detects schema ↔
migration drift and exits non-zero:

```jsonc
// packages/database/package.json scripts
{
  "typecheck": "tsc --noEmit && drizzle-kit check"
}
```

## 13. Effort Estimate

| Task | Effort | Risk |
|---|---|---|
| Add `drizzle`, `@neondatabase/serverless`, `drizzle-kit`, `tsx` deps | XS | Low |
| Write `schema.ts` (1 table + 5 indexes) | XS (~30 lines TS) | Low |
| Write `client.ts` + `queries.ts` | S (~150 lines) | Low — well-documented pattern |
| Generate initial migration via `drizzle-kit generate` | XS | Low |
| Apply migration to Neon dev branch | XS | Low |
| `tools/memory.ts` (Route A dispatcher) | S (~100 lines) | Low — Zod-bounded |
| `instructions/core-injection.ts` (per app) | XS (~30 lines × 2) | Low |
| Wire into `agent.ts` (just register the tool) | XS | Low |
| Neon signup at neon.tech + paste `DATABASE_URL` into both Vercel projects | XS (5 min) | Low |
| Add `drizzle-kit check` to CI | XS | Low |
| Eval: "remembers the CEO's name across two sessions" | S | Medium — needs two eval sessions |
| Eval: "does not leak product memories to engineering queries" | S | Medium |
| **Total** | **~1 day, ~6 files** | |

## 14. Rollout Plan

1. **Create Neon project** at neon.tech (Free plan), region matching Vercel
   deployment region (likely `iad1`).
2. **Land migration** on a Neon dev branch first (`main` branch stays clean),
   run on a copy of prod data.
3. **Add `schema.ts`, `client.ts`, `queries.ts` + tool** behind a feature
   flag (env var `MEMORY_ENABLED=0` default).
4. **Ship to `head-of-engineering`** Vercel preview. Smoke-test via the
   Telegram bot: "remember that my favorite editor is Neovim" → kill the
   session → new session → "what editor do I prefer?" → expect correct answer.
5. **Ship to `head-of-product`** once engineering is stable.
6. **Flip default** `MEMORY_ENABLED=1` after 1 week of clean operation.
7. **Write evals** in week 2, wire to CI.

## 15. Open Questions

1. **Embedding model lock-in**. We pick `text-embedding-3-small` for v1. If
   we later want to switch to Voyage or Cohere, we re-embed everything (cheap
   at our scale, but worth noting).
2. **Cross-agent read**. Today, engineering cannot read product memories and
   vice versa. Should the CEO be able to ask one agent to surface what the
   other knows? Out of scope for v1; can be solved later with a
   `scope='shared'` filter.
3. **Recall tier retention**. Conversations live forever today. Should we
   expire recall rows after N months? Defer to a privacy review with the CEO.
4. **Memory across distinct CEO devices**. The current Telegram bot identity
   (chat id) is the implicit `user_id`. If the CEO starts using a different
   device, both memories will accumulate under the same `'ceo'` id — correct,
   but we should confirm intent.

## 16. References

- ai-sdk `06-memory.mdx` — three-approach taxonomy (provider tools /
  providers / custom)
- ai-sdk cookbook `guides/custom-memory-tool` — Route A & Route B patterns
- eve `guides/state.md` — `defineState` model (different scope: per-session)
- eve `guides/dynamic-capabilities.md` — `defineDynamic` for per-session
  instructions
- eve `guides/hooks.md` — `message.completed` event for the v2 auto-extraction
- Neon `docs/guides/vercel-overview` — three Vercel integration paths
  (Vercel-Managed / Neon-Managed / Manual)
- Neon `docs/extensions/pgvector` — distance operators, index types
- Neon `docs/ai/ai-vector-search-optimization` — HNSW vs IVFFlat benchmarks
- Neon `faqs/free-plan-limits-and-quotas` — Free plan caps we should know
- Drizzle `docs/connect-neon` — neon-http driver integration
- Drizzle `docs/guides/vector-similarity-search` — pgvector type & HNSW index
- Drizzle `docs/extensions/pg` — full pg extension type list (`vector`,
  `halfvec`, `sparsevec`, `bit`)
- Drizzle `docs/drizzle-kit-generate` — schema → migration workflow
- Drizzle `docs/get-started/neon-new` — Neon-from-scratch setup
- `pg-agent-memory` (MIT) — reference implementation, partial inspiration only