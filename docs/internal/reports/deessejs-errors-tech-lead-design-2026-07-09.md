---
title: "deessejs-errors-tech-lead — Design Document"
date: 2026-07-09
status: draft
owner: ds-team
related_repo: deessejs/errors
related_agents:
  - .claude/agents/tech-lead (Claude Code sub-agent, retained)
related_docs:
  - docs/internal/audits/telegram-voice-transcription-2026-07-08.md
  - docs/internal/reports/telegram-voice-transcription-architecture-2026-07-08.md
scope: design only — no code in this document
---

## Executive Summary

We are introducing **deessejs-errors-tech-lead**, an eve-based agent scoped exclusively to the `deessejs/errors` repository. It serves as the project-aware tech lead: it answers questions about the codebase, the roadmap, and ongoing work; it can **create GitHub issues** and **review pull requests** on the user's behalf; and it never writes or merges code itself. It will be reachable from a Telegram channel today and from a web channel shortly after, and it is being designed from the start to be consumable as a **remote agent** by other eve agents in the future (notably `head-of-engineering` in `ds-team`).

This document captures the decisions, the constraints, and the architecture. It is design only — implementation will be tracked in a follow-up.

Key boundary call: the existing Claude Code sub-agent at `.claude/agents/tech-lead/` in `deessejs/errors` is **kept**. The eve agent is the HTTP-deployable counterpart; the Claude Code sub-agent stays as the local-loop counterpart. Roles are complementary, not redundant.

---

## 1. Context and Motivation

`deessejs/errors` is an active TypeScript library with a documented roadmap (v1.2.0, v1.3.0, v2.0.0), a real issue taxonomy (type/status/priority/effort), and an existing tech-lead role already implemented as a Claude Code sub-agent. The user can already triage issues from the Claude Code loop, but cannot:

- Reach the tech-lead from a phone (Telegram) without opening a desktop terminal
- Delegate to it from another agent (e.g. `head-of-engineering` asking "is this PR consistent with the errors roadmap?")
- Get a stable, project-aware answer while away from the repo's local environment

`deessejs-errors-tech-lead` fills those gaps. It is not a replacement for the Claude Code sub-agent — it is the same role, surfaced through different transport. It also adds two write capabilities the Claude Code sub-agent already has but that become much more useful over Telegram and from a remote agent: creating issues and reviewing pull requests. The agent never authors code — its relationship to the codebase is **read + review + triage**, not **author**.

---

## 2. Identity

| Field | Value |
|---|---|
| Agent id (eve) | `deessejs-errors-tech-lead` |
| Display name (Telegram / web) | `deessejs-errors-tech-lead` |
| Vercel project name | `deessejs-errors-tech-lead` |
| Production URL | TBD (likely `https://deessejs-errors-techlead.nesalia.com` or `https://techlead.deessejs.com`) |
| Repo of residence | `ds-team` (lives in `ds-team/apps/deessejs-errors-tech-lead/`, deployed from there) |
| Scope of knowledge | `deessejs/errors` only — accessed exclusively through the GitHub MCP, never via local checkout or workspace import |
| Single source of truth for the agent's "knowledge" | The `deessejs/errors` repo at HEAD + recent git history + GitHub issues/PRs |

Naming follows the `<project>-<role>` convention rather than the `<role>` convention used in `ds-team` (`head-of-engineering`, `head-of-product`). This is deliberate: the agent is project-bound, not company-wide. If a similar agent is later added for `deessejs/fp`, it would be `deessejs-fp-tech-lead` — they are distinct agents with distinct scopes.

---

## 3. Scope and Boundaries

The distinction between **residence** (where the agent lives) and **scope** (what it knows about) is critical:

- **Residence**: `ds-team/apps/deessejs-errors-tech-lead/` — the agent's code, infrastructure, deployment, channels, and memory all live in the `ds-team` monorepo.
- **Scope**: `deessejs/errors` only — the agent's *knowledge* is bounded to that repository, accessed exclusively through the GitHub MCP.

`deessejs/errors` is treated as an **external project** from the agent's perspective, even though it lives in the same GitHub org. The agent never imports `@deessejs/errors` and never reads from a local clone — every read is an API call to GitHub. This is what makes the agent honest about its source of truth.

