---
title: "Time Awareness Injection — Auto-Injecting the Current Time into Every Agent Turn"
date: 2026-07-13
status: draft
owner: ds-team
related_repo: ds-team (apps/*, packages/agent-core)
related_agents:
  - apps/head-of-engineering
  - apps/head-of-product
  - apps/general-assistant
  - apps/deessejs-errors-tech-lead
  - apps/home-automation-assistant
  - apps/fitness-coach
  - apps/finance-expert
  - apps/personal-development-coach
related_docs:
  - docs/internal/reports/daily-digest-design-2026-07-09.md
  - docs/internal/reports/memory-schema-refactor-2026-07-09.md
  - docs/internal/reports/telegram-voice-transcription-architecture-2026-07-08.md
scope: design only — no code in this document
---

## Executive Summary

Today, no `ds-team` agent receives the current time. When a user mentions *« ce matin »*, *« hier soir »*, *« in two hours »*, *« last week »*, the agent has no anchor to disambiguate — it must ask the user, or guess. This is a recurring friction point reported across all eight deployed agents.

This document captures the design options for **injecting the current time as a system-prompt block on every turn**, using the eve framework's `defineDynamic` primitive that the repo already exercises for the long-term-memory block (`apps/*/agent/instructions/core-injection.ts`).

Key decisions recorded here:

- **The right primitive is `defineDynamic` + `turn.started`**, not `session.started` — Telegram sessions can idle for hours, so per-turn freshness matters more than per-session caching.
- **The injection point is `agent/instructions/time-injection.ts`**, parallel to the existing `core-injection.ts` pattern. This keeps the convention consistent across the monorepo.
- **Timezone resolution is a 3-tier fallback**: env var `AGENT_TIMEZONE` → core memory key `timezone` → UTC. This honors both stable per-agent defaults (most agents serve a single user in a known TZ) and one-off user overrides (when the user travels).
- **The block format is multi-line** (UTC + local + day-of-week + week number). Agents reason over relative phrases, so ISO-only format leaves them to do arithmetic.
- **No shared factory in `@ds-team/agent-core` is added in this iteration.** Mirroring `core-injection.ts` per agent keeps the change auditable and the per-agent env-var wiring explicit.
- **Telegram-specific anchor**: when the inbound message carries `msg.date` (Unix timestamp), that value is preferred over `Date.now()` so the displayed time reflects the moment the user pressed send, immune to Vercel queue delay.

---

## 1. Context and Motivation

`ds-team` agents have rich long-term memory but no *short-term* anchor — they don't know what time it is right now. Concrete consequences observed in production:

- *« J'ai fait ma séance ce matin »* → agent asks *« Quand ? »* even though "ce matin" is unambiguous to a clock-aware reader.
- *« Rappel-moi dans 2h »* → agent has to ask the user to specify the deadline.
- *« Hier soir j'ai shipped X »* → agent must either ask or guess; either way the user pays a round-trip.
- Memory paths like `/memories/notes/YYYY-MM-DD.md` are unambiguous in form but only if the agent knows today's date — otherwise the agent invents or asks.

A `grep` for `new Date\(\)|now\(\)|Date\.now` across `apps/` and `packages/agent-core/` confirms no runtime code produces a timestamp for the model. The only `Date.now()` call lives in `apps/deessejs-errors-tech-lead/agent/schedules/daily-digest.ts:34`, where it computes `since` for a GitHub query — never injected into a turn.

### Adjacent precedent

The repo already runs a `defineDynamic` resolver on every session (`apps/fitness-coach/agent/instructions/core-injection.ts`):

```ts
export default defineDynamic({
  events: {
    "session.started": async (_event, _ctx) => {
      const core = await readCoreMemory({ viewerId: "fitness-coach" });
      if (!core) return null;
      return defineInstructions({
        markdown: `## Long-term memory\n\n${core}\n`,
      });
    },
  },
});
```

The same primitive, with a different event (`turn.started` instead of `session.started`) and a different data source (`Date.now()` instead of `readCoreMemory`), solves the time-awareness problem with zero new infra.

---

## 2. Goals and Non-Goals

### Goals

- Every model call sees the current time (and date) of the user's timezone without the user having to provide it.
- The block is accurate to within seconds at the moment the model call starts.
- The block survives Telegram's idle-session behavior (sessions can last hours with bursts of activity; `session.started` alone would stale-out).
- Adding the block requires zero changes to channels, tools, or schedules.
- DST is handled correctly without manual intervention.
- The pattern is testable in isolation (the formatter takes `Date` and `tz`, no `Date.now()` inside).

### Non-Goals (this iteration)

- **Calendaring.** Knowing *when* "next Monday" falls or whether two dates are in the same week is the model's job; we provide the anchor, not the algebra.
- **Holiday / business-hours awareness.** Out of scope; the agents reason about that themselves if they need it.
- **Multi-tenant timezones.** `ds-team` is single-user-per-agent today; per-caller timezone resolution is deferred.
- **Replacing `Date.now()` in agent code.** Schedules (e.g. `daily-digest.ts`) keep their own clock; this work does not touch them.
- **Shared `agent-core` factory.** Keeping `time-injection.ts` per agent (mirroring `core-injection.ts`) preserves the explicit-per-agent wiring convention. A shared factory is a future refactor once the pattern stabilizes across all 8 agents.

---

## 3. The Two Candidate Events

eve exposes two events relevant here. Both are documented in `node_modules/eve/docs/guides/dynamic-capabilities.md`.

### 3.1 `session.started`

| Property | Value |
|---|---|
| When it fires | Once, when the session is created |
| Resolver return shape | `defineInstructions(...)` |
| Survives across turns in a session | Yes (cached) |
| Cost | One resolver call per session |
| Staleness risk | High for Telegram — sessions can stay open for hours between user messages |

### 3.2 `turn.started`

| Property | Value |
|---|---|
| When it fires | Once per turn (before the model's first call in that turn) |
| Resolver return shape | `defineInstructions(...)` |
| Survives across turns | No — re-resolves every turn |
| Cost | One resolver call per turn |
| Staleness risk | Negligible (seconds at most, between resolver and model call) |

### 3.3 Recommendation

`turn.started`. The freshness guarantee outweighs the marginal per-turn cost — the resolver body is synchronous and short (no DB read in the proposed design, see §6.4), and the cost of stale time is a user-visible failure mode we are explicitly fixing. `session.started` is the right primitive for slowly-changing context (long-term memory); `turn.started` is the right primitive for fast-changing context (the current time).

---

## 4. Timezone Resolution

Time without a timezone is worse than no time at all — it invites the *same* ambiguity we're trying to remove. Three sources, in priority order:

### 4.1 Tier 1 — Per-agent env var `AGENT_TIMEZONE`

Set at deploy time. Stable, no runtime cost. Matches the ds-team model: each agent is single-user, the user has a known home timezone.

```bash
# apps/fitness-coach/.env
AGENT_TIMEZONE=Europe/Paris
```

Format: IANA timezone identifier (e.g. `Europe/Paris`, `America/New_York`, `Asia/Tokyo`). Validated at resolver time; invalid values fall through to tier 2.

### 4.2 Tier 2 — Core memory key `timezone`

If `AGENT_TIMEZONE` is unset, the resolver reads the user's stored timezone from `/memories/core.md` (or the equivalent core-memory lookup used by the agent). The user sets this once via conversation ("I'm in Berlin now") and it persists.

This adds one DB read per turn. Caching at the session level is a future optimization; the read is bounded (`memories.agent_tier_idx` covers it) and the same row is fetched by `core-injection.ts` anyway.

### 4.3 Tier 3 — UTC fallback

If neither env var nor memory carries a timezone, the block displays UTC. The user sees a UTC time and *understands* it's a fallback — the format makes it explicit (separate UTC line in §5). Avoids silent wrong-time errors.

### 4.4 Source priorities (proposed)

| Source | Priority | Rationale |
|---|---|---|
| Telegram `msg.date` (Unix timestamp) as the **anchor** | Highest | Reflects the moment the user pressed send; immune to queueing |
| `AGENT_TIMEZONE` env var | High | Deploy-stable, no runtime cost |
| `timezone` core-memory key | Medium | Per-user override (travel, relocation) |
| UTC | Fallback | Always available; surfaced explicitly in the block |

---

## 5. Block Format (proposed)

```md
## Current time

- UTC:    2026-07-13T10:23:45Z
- Local:  Monday, July 13 2026, 12:23 (Europe/Paris, UTC+02:00)
- Day:    Monday (week 29 of 2026)
- Source: 2026-07-13T10:23:30Z (Telegram msg.date)
```

Why this shape:

- **UTC line**: always present, always unambiguous. Lets the agent reason in UTC when needed (e.g. comparing with `created_at` from the DB, which is always UTC).
- **Local line with named TZ + offset**: lets the agent reason about user-facing relative phrases (*« ce matin »*, *« demain matin »*, *« Friday evening »*) without doing timezone arithmetic.
- **Day-of-week + ISO week number**: covers phrases like *« by Friday »*, *« next week »*. Cheap to compute, frequently needed.
- **`Source` line**: when the anchor is `msg.date`, it surfaces the staleness (or freshness) explicitly. When the anchor is `Date.now()`, the line is omitted.

A shorter ISO-only format (option A in the analysis) was considered and rejected: it forces the model to do timezone arithmetic on every relative phrase, which is the exact failure mode we're fixing.

The block is identical across all agents — no agent-specific fields — because every agent has the same need.

---

## 6. Proposed Design (per-agent file)

### 6.1 File location

`apps/<agent>/agent/instructions/time-injection.ts`

This mirrors `core-injection.ts` placement exactly. Alphabetical sort (per eve's documented behavior) places `core-injection.ts` before `time-injection.ts` in the merged prompt, which is the right ordering — identity first, time second.

### 6.2 Resolver shape (design only, not final code)

```ts
// apps/<agent>/agent/instructions/time-injection.ts
import { defineDynamic, defineInstructions } from "eve/instructions";

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const tz = resolveTimezone(ctx);   // tier 1 → 2 → 3, see §4
      const anchor = resolveAnchor(ctx); // Telegram msg.date or Date.now()
      const block = formatTimeBlock(anchor, tz, ctx);
      return defineInstructions({ markdown: block });
    },
  },
});
```

Three helpers, each independently testable:

| Helper | Responsibility | Inputs | Output |
|---|---|---|---|
| `resolveTimezone(ctx)` | Pick the right TZ source per §4 | `ctx` (env access), optional memory read | IANA TZ string |
| `resolveAnchor(ctx)` | Pick the right "now" anchor per §4 | `ctx` (channel metadata) | `Date` |
| `formatTimeBlock(anchor, tz, ctx)` | Render the markdown block | `Date`, IANA TZ, `ctx` | string |

The split matters: `formatTimeBlock` is a pure function of `(anchor, tz)`. Tests pin its output to a fixed `Date` and TZ. `resolveTimezone` and `resolveAnchor` are integration-tested against the channel and memory layers separately.

### 6.3 DST

DST is handled by `Intl.DateTimeFormat` natively. Node 24 supports the full IANA tz database. No `process.env.TZ` is set or required at runtime; the resolver passes `timeZone: tz` to every `Intl` call.

The Vercel serverless runtime defaults to UTC. Forcing `TZ=Europe/Paris` via Vercel project settings is **not recommended** — it bypasses per-agent configuration and creates coupling between the agent and the deployment environment. The explicit IANA string in the resolver is the right abstraction.

The DST hazard flagged in `apps/deessejs-errors-tech-lead/agent/schedules/daily-digest.ts:8` ("Vercel Cron has no DST awareness") is **unrelated** to this design — that comment is about cron job scheduling, not display formatting. No migration is implied.

### 6.4 Cost analysis

Per turn:

- `Intl.DateTimeFormat` construction: ~1ms (Node caches it after first call)
- Two `Intl.DateTimeFormat().format()` calls: negligible
- Memory read (only when tier-2 fires): one indexed lookup, ~5ms on Neon
- Block assembly + prompt merge: <1ms

The expensive path (memory read) fires only on the first turn of a session if `AGENT_TIMEZONE` is unset, and otherwise never. `core-injection.ts` already reads the same row on `session.started`, so a future optimization could merge the two reads.

---

## 7. Cross-Cutting Considerations

### 7.1 Telegram `msg.date` as the anchor

The Telegram webhook payload includes a `date` field (Unix timestamp) on every message. Using it as the anchor — instead of `Date.now()` at resolver time — has two benefits:

- **Immune to queue delay.** Vercel functions can warm up in seconds; the displayed time still reflects when the user pressed send.
- **Deterministic in tests.** Tests pin `ctx.telegram.msg.date` to a fixed value; no mocking `Date.now()`.

The trade-off: `msg.date` is the *send* time, not the *model-call* time. If a turn takes 30s to generate, the user sees "12:23" at the top of the agent's reply even though the model is replying at 12:24. This is the **right** behavior — the user thinks in terms of when they asked, not when the reply was generated.

For eve HTTP (non-Telegram) channels, `ctx` does not carry a `msg.date` equivalent. Fall through to `Date.now()`.

### 7.2 Localizations

This iteration ships English-only blocks. French, Spanish, etc. follow naturally by adding an `AGENT_LOCALE` env var and passing it through `Intl.DateTimeFormat`. Out of scope until requested.

### 7.3 Per-agent vs shared factory

The pattern matches `core-injection.ts`: one file per agent, ~20 lines each, identical except for the `agentId` and (in this case) the per-agent `AGENT_TIMEZONE` env var.

A shared `createTimeInjection({ agentId })` factory in `@ds-team/agent-core` would save ~120 lines across the monorepo. **Not done in this iteration** because:

1. The current per-agent duplication is the repo's convention for `core-injection.ts`.
2. Per-agent env-var wiring is more visible when each file lives next to its `instructions.md`.
3. Premature consolidation: the resolver body may diverge per agent (e.g. `home-automation-assistant` might want to include sunrise/sunset for the user's location; `fitness-coach` might want to include "days since last session").

A consolidation PR is the natural follow-up once 3+ agents ship the same resolver.

### 7.4 Existing core-injection coupling

`core-injection.ts` runs on `session.started` and pulls from `readCoreMemory`. The proposed `time-injection.ts` runs on `turn.started` and *may* (tier 2 only) pull from the same core memory row. If both fire in the same turn — yes, `session.started` always fires before `turn.started` per the eve ordering documented in `dynamic-capabilities.md` — the memory row is read twice.

For tier 1 (env var set), no memory read happens, so there's no coupling. For tier 2, the cost is one redundant indexed read per turn; both reads hit the same row and benefit from Neon plan caching. Not worth optimizing now.

### 7.5 What the agent does with the block

The instructions shipped with each agent (e.g. `apps/fitness-coach/agent/instructions.md`) already use relative phrasing (*« ce matin »*, *« yesterday's session »*). The block is the input; the agent's existing instructions tell it how to reason with that input. No `instructions.md` patches are required in this iteration — the resolver returns the block, the model's prior training tells it to use `## Current time` blocks as ground truth (same pattern as `## Long-term memory`).

