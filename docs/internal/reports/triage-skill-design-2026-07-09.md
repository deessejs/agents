---
title: "Issue Triage Skill for deessejs-errors-tech-lead"
date: 2026-07-09
status: draft
owner: ds-team
related_repo: deessejs/errors
related_agents:
  - apps/deessejs-errors-tech-lead
related_docs:
  - docs/internal/reports/deessejs-errors-tech-lead-design-2026-07-09.md
  - docs/internal/reports/memory-schema-refactor-2026-07-09.md
canonical_source: deessejs/errors/.claude/skills/triage/SKILL.md
scope: design only — no code in this document
---

## Executive Summary

This document proposes an `agent/skills/triage.md` skill on the existing `deessejs-errors-tech-lead` agent. The skill mirrors the canonical triage procedure already shipped at `deessejs/errors/.claude/skills/triage/SKILL.md` (the local Claude Code sub-agent surface), translating the `gh` CLI invocations there into `github__*` MCP calls.

The shape, taxonomy, decision tree, label-handling rules, and comment templates from the canonical SKILL.md are treated as the **contract** this skill must respect. The only delta is the comment footer — local sub-agent uses "*Triage by Flue Agent + MiniMax M2.7*"; the eve surface uses "*Triage by deessejs-errors-tech-lead via eve*".

Three runtime modes are scoped: (A) single-issue triage on user demand, (B) batch sweep across all `status: triage` issues, (C) scheduled cron sweep. A and B ship on this PR; C is deferred until preview-on-fire is solved.

The connection-layer changes needed: extend `X-MCP-Tools` allowlist with `update_issue` and `add_issue_comment`, and add a per-tool approval policy that gates only the three write tools (`create_issue`, `update_issue`, `add_issue_comment`). Reads stay ungated.

---

## 1. Context and Motivation

`deessejs/errors` has an active triage workflow with a defined issue taxonomy (`type:`, `status:`, `p?:`, `effort:`, plus closure labels). The canonical procedure is documented at `deessejs/errors/.claude/skills/triage/SKILL.md` and is executed today by the local Claude Code sub-agent at `deessejs/errors/.claude/agents/tech-lead/` using `gh` CLI commands.

That surface has gaps:

- It is reachable **only when the user has the local repo open in a terminal**, which means triage from a phone, Telegram, or a remote agent (e.g. `head-of-engineering` calling cross-agent) is unavailable.
- The taxonomy evolves: only 5 of the 13 labels in the canonical SKILL.md are actually created in the repo today (verified via the GitHub labels API on 2026-07-09). Both surfaces must eventually surface the gap, and updating both manually invites drift.

The `deessejs-errors-tech-lead` eve agent already exists (`apps/deessejs-errors-tech-lead/`) with GitHub MCP, Telegram channel, and shared memory. The open-github-issue skill shipped 2026-07-09 (commit `e990e83`) is the precedent: a load-on-demand markdown skill that runs a structured procedure on the agent.

Triage is the **natural next skill** on the same agent. It reads existing issues (which the agent already has access to) and labels / comments them. It is the verb the agent is missing for "what changed since yesterday" to become "what should I do about it".

---

## 2. Goals and Non-Goals

### Goals

- **Triage a single issue on demand**, end-to-end: fetch, classify, label, comment.
- **Triage a batch of `status: triage` issues in one go** (mode B), with one consolidated preview-and-confirm.
- **Respect the canonical SKILL.md's contract** verbatim: same taxonomy, same decision tree, same label-handling rules, same comment templates.
- **Never downgrade** an existing `status: ready` to a lower state.
- **Never remove** a label that was not added by the previous triage pass.
- **Preview every write** before applying — both labels and comment.
- **Skip-and-warn** on labels that the canonical contract names but that have not yet been created in the repo (today: 8 of 13).
- Surface the footer `*Triage by deessejs-errors-tech-lead via eve*` so humans reading the GitHub UI know which surface acted.