**In scope:**
- Reading the `deessejs/errors` repo (source, tests, docs, CHANGELOG, internal docs under `docs/internal/`)
- Reading the issue tracker, PRs, and recent commits on `deessejs/errors`
- Answering questions about the project: philosophy, roadmap, current state, conventions
- **Creating GitHub issues** on `deessejs/errors` on behalf of the user
- **Reviewing pull requests** on `deessejs/errors`: posting review comments and structured reviews (APPROVE / REQUEST_CHANGES / COMMENT), including inline line comments
- Web search via `fresh` (Exa) for general TypeScript / error-handling context
- Conversing over Telegram with the same model identity

**Out of scope (now):**
- Memory across conversations — explicit deferral, see §8
- Other repositories (no access to `deessejs/fp`, `complete-package-template`, or `ds-team`)
- **Writing code, opening PRs, pushing commits, merging, editing PR titles/branches, or modifying repo settings** — the agent reads code and writes review/issue text only. It is a reviewer, not an author.
- Auto-approving PRs (the human author or designated maintainer remains the gate)
- Approving releases or running `flue run release`
- Speaking externally as Deessejs (no public marketing voice)
- Acting as a sub-agent inside the Claude Code loop (that remains the job of `.claude/agents/tech-lead/`)

**Future (explicitly designed-for, not implemented yet):**
- Acting as a remote agent reachable by other eve agents (e.g. `ds-team` head-of-engineering) via `defineRemoteAgent({ url, auth: vercelOidc() })`
- Persistent memory backed by the same `@ds-team/database` package used by `ds-team`
- Web channel beyond HTTP-for-agents (browser UI / chat widget)

---

## 4. Architecture

### 4.1 Repo placement

The agent lives **inside the `deessejs/errors` monorepo**, as a new eve app. This mirrors the pattern already used in `ds-team` (`apps/<agent-name>/`). The repo's existing `pnpm-workspace.yaml` (`packages/*` + `apps/*`) and `turbo.json` already support a new `apps/*` entry with no infra change.

```
ds-team/
├── apps/
│   ├── head-of-engineering/        # existing
│   ├── head-of-product/            # existing
│   ├── general-assistant/          # existing
│   └── deessejs-errors-tech-lead/  # ← new eve app
│       ├── agent/
│       │   ├── agent.ts             # defineAgent({ model: minimax("MiniMax-M3") })
│       │   ├── instructions.md      # system prompt (identity, scope, voice)
│       │   ├── instructions/        # dynamic injections (no-op until memory lands)
│       │   ├── tools/               # get_project_overview, search_changelog, …
│       │   ├── connections/         # re-exports of github MCP + exa MCP
│       │   └── channels/            # eve HTTP + telegram (re-uses @ds-team/agent-core fork)
│       ├── package.json
│       ├── tsconfig.json
│       └── vercel.json              # Vercel project config (or dashboard settings)
├── packages/
│   ├── agent-core/                  # workspace dep — provides channels
│   ├── database/                    # workspace dep — memory (§8)
│   └── typescript-config/           # workspace dep — tsconfig presets
└── …
```

`deessejs/errors` is **not modified** by this design — the agent accesses it exclusively through the GitHub MCP, never through a local checkout or workspace import. This keeps the boundary clean: `ds-team` is the platform, `deessejs/errors` is the project being served.

### 4.2 Why inside `ds-team` (not `deessejs/errors`)

- `ds-team` is the **agent platform** for the user's org — its purpose is exactly this kind of agent. Adding a project-bound agent there is the natural extension of the pattern, not a stretch.
- The agent reuses `ds-team`'s shared infrastructure directly: `@ds-team/agent-core` for the Telegram channel, `@ds-team/database` (future) for memory, `@ds-team/typescript-config` for tsconfig. Co-location makes those imports zero-cost.
- Other agents in `ds-team` (`head-of-engineering`, `head-of-product`) can call this tech-lead locally or via Vercel OIDC without crossing org boundaries — useful even within the same monorepo for clean separation of deployment lifecycles.
- `deessejs/errors` stays a **pure library repo**: no `eve`, no `ai`, no MCP wiring, no agent code. This matters because that repo is published to npm and consumed by external users; mixing agent infrastructure into it would be a leak of platform concerns into a publishable surface.
- The agent's knowledge of `deessejs/errors` comes from the GitHub MCP — **always the source of truth**, never a stale local checkout.

### 4.3 Stack

