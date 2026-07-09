---
title: "Daily Digest Schedule for deessejs/errors"
date: 2026-07-09
status: draft
owner: ds-team
related_repo: deessejs/errors
related_agents:
  - apps/deessejs-errors-tech-lead
related_docs:
  - docs/internal/reports/deessejs-errors-tech-lead-design-2026-07-09.md
  - docs/internal/reports/memory-schema-refactor-2026-07-09.md
scope: design only — no code in this document
---

## Executive Summary

This document proposes adding **a daily 18:30 FR cron schedule** on the existing `deessejs-errors-tech-lead` agent. Once a day the agent wakes, queries GitHub for activity on `deessejs/errors` over the past 24 hours, and either posts a concise report to the user on Telegram or finishes silently with "nothing done today" when there is no movement.

The work reuses infrastructure already in place: the agent is scoped to the repo, GitHub MCP is wired, and the Telegram bot is registered. The cron-expression timezone complication (DST) is documented as an explicit trade-off rather than papered over with a half-correct value.

The proposal is **design only**; implementation will be tracked separately.

---

## 1. Context and Motivation

`deessejs/errors` is an active TypeScript library with frequent commits. The owner wants a low-friction daily touchpoint with the repo: a single message per day summarising "what changed" so the project state stays top-of-mind without requiring a manual `git log` or GitHub visit.

Today the only paths to project information are:

- Reading the GitHub UI (desktop, requires focus)
- Asking `deessejs-errors-tech-lead` over Telegram (interactive, requires a question)
- Asking `head-of-engineering` over Telegram (crosses the project boundary the user explicitly set)

A scheduled daily digest fits **between** manual visits (too infrequent) and interactive conversation (too much overhead) for routine awareness. It also reinforces the `deessejs-errors-tech-lead` agent's stated role as the project-aware tech lead — a daily summary is one of the natural prerogatives of that role.

---

## 2. Goals and Non-Goals

### Goals

- **Daily, at a fixed time, the user receives a short report** describing what changed on `deessejs/errors` in the last 24 hours.
- If nothing changed, the user receives **one terse "nothing done today" message** rather than silence — silence is indistinguishable from a broken pipeline.
- The pipeline is **stateless across days**: no cron-side state needed. Day-over-day continuity comes from "now − 24h" math.
- Reuse existing infra (`deessejs-errors-tech-lead`, GitHub MCP, Telegram channel) — no new agent, no new Vercel project, no new tool unless strictly necessary.

### Non-Goals