### Non-Goals (this PR)

- **Creating missing labels** in the repo. That is `set_repo_settings` / `edit_labels`, blocked by the current `X-MCP-Tools` allowlist and rightly so — it is an admin operation, not a triage operation.
- **Auto-merge** of related labels, e.g. dedup detection (would require additional read tools and a heuristic layer; defer).
- **Cross-repo triage.** Scope is `deessejs/errors` only, same as the rest of the agent.
- **Cron-driven sweeps** (mode C). Defers until a preview-on-fire mechanism exists.
- **Wiring `head-of-engineering` as a remote caller** of this skill (phase 11 of the tech-lead design). Independent workstream.

---

## 3. Canonical Contract

### 3.1 Taxonomy

The canonical SKILL.md (§"Project Label Taxonomy") defines four families. The table below cross-references every label in that contract with the repo's actual label inventory (`/repos/deessejs/errors/labels` on 2026-07-09).

#### Type (one required)

| Label | Created in repo? | Color | Description |
|---|---|---|---|
| `type: bug` | No | — | Bug / defect fix |
| `type: feature` | Yes | #006b75 | New feature |
| `type: refactor` | No | — | Code restructuring |
| `type: docs` | No | — | Documentation |
| `type: chore` | Yes | #fbbd08 | General maintenance tasks |

#### Status (one required)

| Label | Created in repo? | Color | Description |
|---|---|---|---|
| `status: triage` | Yes | #ededed | Tech Lead has not reviewed yet |
| `status: needs-info` | No | — | Incomplete, needs more info |
| `status: ready` | Yes | #0e8a16 | Validated, ready to pick up |
| `status: blocked` | No | — | Depends on another task |

#### Priority (optional)

| Label | Created in repo? | Color | Description |
|---|---|---|---|
| `p0: critical` | No | — | Everything stops, fix now |
| `p1: high` | No | — | Required for next release |
| `p2: medium` | Yes | #fbca04 | Normal priority |
| `p3: low` | Yes | #b60205 | Nice to have |

#### Effort (optional)

| Label | Created in repo? | Color | Description |
|---|---|---|---|
| `effort: xs` | Yes | #0e8a16 | A few minutes |
| `effort: s` | No | — | Half a day |
| `effort: m` | No | — | 1–2 days |
| `effort: l` | No | — | Week or more |

#### Closure (mutually exclusive with `status: ready`)

| Label | Created in repo? | Description |
|---|---|---|
| `type: duplicate` | No | Duplicate of another issue |
| `type: wontfix` | No (standard `wontfix` exists) | Will not be addressed |
| `type: question` | No (standard `question` exists) | Question or discussion, not a task |

**Gap today** : 8 of the 13 taxonomy labels are not yet created in the repo. The skill must function despite this gap.

### 3.2 Decision tree

From canonical SKILL.md §"Triage Decision Tree":

1. **Is the issue complete?** (all required fields from template present)
   - **No** → `status: needs-info`
   - **Yes** → continue
2. **Is it a valid task?** (not a duplicate / question / wontfix)
   - **No** → closure label (`type: duplicate` / `type: wontfix` / `type: question`)
   - **Yes** → continue
3. **Is it blocked?** (depends on another task)
   - **Yes** → `status: blocked` + reference
   - **No** → `status: ready` (+ optional `p?:`, `effort:`)

### 3.3 Label-handling rules (verbatim from canonical SKILL.md §"Label Handling Rules")

- **Always check existing labels** before adding new ones.
- **Add missing labels only** — never remove user-added labels.
- **Preserve user intent** — if a user added a label, keep it even if it seems incorrect.
- **Respect existing status** — if the issue already has `status: ready`, do not downgrade to `status: triage`.

These four rules are non-negotiable invariants of the eve skill.

### 3.4 Comment templates (canonical SKILL.md §"Comment Templates")