Same as the other `ds-team` agents:

| Layer | Choice | Source |
|---|---|---|
| Framework | eve v0.20 | `ds-team`'s choice, already battle-tested with voice channel |
| Model | MiniMax-M3 via direct provider (`vercel-minimax-ai-provider`) | Avoids AI Gateway metering, matches `ds-team` |
| SDK | `ai` v7 | Required by eve + MiniMax provider |
| Auth (inbound HTTP) | `vercelOidc()` + `localDev()` | Same pattern as `ds-team` |
| Channels | eve HTTP + Telegram (via `@ds-team/agent-core` workspace dep) | Reuse of voice transcription pipeline |
| MCP — GitHub | `gh` via MCP server | **Only way the agent reads/writes `deessejs/errors`**. Read: issues, PRs, code, comments, docs. Write: create issues, comment on issues/PRs, post structured PR reviews. **No `contents:write`.** |
| MCP — Web search | `fresh` (Exa) | Consistent with `deessejs/errors/CLAUDE.md` mandate |
| Embeddings | OpenRouter `openai/text-embedding-3-small` (1536 dim) | Deferred to memory phase (§8) |

### 4.4 Dependencies to add

`apps/deessejs-errors-tech-lead/package.json` will declare:

- `eve@^0.20.0`
- `ai@^7.0.0`
- `@ai-sdk/groq@^4.0.5` (for Whisper, used by the Telegram channel)
- `vercel-minimax-ai-provider@^0.0.2`
- `zod@4.4.3`
- `@ds-team/agent-core: workspace:*` — already a workspace dep, no path-based workaround needed
- `@ds-team/typescript-config: workspace:*` — for the tsconfig preset

**`@deessejs/errors` is NOT a workspace dep.** The agent must never import the package directly — all knowledge of `deessejs/errors` flows through the GitHub MCP. This keeps the agent honest about its source of truth and prevents it from reasoning over an outdated local copy.

### 4.5 Environment variables to add

`ds-team/.env.example` already declares `MINIMAX_API_KEY`, `EXA_API_KEY`, `GITHUB_TOKEN`, `GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET_TOKEN`, and `DATABASE_URL` (per `turbo.json` `globalEnv`). We will:

1. Confirm `OPENROUTER_API_KEY` is added to `turbo.json` `globalEnv` (it already is per recent commit `0623ca7`).
2. Add `TELEGRAM_ALLOWED_USER_ID` to both `turbo.json` `globalEnv` and `.env.example` — currently not declared, needed by the Telegram channel.
3. Verify all env vars listed in §4.3's MCP/channel rows are present in `globalEnv`; add any missing ones.

No env var changes happen in `deessejs/errors` — that repo is not touched by this design.

---

## 5. Channels

### 5.1 Telegram (definite, day one)

Same pattern as `ds-team` agents: the agent's `connections/` and `channels/` re-export the shared `@ds-team/agent-core` modules. Specifically:

- `agent/channels/telegram.ts` → re-exports `makeTelegramChannel` from `@ds-team/agent-core/channel/telegram`
- `agent/channels/eve.ts` → re-exports `makeEveChannel` from `@ds-team/agent-core/channel/eve`

This gives the tech-lead **free voice transcription** (Groq Whisper), whitelist via `TELEGRAM_ALLOWED_USER_ID`, group-chat anchoring, and all the hardening documented in `docs/internal/audits/telegram-voice-transcription-2026-07-08.md`.

Telegram is the primary "from anywhere" surface for the user.

### 5.2 Web (planned, shortly after launch)

Two interpretations, both to be kept open:

1. **Agent-as-API**: the deployed eve HTTP endpoint is already a web channel for any HTTP client with a valid Vercel OIDC token. This is the bare minimum and ships for free.
2. **Browser chat UI**: a small web chat surface (probably under `apps/web/techlead` or a separate `apps/web-chat`) that consumes the eve endpoint. Out of scope for the initial launch; design starts once the Telegram channel is stable.

For now, "web" means **eve HTTP reachable by other eve agents** (see §7 and §9). The user-facing browser UI is future work; if/when built, it lives in `ds-team` (either as `apps/deessejs-errors-tech-lead-web/` or alongside another web app in this workspace).

---

## 6. Tools

