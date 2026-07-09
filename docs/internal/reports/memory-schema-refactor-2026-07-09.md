---
title: "Memory Schema Refactor — Separating Agent, Topic, and Visibility"
date: 2026-07-09
status: draft
owner: ds-team
related_repo: ds-team (packages/database)
related_docs:
  - docs/internal/reports/deessejs-errors-tech-lead-design-2026-07-09.md
scope: design only — no code in this document
---

## Executive Summary

The `memories` table in `@ds-team/database` currently overloads a single `scope`
column with three orthogonal concerns: which agent owns the row, what topic
the memory is about, and who can read it. This conflation is the root cause
of the scope-collision problem surfaced by `deessejs-errors-tech-lead` (see
the companion design doc).

This document proposes a **schema refactor** that separates those concerns
into four first-class columns (`agent_id`, `topic`, `visibility`,
`visible_to`), enforced through application-layer rules and an audit trail.

Postgres Row-Level Security was considered and explicitly **rejected** for
this iteration: the enforcement lives in the application code, accepting
the trade-off that defense-in-depth is replaced by code review and tests.
The design leaves the door open for a future RLS phase if and when the
agent count or sensitivity profile justifies it.

**Scope reality (as of 2026-07-09)**: the table holds exactly 4 rows, all
in `scope='shared'`, all in `tier='core'`, all with empty `metadata`. They
are CEO profile + project notes + agent-primitive research, semantically
all `topic='general'`. None originate from `head-of-engineering` or
`head-of-product` (those agents have never written a row yet). This makes
the migration trivially safe: dual-write and rollback windows are not
strictly necessary at this scale, but the design keeps the dual-write
pattern anyway for the day a second agent lands writes.

**Effort estimate**: ~4h, single PR. No external consumers, no tests to
update, no public blast radius.

---

## 1. Context and Motivation

`@ds-team/database` is shared by all `ds-team` agents. Today, four agents
write to it:

| Agent | Current `scope` |
|---|---|
| `head-of-engineering` | `engineering` |
| `head-of-product` | `product` |
| `general-assistant` | `shared` |
| `deessejs-errors-tech-lead` | `shared` (collision flagged in TODO) |

The `scope` CHECK constraint (`'engineering' | 'product' | 'shared'`)
forces every new agent into one of three values. Two concrete problems
emerge:

1. **No room for project-bound agents.** Adding a `deessejs-errors` scope
   requires a migration. With more agents coming (planned:
   `deessejs-fp-tech-lead`, future project agents), this becomes a
   recurring tax.
2. **Visibility is conflated with ownership.** The string `shared` is used
   to mean "this memory is intentionally visible across agents", but it
   also gets used as a catch-all bucket when an agent has no natural
   domain (`general-assistant`). Cross-agent visibility is not
   controllable on a per-memory basis.

A new agent (`deessejs-errors-tech-lead`) made the problem acute enough
to design a real fix.

---

## 2. Goals and Non-Goals

### Goals

- Eliminate scope-name collisions as agents are added.
- Make ownership, topic, and visibility first-class, queryable, and
  independently controllable.
- Enforce privacy-by-default: a memory is readable only by its owner
  unless sharing is explicit.
- Provide an audit trail for cross-agent sharing and deletion (RGPD,
  forensics, debugging).
- Ship with a migration path that does not require downtime.

### Non-Goals (this iteration)

- Postgres Row-Level Security. Considered, rejected for now (see §7).
- Per-user partitioning. `user_id` exists but is single-valued (`"ceo"`).
  Multi-user is a separate workstream.
- Embeddings / semantic recall. The `embedding` column was dropped in
  migration `0005_flashy_ultimatum.sql`; current search is pure ILIKE
  keyword, kept as-is.
- Migration of existing data semantics — the migration is structural;
  contents stay where they are.