- **Real-time notifications.** This is a once-a-day digest, not a commit webhook.
- **Cross-repo digests.** Scope is `deessejs/errors` only. A future `deessejs/fp-digest` would be a separate schedule if/when `deessejs/fp` gets its own agent.
- **Issue or PR commentary.** The digest is read-only with respect to the repo (matches the agent's "never author code" boundary).
- **Public posting.** The digest goes only to the user, not to the repo (no comment-on-issue, no PR review).
- **Persisted state for the cron itself.** No "last fire time" stored anywhere. The 24h window is computed at fire time.

---

## 3. Schedule Placement

The schedule lives on the existing **`deessejs-errors-tech-lead`** agent — see `apps/deessejs-errors-tech-lead/agent/`.

Reasoning:

- The agent is already **scoped to the repo** (its system prompt treats `deessejs/errors` as its only source of truth).
- **GitHub MCP** is wired (`agent/connections/github.ts`, re-export from `@ds-team/agent-core`). It exposes the tools needed to query commits.
- **Telegram** is wired (`agent/channels/telegram.ts`, fork from `@ds-team/agent-core`). The bot `deessejs_errors_tech_lead_bot` is registered and reachable.
- **Memory** is wired but **not used by this schedule** — the schedule is stateless.
- Adding a new agent would require a new Vercel project, a new set of env vars, and a new deployment pipeline, for a trivial job. Reuse is the right default.

Alternatives considered and rejected:

| Alternative | Why rejected |
|---|---|
| New `deessejs-errors-digest` agent | Over-engineering for one cron expression. Split roles later if needed. |
| Put on `head-of-engineering` | That agent is org-scoped, not repo-scoped. A repo digest leaking onto its plate blurs the boundary. |
| Put on `general-assistant` | That agent is org-wide with no GitHub MCP. Adding GitHub MCP just for a digest inverts the layering. |

The schedule file will be `apps/deessejs-errors-tech-lead/agent/schedules/daily-digest.ts`. Schedules are **root-only** in eve (declared subagents cannot have a `schedules/` directory — see `node_modules/eve/docs/schedules.mdx`), so the location is fixed.

---

## 4. Cron Expression and Timezone

Vercel Cron evaluates cron expressions in **UTC**, with **no DST awareness** (`node_modules/eve/docs/schedules.mdx` §"On Vercel").

The user wants **18:30 heure FR**. Translating:

- **Hiver (CET, UTC+1)** → 17:30 UTC.
- **Été (CEST, UTC+2)** → 16:30 UTC.

A single fixed cron expression cannot cover both without DST support that Vercel Cron does not provide. Three options:

| Option | Cron | Trade-off |
|---|---|---|
| **Winter-aligned** | `"30 17 * * *"` | 18:30 CET (winter) / 17:30 CEST (summer) |
| **Summer-aligned** | `"30 16 * * *"` | 18:30 CEST (summer) / 17:30 CET (winter) |
| **DST-clean** (dynamic scheduling) | "* * * * *" + `scheduleStore` with `nextRunAt` ISO 8601 + FR offset | Year-round 18:30 FR; +~4h of work vs. the cron approach |

**Recommendation:** start with `"30 17 * * *"` (winter-aligned) and accept a 1h drift in summer. The drift is bounded, the user already deals with twice-yearly clock shifts in every other system they use, and the dynamic pattern costs ~4h of work for an unblocking constraint that doesn't bind yet. Migrate to dynamic scheduling only when the drift becomes a real complaint.

The chosen expression will be documented in the file's comment so the limitation is visible at the point of edit.

---

## 5. What Counts as "Modified"

| Signal | Source | Decision |
|---|---|---|
| Commits on `main` in the window | GitHub MCP tool **`list_commits`** (namespaced as `github__list_commits` by eve's MCP tool wiring) with `owner="deessejs"`, `repo="errors"`, `sha="main"`, `since=<ISO 8601>` | **Include.** Primary signal. |
| Pull requests merged in the window | GitHub MCP, `list_pull_requests` (state closed) + filter on `merged_at` | **Defer.** Adds noise; commits already cover 95% of "what changed". Optional follow-up. |
| Releases / tags cut in the window | GitHub MCP, `list_releases` or `list_tags` | **Defer.** Rare; mention if present. |
| Issues opened/closed | GitHub MCP, `list_issues` | **Exclude.** Not "modified" in the user's sense. |

**Verified `list_commits` schema** (sourced via `fresh` from `https://raw.githubusercontent.com/github/github-mcp-server/main/pkg/github/__toolsnaps__/list_commits.snap`, 2026-07-09):

- **Tool name (bare):** `list_commits`
- **Tool name (eve-internal):** `github__list_commits` (namespaced by the `github` MCP connection per `node_modules/eve/docs/connections/mcp.mdx`: *"`toolName` arrives qualified, not as the bare remote name. An MCP tool surfaces to the policy as `<connection>__<tool>`."*)
- **Annotation:** `readOnlyHint: true` — the upstream MCP server self-declares this tool as read-only.
- **Required input parameters:** `owner` (string), `repo` (string).
- **Optional input parameters:** `author` (string), `page` (number, ≥1), `path` (string), `perPage` (number, 1–100), `sha` (string — branch name, tag, or commit SHA), `since` (string, ISO 8601: `YYYY-MM-DDTHH:MM:SSZ` or `YYYY-MM-DD`), `until` (string, ISO 8601).
- **Description:** *"Get list of commits of a branch in a GitHub repository. Returns at least 30 results per page by default, but can return more if specified using the perPage parameter (up to 100)."*

Implication for the schedule: at fire time, the prompt computes `since = new Date(Date.now() - 24*60*60*1000).toISOString()` and asks the agent to call `github__list_commits({ owner: "deessejs", repo: "errors", sha: "main", since })` exactly once. Default `perPage=30` is fine; we cap output at ~10 in the report formatting regardless.

The default report scope is **commits on `main` in the last 24h**, one line each: short-SHA, author, message subject. If the count exceeds ~10, truncate with an `(N more on GitHub)` pointer.

---

## 6. Time Window

The "today" semantics admits two readings:

- **Rolling 24h** since the previous fire: `since = now − 24h`.
- **Strict day window** 00:00 → 18:30 FR.

**Recommendation:** rolling 24h, computed at fire time. Stateless, robust to cron drift, robust to DST, and reads naturally to a user receiving the digest at 18:30 as "here is what happened since yesterday's digest". The user's "nothing done today" phrasing still holds because both interpretations coincide on the empty case.

Strict day-window math adds a timezone dependency (`Europe/Paris` → UTC offset for today's date) for no observable benefit at this frequency.

---

## 7. Delivery Channel

### 7.1 Choice — Telegram

The user already reaches every `ds-team` agent over Telegram; this is the natural channel for a daily push. The bot `deessejs_errors_tech_lead_bot` is registered (`apps/deessejs-errors-tech-lead/.env`), the webhook secret is set, and the channel is wired into the agent via `agent/channels/telegram.ts`.

Alternatives considered and rejected: Slack (not wired), Discord (not wired), GitHub issue comment (adds noise to the repo), email (not wired).

### 7.2 `telegramChannel` `receive()` — confirmed supported

The Telegram channel **does** expose the `receive(channel, …)` pattern used by eve schedules. Sourced from `node_modules/eve/docs/channels/telegram.mdx` §"Proactive sessions" (verified 2026-07-09):

> Start a session without an inbound message through `receive(telegram, { message, target, auth })` from a schedule `run` handler, or `args.receive(telegram, ...)` from another channel. `target.chatId` is required. Add `messageThreadId` to land in a specific forum topic.

Operative details for the digest schedule:

- `target.chatId` is **required**. The handler reads `TELEGRAM_ALLOWED_USER_ID` (or a dedicated `DAILY_DIGEST_TELEGRAM_CHAT_ID`) from the environment at fire time and passes it through.
- `target.messageThreadId` is **optional**; the digest does not need it unless the user explicitly wants the report in a specific Telegram forum topic.
- Anchor behaviour matches the upstream docs: private chats stay keyed to the chat; group / supergroup sends anchor to the bot's reply message id, so multiple proactive sends in the same group keep distinct session continuations.
- The same `CrossChannelReceiveFn` signature that `schedules.mdx` §handler documents is what `telegramChannel` accepts — no extra type adapters needed.

**Original risk is resolved.** The Plan-A shape (handler mode + `receive(telegram, …)`) is the confirmed path. Plan B (a bespoke `send_telegram_message` tool) is no longer needed and is dropped from the design.

### 7.3 Target — chat ID

The cron needs a concrete target chat ID. The user is the only whitelisted Telegram user (`TELEGRAM_ALLOWED_USER_ID` env, currently unset — see §10). The schedule handler will read this env var at fire time and pass it as `{ chatId }`. No user prompt, no LLM action — pure deterministic routing.

---

## 8. Schedule Shape — `run` (handler) vs. `markdown` (task mode)

Two modes per `node_modules/eve/docs/schedules.mdx`:

| Mode | Capabilities | Best for |
|---|---|---|
| `markdown` (task mode) | Single prompt runs to completion or fails; **cannot park** | Stateless tasks without channel delivery |
| `run` (handler) | Can compute prompt at fire time, branch on conditions, `receive()` channels; **can park** on the same durable runtime as inbound sessions | Tasks that deliver to channels or compose multiple queries |

**Recommendation:** `run` (handler), because:

- The "if empty → finish without sending" branch is documented as the handler-mode idiom (`schedules.mdx` §handler: *the agent does not have to deliver a message on every run*).
- Composing future additions (PRs, releases) is cleaner with a handler than by appending to one growing `markdown` prompt.
- The `markdown` (task mode) would push the empty-vs-non-empty decision into the LLM prompt, which is fine but less explicit.

Either mode would work; this is a small preference, not a blocker.

---

## 9. Report Format

These are illustrative shapes; actual wording is owned by the LLM at fire time within tone constraints from the agent's `instructions.md`.

**Empty case:**

```
📭 deessejs/errors — nothing done today (since 2026-07-08 17:30 UTC).
```

**Non-empty case:**

```
📬 deessejs/errors — 3 commits on main since 2026-07-08 17:30 UTC:

• a1b2c3d  alice  — fix: handle null in wrapAsync (#142)
• b2c3d4e  bob    — docs(readme): refresh broken-link table
• c3d4e5f  alice  — chore: bump @deessejs/fp to 1.4.2

See: https://github.com/deessejs/errors/compare/<old-sha>...<new-sha>
```

**Truncation case (>10 commits):**

```
📬 deessejs/errors — 17 commits on main since 2026-07-08 17:30 UTC.
First 10:

• a1b2c3d  ...
• ...

(7 more on GitHub.)
```

---

## 10. Idempotence and Failure Mode

### 10.1 At-most-once delivery

Vercel Cron does not retry-on-fail by default; eve schedules are at-most-once. For this task the consequences are mild:

- Late or missed digest: the **next** day's digest covers the missed window (rolling 24h means no data is lost, only delayed).
- Permanent failure: silent from the user's perspective.

### 10.2 Logging

Every cron invocation lands in **Vercel Observability → Logs** (per `schedules.mdx` §"On Vercel"). Sufficient for debug in v1.

### 10.3 Failure alerting — deferred

A "this many consecutive failures" counter in `@ds-team/database` could trigger a fallback alert. Out of scope for v1; revisit only if silent failures become a recurring pain.

### 10.4 Telegram whitelist coupling

The `deessejs-errors-tech-lead` bot **currently has no `TELEGRAM_ALLOWED_USER_ID` set** (raised as a risk in the design doc review). The digest's target chat ID must come from the same env var when it is set. Until then the digest is technically reachable by any Telegram user, which is acceptable because (a) the agent currently has no write GitHub tools and (b) the digest exposes only commit summaries that are already public on GitHub. The risk grows if write tools land before the whitelist is fixed — see Open Question §12.1.

---

## 11. Cost and Quota

| Resource | Limit | This schedule |
|---|---|---|
| Vercel Cron (Hobby) | 2 cron jobs / day | 1 / day — comfortable |
| Vercel Cron (Pro) | 40 cron jobs | 1 / day — invisible |
| GitHub MCP (PAT, 5000 req/h) | Per-hour | 1 req / day — invisible |
| Model (MiniMax-M3, Vercel pay-as-you-go) | Per-token | ~few hundred tokens / day — < €0.01 / day |

No quotas or budgets are at risk.

---

## 12. Open Questions

These need answers before implementation:

1. **Package scope.** Confirm `deessejs/errors` is the intended target. If multiple packages should be digested, the schedule shape may need to change (one schedule per package, or one handler that iterates).
2. **Delivery channel.** Confirm Telegram (`deessejs_errors_tech_lead_bot` DM to the user) is the right channel. If a separate bot or a different chat surface is preferred, the env-var + handler wiring changes.
3. **"Modified" definition.** ~~Confirm `list_commits` on `main` only.~~ **Resolved 2026-07-09:** scope confirmed as `github__list_commits` on `main` only. Tool name + parameters verified against the upstream `github-mcp-server` snapshot (see §5). If PR-merged-feed or releases should be added later, they are additional `github__*` calls in the same fire-time prompt.
4. **Cron expression.** Confirm `"30 17 * * *"` (winter-aligned, 1h drift summer) is acceptable vs. investing in dynamic scheduling for DST correctness. Annual DST dates in EU are predictable; the drift is only ±60 min twice a year.
5. **Schedule mode.** `run` (handler) recommended. OK vs. `markdown` (task mode)?
6. **Empty wording.** `"nothing done today"` is the user's exact phrase; the LLM may rephrase in French or keep this exact English string. Decision: keep it tight and predictable, or let the LLM draft.
7. **Telegram `receive()` support.** ~~Verify before writing code.~~ **Resolved 2026-07-09:** confirmed against `node_modules/eve/docs/channels/telegram.mdx` §"Proactive sessions". The signature is `receive(telegram, { message, target: { chatId }, auth })`. No bespoke `send_telegram_message` tool is required.
8. **Telegram whitelist.** The agent design review flagged `TELEGRAM_ALLOWED_USER_ID` as missing. The digest's target chat ID can use the same var. Fix before production-readiness of the digest, even if not strictly required for the v1 read-only path.
9. **First implementation milestone.** Should the digest ship before or after phase 2 (GitHub bespoke read tools) lands on `deessejs-errors-tech-lead`? The digest depends only on the raw GitHub MCP, not on bespoke tools — it can ship independently.

---

## 13. References

### Project-internal

- `apps/deessejs-errors-tech-lead/` — agent that will host the schedule
- `apps/deessejs-errors-tech-lead/agent/channels/telegram.ts` — to verify `receive()` support
- `apps/deessejs-errors-tech-lead/agent/connections/github.ts` — GitHub MCP wiring
- `apps/deessejs-errors-tech-lead/.env` — already has Telegram bot + GitHub token
- `packages/agent-core/src/channels/telegram.ts` — upstream Telegram channel implementation
- `packages/agent-core/src/connections/github.ts` — upstream GitHub MCP connection
- `docs/internal/reports/deessejs-errors-tech-lead-design-2026-07-09.md` — agent design context
- `docs/internal/reports/memory-schema-refactor-2026-07-09.md` — agent identity conventions used by the schedule's `appAuth`

### External

- `node_modules/eve/docs/schedules.mdx` — `defineSchedule` API, handler vs. markdown, UTC on Vercel, root-only, dev dispatch route
- `node_modules/eve/docs/patterns/dynamic-scheduling.md` — multi-tenant pattern (out of scope for v1; relevant if DST migration is pursued)
- `node_modules/eve/docs/channels/telegram.mdx` — Telegram channel; §"Proactive sessions" confirms `receive(telegram, …)` with `target.chatId`
- `node_modules/eve/docs/connections/mcp.mdx` — MCP tool wiring; describes `<connection>__<tool>` naming and the approval-gate / `tools.{allow,block}` filter mechanism
- https://eve.dev/docs/schedules — public URL mirror
- https://eve.dev/docs/patterns/dynamic-scheduling — public URL mirror
- Vercel Cron Jobs — https://vercel.com/docs/cron-jobs (UTC evaluation, plan-based quotas)
- **GitHub MCP server** — https://github.com/github/github-mcp-server (upstream). Tool schema snapshot at `https://raw.githubusercontent.com/github/github-mcp-server/main/pkg/github/__toolsnaps__/list_commits.snap` confirmed via `fresh fetch` on 2026-07-09 — `list_commits` is `readOnlyHint: true`, requires `owner` + `repo`, accepts `since` / `until` ISO 8601.