The agent will expose a small, project-aware toolset. None of these duplicate the GitHub MCP — they wrap or compose it with project-specific knowledge. Read-side tools support both conversational questions and PR review preparation; write-side tools cover issue creation and PR review, with explicit guardrails against code authorship.

### 6.1 Read-side tools

| Tool | Purpose | Backed by |
|---|---|---|
| `get_project_overview` | Returns current version (from `package.json` on `main`), last release, open issues count, recent activity | GitHub MCP (file read at ref + issues API) |
| `get_release_plan` | Returns roadmap from `deessejs/errors/docs/internal/releases/` | GitHub MCP (file tree + file read) |
| `get_taxonomy` | Returns the issue/PR label taxonomy (`type:`, `status:`, `p?:`, `effort:`) | Inlined in tool definition (mirrors `.claude/skills/triage/SKILL.md` in the target repo) |
| `search_internal_docs` | Full-text search over `deessejs/errors/docs/internal/**` | GitHub MCP (file tree + per-file grep-style search) |
| `search_changelog` | Full-text search over `deessejs/errors/CHANGELOG.md` | GitHub MCP (file read + match) |
| `list_open_issues` / `list_open_prs` | Filtered listing on `deessejs/errors` | GitHub MCP |
| `get_recent_commits` | Last N commits on `deessejs/errors` | GitHub MCP |
| `get_pr` | PR metadata (title, body, author, base/head, labels, review status) | GitHub MCP |
| `get_pr_diff` | Unified or per-file diff for a PR | GitHub MCP |
| `get_pr_files` | List of files changed in a PR, with patch hunks | GitHub MCP |
| `get_file_contents` | Read a file at a given ref (used to read full files referenced by a PR) | GitHub MCP |
| `web_search` | Exa-backed search for TS / error-handling context | Exa MCP (`fresh` integration) |

### 6.2 Write-side tools

| Tool | Purpose | Backed by |
|---|---|---|
| `create_issue` | Open a new issue on `deessejs/errors` | GitHub MCP |
| `comment_on_issue` | Post a comment (e.g. triage result) | GitHub MCP |
| `comment_on_pr` | Post a plain PR-level comment (no review state) | GitHub MCP |
| `review_pr` | Post a structured PR review with state `APPROVE` / `REQUEST_CHANGES` / `COMMENT`, optionally including inline line comments | GitHub MCP |

**Critical scope guardrail:** every write tool (`create_issue`, `comment_on_issue`, `comment_on_pr`, `review_pr`) MUST be hard-constrained to the `deessejs/errors` repo. The tool implementation will validate the repo on every call; the model is never trusted to remember the constraint.

**Additional guardrail for `review_pr`:** the agent must never approve a PR it authored itself. Since the agent does not open PRs (§3), this is currently a tautology, but the guardrail is kept in place for the day it might (e.g. auto-generated docs PRs).

**Review output shape:** `review_pr` body should follow a stable template — summary, what changed, what looks good, what needs attention, suggested next steps — so reviews across PRs are comparable and the user can scan them quickly from Telegram or the PR page.

### 6.3 Tools explicitly NOT provided

- `open_pr`, `push_commit`, `merge_pr`, `edit_pr_title`, `edit_pr_branch`, `update_pr_base` — the agent does not author code, ever
- `release_publish`, `release_run` — release remains a human + `release-engineer` (Flue) action for now
- `set_repo_settings`, `edit_labels`, `edit_milestones` — taxonomy and project metadata are owned by humans
- `dismiss_review` — only humans can dismiss a review
- `auto_request_review` — the agent may *be* requested as a reviewer by the user, but does not auto-request itself or others

---

## 7. Connections (MCP)

Two MCPs:

- **GitHub** — required, both read and write. **All knowledge of `deessejs/errors` flows through this MCP — no local checkout, no workspace import.** Read: repo tree, file contents at any ref, issues, PRs, PR diffs, comments. Write: create issues, comment on issues, comment on PRs, post structured PR reviews (`APPROVE` / `REQUEST_CHANGES` / `COMMENT`). **Never:** push commits, open PRs, merge, edit repo settings or labels. The scope of write actions is enforced in the tool layer (§10), not in the model — and the repo is hardcoded to `deessejs/errors` in the connection config.
- **Exa** (`fresh`) — required, mandated by `deessejs/errors/CLAUDE.md` for all web search. Provides general TypeScript / error-handling context when the agent needs to look outside the repo.