- Centralizing the memory tool. The agents each have an inline copy of
  `tools/memory.ts`. `packages/database/src/tools/memory.ts` exists but
  has a bug in its `update` command (calls `updateMemory` with 3 args
  instead of 4) and is unused. Centralizing is a follow-up — flagged
  but not bundled with this refactor.

---

## 3. Current Schema

```sql
CREATE TABLE memories (
  id          BIGSERIAL PRIMARY KEY,
  scope       TEXT NOT NULL,                       -- overloaded
  tier        TEXT NOT NULL,                       -- core | archival | episodic | recall
  content     TEXT NOT NULL,
  filename    TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  user_id     TEXT NOT NULL DEFAULT 'ceo',

  CONSTRAINT memories_scope_check
    CHECK (scope IN ('engineering', 'product', 'shared')),
  CONSTRAINT memories_tier_check
    CHECK (tier IN ('core', 'archival', 'episodic', 'recall'))
);
```

Three roles of `scope`:

| Role | What it expresses today | What it should be |
|---|---|---|
| Partition | `engineering` → head-of-engineering writes here | `agent_id` |
| Topic | `engineering` vs `product` vs `shared` | `topic` |
| Visibility | `shared` → cross-agent readable | `visibility` |

---

## 4. Proposed Schema

```sql
CREATE TABLE memories (
  id            BIGSERIAL PRIMARY KEY,

  -- 1. Partition: who wrote this memory
  agent_id      TEXT,                  -- NULLable: backfill-safe; orphan rows are surfaced for manual review

  -- 2. Topic: what semantic domain it belongs to
  topic         TEXT NOT NULL,

  -- 3. Lifecycle
  tier          TEXT NOT NULL,

  -- 4. Visibility (the privacy lever)
  visibility    TEXT NOT NULL DEFAULT 'owner',
  visible_to    TEXT[],

  -- Content
  content       TEXT NOT NULL,
  filename      TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Lifecycle timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ,

  -- Identity
  user_id       TEXT NOT NULL DEFAULT 'ceo',

  CONSTRAINT memories_topic_check
    CHECK (topic IN ('engineering', 'product', 'deessejs-errors', 'general')),
  CONSTRAINT memories_tier_check
    CHECK (tier IN ('core', 'archival', 'episodic', 'recall')),
  CONSTRAINT memories_visibility_check
    CHECK (visibility IN ('owner', 'shared', 'public')),
  CONSTRAINT memories_visible_to_check
    CHECK (
      (visibility = 'shared' AND visible_to IS NOT NULL AND array_length(visible_to, 1) > 0)
      OR (visibility <> 'shared' AND visible_to IS NULL)
    )
);
```

**Note on `agent_id` nullability**: existing rows have no provenance in
`metadata`. Allowing `NULL` keeps the door open for orphan rows to be
flagged and reconciled manually rather than forcing a guess at backfill
time. New writes (post-migration) should always set `agent_id` — the
runtime ensures it.

### Indexes

```sql
-- Most common: my own core memories
CREATE INDEX memories_agent_tier_idx
  ON memories (agent_id, tier)
  WHERE expires_at IS NULL;

-- Cross-agent discovery by topic
CREATE INDEX memories_topic_tier_idx
  ON memories (topic, tier);

-- "What is visible to me?" — uses anyvisible_to lookup
CREATE INDEX memories_visible_to_gin
  ON memories USING GIN (visible_to);
```

### Topic registry

`topic` is a closed set, owned by the platform:

| Topic | Meaning |
|---|---|
| `engineering` | Cross-cutting engineering concerns (architecture, tooling) |
| `product` | Cross-cutting product concerns (prioritization, framing) |
| `deessejs-errors` | Project-bound: the `deessejs/errors` repository |
| `general` | No specific domain (used by `general-assistant`) |

New topics are added via migration, not by agents at runtime.

---

## 5. The Three Rules

### Rule 1 — `agent_id` is set by the runtime, never by the LLM