Five templates are defined, each with a fixed `## Triage Review` shape plus a footer. The eve skill must reproduce them with the footer replaced. Templates:

- `status: ready`
- `status: needs-info`
- `type: duplicate`
- `type: wontfix`
- `type: question`
- `status: blocked`

The canonical footer is `*Triage by Flue Agent + MiniMax M2.7*`. The eve footer is `*Triage by deessejs-errors-tech-lead via eve*` (e point). When both surfaces triage the same issue, the footers give an unambiguous audit trail of which agent acted.

---

## 4. The eve-Side Skill

### 4.1 Trigger

Description frontmatter (routing hint for `load_skill`):

> *Load when the user says they want to triage a GitHub issue, classify it against the project taxonomy, label it, or post a Triage Review comment. Examples: "triage #42", "process the new issues", "label this as bug p2 medium effort xs", "what status should issue 9 be".*

### 4.2 Procedure

Eight steps, mapped from the canonical procedure (which uses `gh` CLI) to the GitHub MCP equivalents:

| Step | Action | MCP tool |
|---|---|---|
| 1 | Resolve the issue (number or "all `status: triage`") | `github__list_issues` (filter `labels=["status: triage"]`) |
| 2 | Fetch full details (title, body, labels, state) | (verify exact tool name at smoke-test time; candidate: `github__get_issue`) |
| 3 | Apply the canonical decision tree (§3.2) | — |
| 4 | Diff candidates against existing labels | — |
| 5 | Compose the matching comment template (§3.4) | — |
| 6 | Preview all proposed writes + comment; ask for OK | — |
| 7 | Apply: add labels + post comment | `github__update_issue` (labels), `github__add_issue_comment` (comment) |
| 8 | Return the issue URL + one-line summary | — |

Step 6 (preview) is mandatory. Step 7 fires only after explicit user confirmation.

### 4.3 Hard invariants (in addition to the four canonical label rules)

These belong in the skill body, not in `instructions.md`, because they are triage-specific:

| Invariant | Why |
|---|---|
| **At most one `type:` label per issue** | Canonical SKILL.md says "one required"; if LLM proposes two, keep the most specific |
| **At most one `p?:` label per issue** | Same one-required principle, optional family |
| **At most one `effort:` label per issue** | Same |
| **No `type: <closure>` + `status: ready`** on the same issue | Closure labels are mutually exclusive with progression |
| **Skip + warn** for any candidate label not present in the repo today | The repo has 8 of 13 labels created; failing the whole triage because one label is missing is unacceptable UX |
| **Skip the issue if `state === "closed"`** | Triage of a closed issue is a contradiction; surface and stop |
| **Footer must read `*Triage by deessejs-errors-tech-lead via eve*`** | Audit clarity |

### 4.4 Preview format (Telegram-friendly)

```
About to triage #9 on deessejs/errors.

  Existing labels:  [status: triage, type: feature, p2: medium]
  Will add:         [status: ready]
  Will NOT remove:  anything
  Will skip:        (none)

Comment to post:
---
## Triage Review

**Type:** `type: feature`
**Status:** `status: ready` - All required information provided
**Priority:** `p2: medium`

**Decision:** Issue is feature-shaped, dependencies resolved, all template
fields present. Ready for pick-up.

---
*Triage by deessejs-errors-tech-lead via eve*
---

Reply "OK" to apply, or send the corrections you want first.
```

Batch mode (mode B) renders one block per issue plus a global "apply all" prompt.

---

## 5. Coexistence with the local Claude Code sub-agent

The two surfaces execute the **same procedure** against the **same taxonomy** with **different transports**:

| Surface | Transport | Where it runs | Reachable from |
|---|---|---|---|
| `deessejs/errors/.claude/agents/tech-lead/` | `gh` CLI in a subprocess | Local Claude Code loop with the repo open | Terminal only |
| `apps/deessejs-errors-tech-lead/agent/skills/triage.md` | `github__*` MCP | Deployed Vercel HTTP | Telegram, HTTP, future remote callers |