Both connections live in `apps/deessejs-errors-tech-lead/agent/connections/`, re-exported from `@ds-team/agent-core/connection/github` and `@ds-team/agent-core/connection/exa`. This is the same pattern as `ds-team`'s `apps/head-of-engineering/agent/connections/`.

---

## 8. Memory (deferred)

Memory is **explicitly out of scope for the initial launch**. We design for it now to avoid painting ourselves into a corner.

When memory lands, it will use the same package as the other `ds-team` agents:

- `@ds-team/database` (Drizzle + Neon + pgvector) — workspace dep, already used by `head-of-engineering`, `head-of-product`, `general-assistant`
- Embeddings via OpenRouter `openai/text-embedding-3-small` (1536 dim)
- The same `memories` table schema (`scope`, `tier`, `content`, `metadata`, `embedding`, …) — with `scope = "deessejs-errors"` to keep memories partitioned from the existing scopes (`engineering`, `product`, `shared`)

The DB lives in `ds-team`'s infrastructure, not in `deessejs/errors`. The agent accesses it as a workspace dep.

Two memory tiers to enable first:

- **core** — durable facts: "user's preferred error message style", "roadmap priorities", "release cadence", "review style preferences (e.g. always flag missing tests, never comment on formatting)"
- **recall** — searchable history of past issues triaged by the tech-lead and past PR reviews it has posted, so it can avoid repeating the same feedback and notice recurring patterns in the codebase

Until memory lands, every conversation starts fresh, mirroring `general-assistant`'s explicit policy in `apps/general-assistant/agent/instructions.md`.

---

## 9. Agent Interoperability (designed-for, partially landed)

The agent lives in `ds-team`, the same monorepo as `head-of-engineering` and `head-of-product`. Interop is therefore two-layered:

### 9.1 Local interop (designed-for, not yet wired)

Inside `ds-team`, another agent (e.g. `head-of-engineering`) can reference the tech-lead via `defineRemoteAgent` — even though they're in the same monorepo, calling cross-deployment is the pattern `ds-team` already uses for its remote agents (e.g. `head-of-engineering/subagents/product.ts` calls `head-of-product` over Vercel OIDC). This keeps each agent independently deployable and scalable.

Concretely, when wired:

```ts
// apps/head-of-engineering/agent/subagents/deessejs-errors-tech-lead.ts
// (illustrative only — not in scope of this document)
export default defineRemoteAgent({
  url: 'https://deessejs-errors-techlead.nesalia.com',
  description:
    'Ask the deessejs/errors tech lead for project state, roadmap, conventions, ' +
    'to open an issue, or to review a pull request. Use for questions and review ' +
    'tasks specific to @deessejs/errors. The agent reads code and writes ' +
    'review/issue text — it does not author code.',
  auth: vercelOidc(),
});
```

The tool id exposed to the calling LLM will be derived from the file path (`deessejs-errors-tech-lead`).

### 9.2 External interop (future)

External orgs / users with Vercel OIDC trust into the user's Vercel team can also call this agent via `defineRemoteAgent`. For that, the agent must:

- Be deployed with `vercelOidc()` enabled on its eve channel (default for eve projects on Vercel).
- Expose a stable DNS-backed URL.
- Carry a precise `description` so calling agents can decide when to delegate.

### 9.3 Forward-looking constraints

The initial launch must not make decisions that prevent either layer of interop — no auth scheme other than `vercelOidc()`, no reliance on Telegram-only state, no scopes that can't be described in a tool description, no assumption that the agent always runs alongside its callers.

---

## 10. Permissions and Security

| Concern | Position |
|---|---|
| Telegram access | Whitelist via `TELEGRAM_ALLOWED_USER_ID` (single user) |
| GitHub write scope | Fine-grained token, restricted to repository `deessejs/errors`, with `issues:write` and `pull_requests:write` (the latter covers PR comments and reviews). No `contents:write` — the agent must never push code. |
| Eve channel auth | `vercelOidc()` for inter-agent calls, `localDev()` for `eve dev`, no `none()` (this agent has write capability) |
| Web channel | Initially inter-agent only; user-facing browser UI must add its own auth before public exposure |
| Audit trail | Every write tool call (`create_issue`, `comment_on_issue`, `comment_on_pr`, `review_pr`) logs in Vercel logs: action, target repo, target issue/PR number, review state if applicable, requesting channel (Telegram user id / remote agent id) |
| Rate limits | Inherited from the underlying MCPs; no custom limits in v1 |
| Prompt injection | Tool descriptions and system prompt instruct the model to refuse instructions that originate from repo content (a known injection surface). PR review bodies must not include instructions to the user that bypass normal review flow. |
| Self-approval | `review_pr` MUST refuse to approve any PR whose author matches the agent's own bot identity |