A future iteration could add a sentence to each agent's `instructions.md`: *« The \`## Current time\` block at the top of your context is authoritative for relative time references. »* — but again, this is implicit in how `## Long-term memory` is treated today.

---

## 8. Resolved Decisions and Open Questions

### Resolved (design phase)

1. **Event**: `turn.started`, not `session.started`. Freshness over caching.
2. **Block location**: `apps/<agent>/agent/instructions/time-injection.ts`, mirroring `core-injection.ts`.
3. **Block format**: UTC line + local line + day/week line, optional source line. Multi-line.
4. **Timezone priority**: env var → core memory → UTC.
5. **Anchor**: Telegram `msg.date` when available, `Date.now()` otherwise.
6. **DST**: `Intl.DateTimeFormat` with explicit IANA TZ, no `process.env.TZ`.
7. **No shared factory in this iteration**: per-agent file follows the established convention.
8. **No `instructions.md` patch**: implicit usage via the block header.
9. **No locale switch in v1**: English-only block.
10. **No coupling with `core-injection.ts`**: separate read path, redundant on tier-2 only.

### Open

1. **Telegram thread / topic timing.** Messages in `message_thread_id` topics carry the same `msg.date` shape. No special handling needed, but worth a smoke test once deployed.
2. **`AGENT_TIMEZONE` validation.** Should an invalid IANA string throw at module load, or silently fall through to tier 2? Recommend throw — fail-fast is consistent with the rest of the env-var handling in `packages/agent-core/src/channels/telegram.ts`.
3. **Tier-2 memory key name.** `timezone` is the proposal. Alternative: a richer structured block (e.g. `user_location: { timezone, locale, … }`). Single string is enough for now.
4. **Per-turn vs per-session when `AGENT_TIMEZONE` is set.** If only the env var matters, `session.started` would work too — saving the resolver call per turn. But then a user who travels mid-session can't update the timezone without restarting. Trade-off; current pick is `turn.started` for consistency. Worth re-evaluating.
5. **What to do about scheduled triggers.** `daily-digest.ts` runs as a cron, not a user turn. Should the schedule inject a time block? Currently schedules hardcode the prompt; adding time injection there is a separate, smaller change.