The `memory.write` tool receives `agent_id` through the runtime context
(closure / dependency injection), not through the Zod schema exposed to
the model. The LLM never sees, fills, or controls this value.

```ts
// NOT this — LLM controls agent_id
const tool = defineTool({
  inputSchema: z.object({ agent_id: z.string(), content: z.string() }),
  execute(input) { ... }
});

// This — runtime injects agent_id
const tool = defineTool({
  inputSchema: z.object({ content: z.string(), topic: z.string() }),
  execute(input, ctx) {
    const agent_id = ctx.agent.id;  // closure, trusted
    return writeMemory({ ...input, agent_id });
  }
});
```

This is the single most important rule. Without it, the other rules are
bypassable.

### Rule 2 — Visibility defaults to `owner`

A memory is readable only by its writer unless sharing is explicit.
Sharing is performed through a dedicated `memory.share` tool, not by
mutating `visibility` directly:

```ts
defineTool({
  name: "memory_share",
  inputSchema: z.object({
    memory_id: z.number().int(),
    target_agent_id: z.string(),
    reason: z.string().optional(),
  }),
  execute({ memory_id, target_agent_id, reason }, ctx) {
    // Ownership check
    const memory = await getMemory(memory_id);
    if (memory.agent_id !== ctx.agent.id) {
      throw new Error("Only the owner can share this memory.");
    }
    // Target validation
    if (!KNOWN_AGENTS.has(target_agent_id)) {
      throw new Error(`Unknown agent: ${target_agent_id}`);
    }
    await setVisibility(memory_id, "shared", [target_agent_id]);
    await audit("share", ctx.agent.id, memory_id, target_agent_id, reason);
    return { ok: true };
  }
});
```

The LLM can ask to share, but every share is ownership-checked,
target-validated, and audited.

### Rule 3 — Audit log for forget and share

```sql
CREATE TABLE memory_audit (
  id              BIGSERIAL PRIMARY KEY,
  memory_id       BIGINT REFERENCES memories(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,        -- 'forget' | 'share' | 'unshare' | 'update'
  actor_agent_id  TEXT NOT NULL,
  target_agent_id TEXT,                  -- for share/unshare
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT memory_audit_action_check
    CHECK (action IN ('forget', 'share', 'unshare', 'update'))
);
```

The audit table is the only persistent record of cross-agent sharing
events. It supports RGPD, debugging (which agent saw what), and rate
analysis (an agent that forgets too aggressively is a signal).

---

## 6. Migration Plan

The migration is **dual-write, then cutover**. No downtime, no
inconsistency window.

### Phase 1 — Schema change + backfill (single migration)