They are complementary, not redundant (consistent with the design doc §11 stance). Drift is mitigated by:

1. **Single source of truth** for the procedure: `deessejs/errors/.claude/skills/triage/SKILL.md`. The eve skill's body mirrors its taxonomy + decision tree, and cites the canonical path in a top-of-file comment.
2. **Identical comment shape**: same `## Triage Review` heading, same field naming, distinct footer so humans know which surface acted.
3. **Identical label-handling rules** (the four invariants from §3.3).
4. **Mirror updates as a separate, infrequent PR**: if the canonical SKILL.md changes (label added, decision branch added, template change), regenerate the eve skill via a single review by the same author.

Conflict scenarios:

- Both surfaces triage the same issue in parallel: each leaves its comment. The second triage sees the first comment + label state and applies the invariants. Footer disambiguates origin.
- Local sub-agent creates a label the eve skill wants to apply: each operates independently; if the eve skill proposes a candidate the local sub-agent just created, the apply succeeds.

---

## 6. Connection-Layer Requirements

### 6.1 Allowlist extension

The current shared GitHub MCP connection (`packages/agent-core/src/connections/github.ts`) was hardened on 2026-07-09 (commit `6e1c351`) to:

- `X-MCP-Readonly: true` — server-side filter that drops all write tools.
- `X-MCP-Tools: create_issue` — explicit re-enable of the only write tool used by the open-github-issue skill.

For triage, two more write tools must be reachable:

```
X-MCP-Tools: create_issue, update_issue, add_issue_comment
```

This change is the natural next step of the *"the list is the single source of truth for which write surfaces agents can reach"* policy from commit `6e1c351`. It affects all four ds-team agents (HoE, HoP, general-assistant, deessejs-errors-tech-lead), since the connection is shared. None of those agents use `update_issue` or `add_issue_comment` today, so the blast radius is zero.

### 6.2 Naming uncertainty

The exact MCP tool names for `update_issue` and the comment-list operation could not be confirmed against `pkg/github/__toolsnaps__/*.snap` as of 2026-07-09. Candidates:

| Operation | Likely MCP name | Verification path |
|---|---|---|
| Add labels to an issue | `update_issue` | Snapshot file did not exist at the canonical path; verify in `pkg/github/issues.go` or by activating `X-MCP-Features: remote_mcp_ui_apps` |
| Get issue (full) | `get_issue` | Same path |
| List comments on an issue | `list_issue_comments` | Same path |

If the tool name turns out to differ (`issue_write` for insiders mode, etc.), the skill body updates; the description and procedure remain identical.

### 6.3 Approval gate

Today the allowlist lets writes through without per-call approval. For triage that is **not safe** — the user can unknowingly post a public comment on a contributor's issue. The recommended policy:

```ts
// in packages/agent-core/src/connections/github.ts
import { defineMcpClientConnection } from "eve/connections";

export function makeGitHubConnection() {
  return defineMcpClientConnection({
    // … existing url / auth / headers …
    approval: ({ toolName }) => {
      // toolName is qualified as github__<tool>; gate only the writes.
      return toolName === "github__create_issue"
          || toolName === "github__update_issue"
          || toolName === "github__add_issue_comment"
        ? "user-approval"
        : "not-applicable";
    },
  });
}
```

This combines with the skill-level preview to form a **two-layer gate**: a soft ask in conversation, plus a hard pause for HITL confirmation at the connection layer. Telegram renders `user-approval` prompts as inline-keyboard buttons (`node_modules/eve/docs/channels/telegram.mdx` §"Human-in-the-loop"), giving users a clean approve / deny UX.

`once()` and `always()` from `eve/tools/approval` were considered but rejected:

- `once()` approves the first call per session — risky if the first triage is wrong.
- `always()` prompts on every write — fine, but heavier than the custom policy that scopes to writes only.

---

## 7. Memory

