---
title: "@ds-team/database"
status: proposed
owner: Head of Engineering + Head of Product
last-updated: 2026-07-07
updated-reason: "2026-07-07 — aligned with fresh-verified agent-memory.md: pgvector noted as 0.8.x (covers 0.8.0–0.8.4 on Neon); text-embedding-3-small confirmed available; MiniMax-M3 no embeddings confirmed; Neon free plan limits confirmed; Manual Neon path clarified."
---

# `@ds-team/database`

Shared package for the Deessejs agents' **persistent long-term memory layer**.

> **Status** — This package has not been created yet. Its structure and API are
> defined in the [agent-memory](../features/agent-memory.md) spec. This README
> documents the target state.

---

## Purpose

Gives each agent (`head-of-engineering`, `head-of-product`) access to memory
that survives session restarts, channel switches, and redeployments. The package
contains **no eve dependencies** — it exposes low-level Drizzle helpers and a
`memory` tool that agents import and re-export.

---

## Structure

```
packages/database/
├── drizzle.config.ts               # drizzle-kit (generates migrations)
├── drizzle/                        # Generated migrations
│   ├── 0000_init/
│   │   ├── migration.sql
│   │   └── snapshot.json
│   └── meta/
│       └── _journal.json
└── src/
    ├── schema.ts                   # Source of truth — TABLE memories
    ├── client.ts                   # drizzle(neon(DATABASE_URL), { schema })
    ├── queries.ts                  # readCoreMemory / writeMemory / searchMemories / forgetMemory
    ├── lib/
    │   └── embed.ts                # Vercel AI Gateway → text-embedding-3-small
    └── tools/
        └── memory.ts               # Route A: eve tool, 5 commands (view/create/update/search/forget)
```

---

## Public API

### `queries.ts`

```ts
// Reads all tier='core' rows for a user, concatenated into one string
readCoreMemory(userId?: string): Promise<string>

// Semantic search: embeds the query, returns the K closest rows
searchMemories(opts: {
  embedding: number[];
  userId: string;
  scopes?: string[];    // 'engineering' | 'product' | 'shared'
  tiers?: string[];    // 'core' | 'archival' | 'episodic' | 'recall'
  limit?: number;
}): Promise<MemoryRow[]>
//   → { id, scope, tier, content, metadata, createdAt, similarity }

writeMemory(input: {
  scope: string;
  tier: string;
  content: string;
  embedding?: number[];
  importance?: number;
  metadata?: Record<string, unknown>;
  expiresAt?: Date | null;
}): Promise<MemoryRow>

forgetMemory(id: number): Promise<void>
//   → soft delete: sets expires_at = now()
```

### `lib/embed.ts`

```ts
embedText(text: string): Promise<number[]>
//   → embeds via Vercel AI Gateway / openai/text-embedding-3-small
//   → 1536 dimensions, cosine-compatible with pgvector HNSW
```

### `tools/memory.ts`

```ts
// Re-exported from agent apps
export { default } from "@ds-team/database/tools/memory";

// Available commands:
//   view    path    — reads a logical path (/memories/core.md, etc.)
//   create  scope, tier, content — creates a row (auto-embeds)
//   update  id, content, mode — append or overwrite
//   search  query, scope?, tier?, limit? — semantic search
//   forget  id — RGPD soft delete
```

---

## Schema

### `memories` table

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | Row identifier |
| `scope` | text | `'engineering'` \| `'product'` \| `'shared'` |
| `tier` | text | `'core'` \| `'archival'` \| `'episodic'` \| `'recall'` |
| `content` | text | The memory text itself |
| `embedding` | vector(1536) | Cosine-distance vector, NULL if embed failed |
| `importance` | real | 0.0–1.0, defaults to 0.5 |
| `metadata` | jsonb | Flexible key/value bag — see §Metadata below |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last modification timestamp |
| `expires_at` | timestamptz | Soft-delete deadline (NULL = never) |
| `user_id` | text | CEO identity (defaults to `'ceo'`; reserved for multi-tenant v2) |

Indexes: HNSW on `embedding`, composite B-tree on `(scope, tier)`,
GIN on `metadata`, B-tree on `expires_at` and `created_at`.

### `metadata` conventions

The JSONB `metadata` column carries the structural glue between the relational
store and the LLM-facing logical path API.

| Key | Type | Used by | Description |
|---|---|---|---|
| `path` | string | all tiers | Logical path for non-canonical paths (`/memories/foo.md`) |
| `date` | string | `archival` tier | ISO date for `/memories/notes/YYYY-MM-DD.md` convention |
| `agent` | string | `recall` tier | Agent name that captured the conversation |
| `channel` | string | `recall` tier | Channel where the exchange happened (`telegram`, `eve-dev`, …) |
| `turns` | number | `recall` tier | Count of user/assistant turns in the conversation |
| `tags` | string[] | all tiers | Free-form labels for filtering |
| `source` | string | `core` tier | Provenance of the fact (`user-stated`, `extracted-v2`, `inferred`) |
| `reviewed` | boolean | `core` tier | Whether a human has validated this fact |