The `none()` auth helper used by `ds-team` agents must **not** be enabled here — this agent can write issues, so anonymous traffic is unacceptable.

---

## 11. Coexistence with `.claude/agents/tech-lead/`

This is the most important boundary in the design.

The two agents live in **different repositories** and serve overlapping but distinct surfaces. Both are kept.

| Concern | Claude Code sub-agent (`deessejs/errors/.claude/agents/tech-lead/`) | eve tech-lead (this agent, `ds-team/apps/deessejs-errors-tech-lead/`) |
|---|---|---|
| Repo of residence | `deessejs/errors` | `ds-team` |
| Where it runs | Local Claude Code loop | Deployed Vercel HTTP |
| Reachability | Only when the user is in a terminal with the repo | Telegram, HTTP, (future) web UI |
| Source of truth for repo knowledge | The local working tree (live, but only when the loop is open) | GitHub MCP on `deessejs/errors` (always live, never stale) |
| Cross-session memory | None (Claude Code sub-agent memory is project-scoped but session-bound) | None at launch; planned |
| Issue creation | Yes, via `gh` inside the loop | Yes, via GitHub MCP |
| PR review | Yes, via `gh` inside the loop | Yes, via GitHub MCP (`review_pr`, `comment_on_pr`) |
| Code authorship | Reads and writes code in the loop | Reads code; reviews and comments only — never authors |
| Use case | "I'm coding in the repo, ask the tech-lead quickly" | "I'm on my phone, ask the tech-lead to review PR #42" |
| Triggered by | Slash command or sub-agent invocation in Claude Code | Telegram message or remote agent call |
| Surface for the user | Inline in the Claude Code session | A bot, an HTTP endpoint |

The system prompts are deliberately different: the Claude Code sub-agent assumes the user has the repo open and full tool access; the eve agent assumes the user is remote and only has the channels listed in §5.

**Naming collision is acceptable.** The Claude Code sub-agent lives at `.claude/agents/tech-lead/`; the eve agent lives at `apps/deessejs-errors-tech-lead/` and is exposed as `deessejs-errors-tech-lead`. Different paths, different lifecycles.

---

## 12. Flue Migration (out of scope here)

The `deessejs/errors` repo uses **Flue** for its agentic workflows (notably the issue-triage pipeline: `npx flue run triage --target node`). The user has indicated that Flue will be removed in favor of eve. **That migration is a separate workstream** and will be documented elsewhere — in the `deessejs/errors` repo, not in `ds-team`. This design assumes:

- For the initial launch of the tech-lead agent, Flue remains untouched in `deessejs/errors`.
- The tech-lead agent does **not** replace the `flue run triage` workflow. They may coexist temporarily, and may eventually merge — but that decision is for the Flue-migration document, not this one.
- Because the agent lives in `ds-team`, it has no way to call `flue run` even if we wanted to: `flue` is not installed in `ds-team`, and the agent has no shell access. **The GitHub MCP is its only path to `deessejs/errors`**, period. This makes the Flue question moot for the tech-lead's behavior — `create_issue`, `comment_on_issue`, `comment_on_pr`, and `review_pr` all go through the GitHub MCP directly.

---

## 13. Phased Roadmap