Per `packages/database/src/schema.ts`, the memory space for this agent is `topic='deessejs-errors'` with tiers `core` (durable preferences), `archival` (dated notes), `recall` (searchable history), `episodic` (reserved). Visibility defaults to `owner` (private to the agent).

| Memory action | Tier | Topic | When | Value / risk |
|---|---|---|---|---|
| Persist a **priority default** (e.g. "user prefers p2 medium by default unless they say otherwise") | `core` | `deessejs-errors` | After several user-confirmed triages show a pattern | High value, low risk if explicitly requested |
| Persist the **list of labels created in the repo today** | `core` | `deessejs-errors` | On every triage (refresh) | Avoids the "label missing" warning for the N labels that exist; refreshes cheaply |
| Persist **last-triage history per issue** | `recall` | `deessejs-errors` | After each triage | Audit trail beyond GitHub's own; mild cache value |
| Persist **taxonomy drift** (label added in the repo) | `core` | `deessejs-errors` | When a candidate label appears in `get_file_contents` of the issue but not in the prior cache | Bridges the gap between canonical SKILL.md (13 labels) and reality (5 today) |

**Recommendation v1**: do not write any of these. The reason: the four actions above are optimization, not correctness. Triage works today without memory. Adding writes expands the surface (the `memory_audit` table is already recording *every* memory mutation; unnecessary noise is a real cost).

Decision deferred: ship the skill without memory writes. Add a `core` write for "user preference: priority defaults" only after a confirmed pattern (≥3 consecutive triages with the same priority outcome).

---

## 8. Phased Rollout

### Mode A — single-issue on demand (this PR)

- Trigger: user says "triage #42".
- Procedure: §4.2 verbatim, scoped to one issue.
- Confirmation: one inline preview, one OK.
- Connection: extended allowlist + custom approval policy.
- Schedule: none (user-driven only).
- Skill file: `apps/deessejs-errors-tech-lead/agent/skills/triage.md`.
- Instructions patch: append §4 "Triage an issue" pointing at the skill; remove obsolete "comment on issues" from the "cannot yet" list.

### Mode B — batch sweep on demand (next PR, after A)

- Trigger: user says "triage the new ones" or "triage everything in `status: triage`".
- Procedure: A's procedure applied once per issue from the `list_issues({labels: ["status: triage"]})` result.
- Confirmation: one consolidated preview per issue + a single OK to apply all.
- Cost: preview grows with N (clip at first 5, ask for "show more" if needed).
- Risk: Telegram markdown length cap (4096 chars per message) — preview must chunk.

### Mode C — scheduled cron sweep (deferred)

- Trigger: cron schedule; not yet triggered by user input.
- Use case: drain the `status: triage` queue every Monday morning.
- **Open question**: how to deliver results without preview-on-fire? Options:
  - Post a Telegram message listing applied / skipped / failed issues — no per-issue approval, batch user-justified.
  - Open a single tracking issue tracking all triages that day; user reviews before any comment is posted.
- Recommendation: defer until A and B are validated.

### Cross-cutting prerequisites

| Prereq | Status | Action |
|---|---|---|
| Repo has the labels the skill wants to apply | Partial (5 of 13) | Out of scope for this PR; document the gap in `skipped` blocks |
| Connection extends the allowlist | Pending | Commit 1 of the implementation |
| Custom approval policy in place | Pending | Same commit as the allowlist extension |
| Skill markdown authored | Pending | Commit 2 |
| Agent `instructions.md` patched to reference the skill | Pending | Commit 2 (with the skill) |
| Skill smoke-tested via Telegram DM | Manual post-deploy | Outside the repo |

---

## 9. Open Questions