```sql
-- 1a. Add new columns (nullable for safety during backfill)
ALTER TABLE memories
  ADD COLUMN agent_id    TEXT,
  ADD COLUMN topic       TEXT,
  ADD COLUMN visibility  TEXT  DEFAULT 'owner',
  ADD COLUMN visible_to  TEXT[];

-- 1b. Backfill from existing scope.
-- All 4 existing rows are 'shared' with empty metadata → attributed to
-- general-assistant (best guess; only agent that ever wrote to 'shared').
UPDATE memories SET
  agent_id = CASE scope
    WHEN 'engineering' THEN 'head-of-engineering'
    WHEN 'product'     THEN 'head-of-product'
    WHEN 'shared'      THEN 'general-assistant'
  END,
  topic = CASE scope
    WHEN 'engineering' THEN 'engineering'
    WHEN 'product'     THEN 'product'
    WHEN 'shared'      THEN 'general'
  END,
  visibility = 'public';   -- CEO profile + project notes are intentionally cross-agent

-- 1c. Drop the legacy scope column
ALTER TABLE memories DROP COLUMN scope;

-- 1d. Add NOT NULL + CHECK constraints now that data is consistent
ALTER TABLE memories
  ALTER COLUMN topic    SET NOT NULL,
  ALTER COLUMN agent_id SET NOT NULL;

ALTER TABLE memories
  ADD CONSTRAINT memories_topic_check
    CHECK (topic IN ('engineering', 'product', 'deessejs-errors', 'general')),
  ADD CONSTRAINT memories_visibility_check
    CHECK (visibility IN ('owner', 'shared', 'public')),
  ADD CONSTRAINT memories_visible_to_check
    CHECK (
      (visibility = 'shared' AND visible_to IS NOT NULL AND array_length(visible_to, 1) > 0)
      OR (visibility <> 'shared' AND visible_to IS NULL)
    );

-- 1e. New indexes
CREATE INDEX memories_agent_tier_idx  ON memories (agent_id, tier) WHERE expires_at IS NULL;
CREATE INDEX memories_topic_tier_idx  ON memories (topic, tier);
CREATE INDEX memories_visible_to_gin ON memories USING GIN (visible_to);

-- 1f. memory_audit table
CREATE TABLE memory_audit (
  id               BIGSERIAL PRIMARY KEY,
  memory_id        BIGINT REFERENCES memories(id) ON DELETE SET NULL,
  action           TEXT NOT NULL CHECK (action IN ('forget', 'share', 'unshare', 'update')),
  actor_agent_id   TEXT NOT NULL,
  target_agent_id  TEXT,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Why no dual-write phase**: at 4 rows and zero other apps consuming the
DB, the window where the new schema is partially in place is exactly
the duration of one `psql` session. Dual-write helpers, mirror writers,
and read fallbacks would be theater at this scale. If volume grows
materially (100s of rows/day from new agents), the dual-write pattern
returns as a Phase 0 for any subsequent column additions.

**Why `visibility='public'` on backfill**: the 4 existing rows are CEO
profile + project notes + agent research — content the user expressed
intent for general cross-agent use. Defaulting to `public` matches
intent; defaulting to `owner` would orphan them under
`general-assistant` unnecessarily. If intent differs, this is one
`UPDATE` away.

### Phase 2 — Update query layer + every agent

A single PR, atomic with the schema migration:

1. **`packages/database/src/queries.ts`** — every function grows an
   `agent_id` (and topic / visibility where relevant) parameter. The
   runtime (called by tools) supplies `agent_id`; queries never accept
   it from untrusted input.
2. **`packages/database/src/tools/memory.ts`** — fix the existing bug
   in the `update` command (3-arg call to `updateMemory`) **and**
   reintroduce `agent_id` via runtime context. Optionally: promote the
   inline copies in 4 agents to re-export from here.
3. **All 4 agents' `tools/memory.ts`** — replace `SCOPE = "<literal>"`
   with runtime-injected `agent_id`. Pattern is uniform across the 4.
4. **All 4 agents' `instructions/core-injection.ts`** — pass
   `agent_id` to `readCoreMemory()` to scope the read (currently no
   scope, post-migration required).

### Phase 3 — Add `memory.share` and `memory.unshare` tools

Two new tools in `packages/database/src/tools/memory.ts`, both gated
on `agent_id == ctx.agent.id` ownership check, both writing to
`memory_audit`.

### Phase 4 — Optional: centralize the tool

Today every agent inlines a near-identical copy of `memory.ts`. The
centralized version at `@ds-team/database/tools/memory.ts` exists but
has a bug. Post-migration is a clean moment to:

- Fix the centralized tool's `update` bug.
- Migrate the 4 agent inline copies to `export { default } from "@ds-team/database/tools/memory"`.
- This is *strictly* the spec from
  `docs/internal/product/features/agent-memory.md`, just delayed.

Optional because it's orthogonal to the schema refactor and the
divergence is currently invisible (all 4 copies are byte-identical
except for SCOPE).

### Phase 5 (deferred) — RLS

If and when the agent count crosses ~8 or the sensitivity profile
demands it, activate Postgres RLS on top of this schema. The schema is
already shaped to make RLS trivial to add (see §7).

---

## 7. Why No RLS (Yet)

Row-Level Security was considered and explicitly deferred:

| Aspect | With RLS | Without RLS (this design) |
|---|---|---|
| Enforcement point | DB (defense-in-depth) | Application code |
| Failure mode on bug | DB rejects the query | App code rejects, but a misconfigured connection could bypass |
| Migration cost | +1 connection-setup step per query (`SET LOCAL app.agent_id`) | None |
| Test surface | DB + app | App only |
| Operational risk | One setting wrong → all reads fail | Lower blast radius per bug |

For the current agent count (~4) and trust model (single-author, single
Vercel team, no multi-tenancy), the cost of RLS outweighs the benefit.
The schema is designed so that adding RLS later requires no schema
change — only policies and connection setup:

```sql
-- Hypothetical future RLS policy (not applied now)
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY memory_read_policy ON memories FOR SELECT
  USING (
    current_setting('app.agent_id', true) = agent_id
    OR visibility = 'public'
    OR current_setting('app.agent_id', true) = ANY(visible_to)
  );