| Phase | Deliverable | Status |
|---|---|---|
| 0 | This design doc | ✅ |
| 1 | `apps/deessejs-errors-tech-lead/` scaffold in **`ds-team`**, eve + MiniMax working, no MCPs, system prompt only. Validates the agent runs locally with its identity and the scope is honest (no tools yet = no live repo access). | Next |
| 2 | GitHub MCP wired, read tools (`get_project_overview`, `list_open_issues`, `list_open_prs`, `get_pr`, `get_pr_diff`, `get_pr_files`, `get_file_contents`, etc.) — all backed by GitHub API against `deessejs/errors` | After 1 |
| 3 | `create_issue` + `comment_on_issue` write tools, with repo-scope guardrail | After 2 |
| 4 | `review_pr` + `comment_on_pr` write tools, with repo-scope and self-approval guardrails, structured review template | After 3 |
| 5 | Telegram channel live (re-use `@ds-team/agent-core` fork from this same workspace) | After 4 |
| 6 | Exa MCP + `web_search` tool | After 5 |
| 7 | Deploy to Vercel, end-to-end smoke test (Telegram → issue creation **and** Telegram → PR review) | After 6 |
| 8 | First production use, gather feedback | After 7 |
| 9 | Memory (`@ds-team/database` Postgres + pgvector, scope `deessejs-errors`) | Future |
| 10 | Browser web chat UI (consuming the deployed eve HTTP endpoint) | Future |
| 11 | Wire `defineRemoteAgent` reference from `ds-team/apps/head-of-engineering/agent/subagents/deessejs-errors-tech-lead.ts` | Future |

---

## 14. Open Questions

1. **DNS**: `deessejs-errors-techlead.nesalia.com` vs `techlead.deessejs.com`. The former matches `ds-team`'s pattern; the latter is shorter and projects-friendly. Decide before Vercel project creation.
2. **Vercel team placement**: since the agent lives in `ds-team`, the default is **same Vercel team as `ds-team`'s other agents**. This keeps OIDC trust trivial (existing trust between `ds-team` agents already works). Only revisit if/when an external org needs to consume this agent — at that point, either trust that org into the existing team or split teams deliberately.
3. **Fine-grained GitHub token**: should `create_issue`, `comment_on_issue`, `comment_on_pr`, `review_pr` all share one fine-grained PAT restricted to `deessejs/errors` with `issues:write` + `pull_requests:write` only (no `contents:write`)? Strongly preferred over a classic PAT.
4. **Multi-user Telegram**: for now, single-user whitelist. When memory lands, do we want multi-user with `userId` partitioning? Same as `ds-team`'s `memories.user_id` default `"ceo"`.
5. **Issue creation templates**: do we want the agent to populate from `.github/ISSUE_TEMPLATE/*`? Recommended yes — easy win, but adds a tool.
6. **Audit retention**: Vercel logs retention is short. Do we need a structured audit table for issue-creation and PR-review events? Probably yes once memory lands.
7. **What `create_issue` should NOT do**: should the model be able to assign labels? Add to a project? Mention users? Conservative answer is "no" for all three in v1.
8. **PR review granularity**: should `review_pr` support inline line comments from the start, or only PR-level summaries? Inline is higher value but adds surface area (diff line numbers, multi-file diffs, threading). Recommend starting with PR-level summaries, adding inline in a later phase.
9. **PR review states**: should the agent ever post `APPROVE`? Conservative answer is "no" — only `COMMENT` and `REQUEST_CHANGES`. `APPROVE` is reserved for humans. If yes, who can trigger it (only Telegram user, never auto)?
10. **Auto-requesting the agent as reviewer**: should `deessejs-errors-tech-lead` be auto-added as a reviewer on new PRs via `.github/CODEOWNERS` or a GitHub Action? Could be useful but creates noise; defer to first weeks of production use.
11. **Review on drafts**: should the agent review draft PRs? Drafts are typically WIP and the author may not want comments yet. Default: ignore drafts unless explicitly asked.

---

## 15. References

- `deessejs/errors` repo: https://github.com/deessejs/errors — the project this agent serves
- `deessejs/errors/CLAUDE.md` — mandates `fresh` for web search, branching model, English-only
- `deessejs/errors/.claude/agents/tech-lead/` — existing Claude Code sub-agent (retained, lives in `deessejs/errors`, not `ds-team`)
- `deessejs/errors/.claude/skills/triage/SKILL.md` — issue label taxonomy source of truth
- `ds-team/docs/internal/audits/telegram-voice-transcription-2026-07-08.md` — voice channel hardening
- `ds-team/docs/internal/reports/telegram-voice-transcription-architecture-2026-07-08.md` — voice channel architecture
- `ds-team/packages/agent-core/src/channels/telegram.ts` — Telegram channel fork to be reused (workspace dep)
- `ds-team/packages/database/` — memory package to be reused in phase 9 (workspace dep)
- `ds-team/apps/head-of-engineering/agent/connections/` — reference pattern for GitHub + Exa connection re-exports