1. **Tool name verification.** Confirm `update_issue`, `get_issue`, `list_issue_comments` in the upstream `pkg/github/issues.go` or via `X-MCP-Features: remote_mcp_ui_apps`. (10 minutes; blocks code but not this design.)
2. **Batch preview chunking.** When mode B previews N issues, decide clip threshold (5? 10?) and how to render "show more".
3. **Mode C delivery shape.** Either Telegram batch summary or a single tracking issue. Decision after A and B are validated.
4. **Footer divergence permanence.** Keep `*Triage by deessejs-errors-tech-lead via eve*` distinct from the local sub-agent's `*Triage by Flue Agent + MiniMax M2.7*`, or unify under a single "*Triage by {{agent_id}}*" pattern? The two surfaces are different agents, so distinct footers carry their weight; recording the call here.
5. **Memory of priority defaults.** Defer. If user patterns emerge, add a `core` write gated on an explicit user ask.
6. **Triage-comment edit.** Should the skill be able to edit the comment it just posted (e.g. retract a wrong decision)? That is `update_issue_comment` or delete + repost. Decision deferred; v1 is post-only.
7. **Dedicated connection** (`packages/agent-core/src/connections/github-deessejs-errors.ts`) — hardcode `owner="deessejs"`, `repo="errors"` as connection defaults. This is the repo-scope guardrail from the design doc §6.2 / §7, deferred from the open-github-issue commit. Build the triage skill against the shared hardened connection (acceptable for v1); the dedicated connection is a follow-up.

---

## 10. References

### Project-internal

- `apps/deessejs-errors-tech-lead/` — host agent
- `apps/deessejs-errors-tech-lead/agent/skills/open-github-issue.md` — sibling skill shipped 2026-07-09 (precedent for the load-on-demand shape)
- `apps/deessejs-errors-tech-lead/agent/instructions.md` — instructions file to be patched (§4 reference)
- `apps/deessejs-errors-tech-lead/agent/channels/telegram.ts` — Telegram channel for the approval-gate surface
- `packages/agent-core/src/connections/github.ts` — shared connection, hardened on 2026-07-09 (commit `6e1c351`)
- `packages/database/src/schema.ts` — memory schema (`KNOWN_AGENT_IDS`, `Topic` enum includes `deessejs-errors`)
- `docs/internal/reports/deessejs-errors-tech-lead-design-2026-07-09.md` — agent design context
- `docs/internal/reports/memory-schema-refactor-2026-07-09.md` — `agent_id` factory-injection pattern (Rule 1)

### External

- [deessejs/errors/.claude/skills/triage/SKILL.md](https://github.com/deessejs/errors/blob/main/.claude/skills/triage/SKILL.md) — canonical triage procedure (5.9 KB)
- [deessejs/errors labels API](https://api.github.com/repos/deessejs/errors/labels) — actual label inventory (5 of 13 canonical labels present on 2026-07-09)
- [list_issues.snap](https://github.com/github/github-mcp-server/blob/main/pkg/github/__toolsnaps__/list_issues.snap) — schema verbatim, `readOnlyHint: true`
- [add_issue_comment.snap](https://github.com/github/github-mcp-server/blob/main/pkg/github/__toolsnaps__/add_issue_comment.snap) — schema verbatim, write
- [GitHub MCP Server config docs](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md) — `X-MCP-Readonly`, `X-MCP-Tools`, `X-MCP-Insiders`, feature flags
- [`node_modules/eve/docs/channels/telegram.mdx`](file:///C:/Users/dpereira/Documents/github/ds-team/node_modules/eve/docs/channels/telegram.mdx) §"Human-in-the-loop" — inline-keyboard approval prompts on Telegram
- [`node_modules/eve/docs/connections/mcp.mdx`](file:///C:/Users/dpereira/Documents/github/ds-team/node_modules/eve/docs/connections/mcp.mdx) §"Approval gates" — custom `approval: ({ toolName }) => ...` policy by qualified tool name
- [`node_modules/eve/docs/skills.mdx`](file:///C:/Users/dpereira/Documents/github/ds-team/node_modules/eve/docs/skills.mdx) — `load_skill` mechanics, scoped per agent, plain markdown form