**Path resolution logic** (implemented in `tools/memory.ts` dispatcher):

```
if path === '/memories/core.md'     → tier = 'core'
if path === '/memories/conversations.jsonl' → tier = 'recall'
if /memories\/notes\/(\d{4}-\d{2}-\d{2})\.md/.test(path)  → tier = 'archival', date = $1
otherwise                           → metadata->>'path' = path
```

The Zod schema for tool input accepts arbitrary `metadata`, so agents can
extend it at write time. Consumers reading via `searchMemories` can filter by
any key using the GIN index.

---

## Required configuration

### Environment variable

| Variable | Description | Where |
|---|---|---|
| `DATABASE_URL` | Pooled Neon connection string (from *Project → Connection Details*) | Vercel prod + preview, both agents |

**Neon Free plan** — compute is always-on but idles after 5 min of inactivity.
Cold-start resume ~1–2 s, masked by LLM latency. Storage (0.5 GB) is the
real watch item at our scale; overage suspends compute until next billing
cycle. pgvector version on Neon: **0.8.0** (PG14–17) or **0.8.4** (PG18);
the spec uses `0.8.x` to cover both.

### Drizzle config

```ts
// drizzle.config.ts
export default defineConfig({
  out: './drizzle',
  schema: './src/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
});
```

---

## Migration workflow

```bash
# 1 — Edit schema.ts, then generate the SQL migration
pnpm --filter @ds-team/database drizzle-kit generate

# 2 — Inspect the generated SQL in drizzle/<timestamp>_*/migration.sql
git add drizzle/

# 3 — Apply locally (dev) or in CI
pnpm --filter @ds-team/database drizzle-kit migrate

# 4 — Visual inspection (optional)
pnpm --filter @ds-team/database drizzle-kit studio
```

Migration files are **committed** — `git diff drizzle/` is the schema review.

**Rule**: only drizzle-kit-generated SQL in `drizzle/`. No hand-written SQL.
Active Drizzle bug workarounds live in `schema.ts`
(see bugs #[3349](https://github.com/drizzle-team/drizzle-orm/issues/3349),
#[3713](https://github.com/drizzle-team/drizzle-orm/issues/3713)).

---

## Wiring into an agent app

```ts
// apps/head-of-engineering/agent/tools/memory.ts
export { default } from "@ds-team/database/tools/memory";

// apps/head-of-engineering/agent/instructions/core-injection.ts
import { defineDynamic } from "eve/instructions";
import { readCoreMemory } from "@ds-team/database/queries";

export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => {
      const core = await readCoreMemory();
      return defineInstructions({ markdown: `## Long-term memory\n\n${core}\n` });
    },
  },
});
```

---

## Available scripts

```bash
pnpm --filter @ds-team/database typecheck              # tsc --noEmit
pnpm --filter @ds-team/database drizzle-kit generate   # generate migration
pnpm --filter @ds-team/database drizzle-kit migrate   # apply migration
pnpm --filter @ds-team/database drizzle-kit studio     # local GUI explorer
pnpm --filter @ds-team/database drizzle-kit check      # detect schema/migration drift
```

---

## Dependencies

| Package | Role | Type |
|---|---|---|
| `drizzle-orm@^0.45.0` | ORM + pgvector types (0.45.2 latest) | production |
| `@neondatabase/serverless@^0.10.0` | HTTP driver to Neon | production |
| `drizzle-kit@^0.31.0` | Migration CLI (0.31.10 latest; versioned independently from drizzle-orm) | dev |
| `tsx@^4.0.0` | TypeScript runner for drizzle-kit | dev |
| `dotenv` | Loads `.env` in dev | dev |

**Runtime bundle**: ~15 KB gzipped (Drizzle core + neon-http). Lazy-imported
in `tools/memory.ts` — zero cost if the tool is never called.

---

## Known limitations

- **MiniMax-M3 has no embeddings API.** Semantic searches use
  `openai/text-embedding-3-small` via Vercel AI Gateway. If the embeddings
  provider changes, existing rows must be re-embedded.
- **Neon Free** scales to zero. Not blocking for current use case, but worth
  monitoring during the startup phase.
- **`defineDynamic` is one-shot per session** (event `session.started`).
  Mid-session updates to `core` are not re-injected until the session restarts.
  Acceptable v1 tradeoff.