CREATE POLICY memory_write_policy ON memories FOR INSERT
  WITH CHECK (current_setting('app.agent_id', true) = agent_id);

CREATE POLICY memory_modify_policy ON memories FOR UPDATE
  USING (current_setting('app.agent_id', true) = agent_id);

CREATE POLICY memory_delete_policy ON memories FOR DELETE
  USING (current_setting('app.agent_id', true) = agent_id);
```

These policies are written but **commented out** in the migration to
document the path forward.

---

## 8. Trade-offs

### What this design wins

- **No more scope-name tax.** Adding a new agent does not require a
  migration. Only adding a new `topic` does (rare).
- **Per-memory sharing.** The LLM can ask "share memory 42 with
  head-of-product", and that single act is audited.
- **Privacy by default.** A new memory is invisible to other agents
  unless explicitly shared.
- **Clear forensic trail.** Every cross-agent read/write/share is in
  `memory_audit`.
- **Clean mental model.** `agent_id` is who, `topic` is what, `tier` is
  lifecycle, `visibility` is who-else. Four columns, four concepts.

### What this design costs

- **One migration + query-layer update**, single PR, ~4h. No dual-write
  because the data volume does not justify the ceremony.
- **Tool surface grows.** `memory.share` and `memory.unshare` tools
  are now required; raw `memory.write` no longer accepts `visibility`
  directly.
- **One well-known footgun.** If `agent_id` is ever plumbed through the
  Zod schema (by mistake, by a future contributor), Rule 1 is broken
  and the system silently allows cross-agent impersonation. The audit
  table is the safety net for detection, not prevention. Recommend a
  test that asserts `tool.inputSchema` does not contain `agent_id`.
- **No DB-level enforcement.** Bugs in application code can leak.

---

## 9. Resolved Decisions and Open Questions

### Resolved (as of 2026-07-09)

1. **`agent_id` nullability**: schema allows `NULL` during migration
   window; `ALTER ... SET NOT NULL` after backfill. Existing rows are
   fully backfillable (4 rows, all from `general-assistant`-attributed
   `shared`), so `NOT NULL` is safe immediately post-migration.
2. **Backfill attribution**: existing 4 rows are attributed to
   `agent_id='general-assistant'`. If the user disagrees, single
   `UPDATE` away.
3. **Backfill `visibility`**: existing 4 rows go to `visibility='public'`
   because they are CEO profile + project notes + agent research —
   content the user has already broadcast across the platform. Without
   `visibility='public'`, the new model would orphan them unnecessarily.
4. **Backfill `topic`**: all 4 existing rows go to `topic='general'`.
   Matches content semantics.
5. **Topic for cross-cutting shared memories**: `topic='general'`,
   `visibility='public'`. No new vocabulary in the topic registry.
6. **Drop `scope` in the same migration**: confirmed safe at 4-row
   volume; dual-write not justified.
7. **`memory.search` visibility filter**: union of `(agent_id = self)`
   OR `(visibility = 'public' OR self IN visible_to)` — topic-agnostic.
   This becomes part of the updated `searchMemories` in Phase 2.
8. **`memory_share` self-share**: rejected at the API level. Trivial
   `if (target_agent_id === ctx.agent.id) throw`.
9. **Centralize the tool now or later**: optional / Phase 4. Orthogonal
   to the schema refactor. Recommend doing it post-migration when
   the agent_id surface is canonical.

### Still Open

1. **`memory_audit` retention**: how long do we keep rows? Forever?
   1 year? Tied to RGPD semantics of the underlying memory (i.e.
   audit ≤ memory lifetime + grace). Defer to a separate policy doc.
2. **Cross-agent read WITHOUT explicit share**: when `head-of-engineering`
   wants to surface "what does `head-of-product` know about X?" via
   the user, is that a `visibility='public'` query or a delegation?
   Today: delegation. Post-refactor: still delegation. Public is for
   *data*, delegation is for *conversation*. Confirm.
3. **`user_id` partitioning**: still single-valued (`'ceo'`). When a
   second user is onboarded, every `WHERE` clause grows a `user_id`
   predicate. Design phase, not now.
4. **Reintroducing `metadata.agent` convention**: the spec lists this
   key but it's currently never written. Options: (a) drop it
   entirely since `agent_id` is now a column, (b) reintroduce for
   cross-referencing in audit/UI, (c) ignore and fix later. Recommend
   (a) — `agent_id` column replaces it 1-to-1.

---

## 10. References

### Code (current state)

- `packages/database/src/schema.ts` — current schema (`scope` only)
- `packages/database/src/queries.ts` — current read/write functions
- `packages/database/src/tools/memory.ts` — centralized tool (exists, **unused**, has `update` command bug)
- `packages/database/drizzle/` — generated migrations `0000` … `0005`, with snapshots under `meta/`
- `packages/database/scripts/migrate.ts` — migration runner
- `apps/head-of-engineering/agent/tools/memory.ts` — agent-inline tool, `SCOPE='engineering'`
- `apps/head-of-product/agent/tools/memory.ts` — agent-inline tool, `SCOPE='product'`
- `apps/general-assistant/agent/tools/memory.ts` — agent-inline tool, `SCOPE='shared'`
- `apps/deessejs-errors-tech-lead/agent/tools/memory.ts` — agent-inline tool, `SCOPE='shared'` (TODO collision noted in design doc)

### Spec & history

- `docs/internal/product/features/agent-memory.md` — target-state spec for the agent memory layer
- `docs/internal/product/packages/database/README.md` — package README (out of sync with reality; embedded embeddings in target state)
- `docs/internal/reports/deessejs-errors-tech-lead-design-2026-07-09.md` — companion doc that surfaced this refactor

### External (cited by the spec)

- ai-sdk `06-memory.mdx` — three-approach taxonomy
- eve `docs/guides/dynamic-capabilities.md` — `defineDynamic` reference
- Drizzle `docs/drizzle-kit-generate` — schema-to-migration workflow
- Drizzle `docs/connect-neon` — neon-http driver
- Neon `docs/extensions/pgvector` — pgvector on Neon

### Found bugs / debt flagged (informational)

- `packages/database/src/tools/memory.ts:72` — `updateMemory` called with 3
  args instead of 4 in the centralized tool (the 4 agent-inline copies
  all pass 4 args correctly).
- 4 agent apps each inline a near-identical copy of `memory.ts` instead
  of re-exporting from `@ds-team/database/tools/memory` (per the spec).
- Spec docs (`features/agent-memory.md`, `packages/database/README.md`)
  reference embeddings that no longer exist post-migration `0005`.