---

## 9. Phased Rollout

| Phase | Deliverable | Status |
|---|---|---|
| 0 | This design document | ✅ (this commit) |
| 1 | `apps/fitness-coach/agent/instructions/time-injection.ts` + env var | Not started — first PR after sign-off |
| 2 | Smoke test on Telegram (DST boundary, travel scenario, idle session) | Manual, after deploy |
| 3 | Replicate to remaining 7 agents (env var differs per agent) | Per-agent PR, smallest blast radius |
| 4 | Optional: consolidate into `@ds-team/agent-core` factory once 3+ agents use the same shape | Deferred |

---

## 10. References

### Internal

- `apps/fitness-coach/agent/instructions/core-injection.ts` — the established `defineDynamic` + `session.started` pattern this design extends.
- `apps/deessejs-errors-tech-lead/agent/schedules/daily-digest.ts` — Vercel-Cron DST hazard (unrelated to display, documented for completeness).
- `packages/agent-core/src/channels/telegram.ts` — fork of `eve/channels/telegram`; `msg.date` is on the raw parsed payload at line 47.
- `docs/internal/reports/memory-schema-refactor-2026-07-09.md` — same frontmatter conventions, same "design-only / no code in this document" scope discipline.
- `docs/internal/reports/daily-digest-design-2026-07-09.md` — format reference for "two-channel scope, no shared infra in v1".
- `docs/internal/reports/telegram-voice-transcription-architecture-2026-07-08.md` — adjacent precedent for "intermediate turn assembly happens in the channel fork, not in the agent".

### External (eve framework)

- `node_modules/eve/docs/guides/dynamic-capabilities.md` — `defineDynamic` reference, event ordering, resolver return shapes.
- `node_modules/eve/docs/instructions.mdx` — `defineInstructions({ markdown })`, directory + alphabetical-merge behavior.
- `node_modules/eve/docs/concepts/sessions-runs-and-streaming.md` — when each event fires relative to model calls.

### External (TS / Node)

- `Intl.DateTimeFormat` — IANA TZ database, DST-aware, native to Node 24. No external dep needed.