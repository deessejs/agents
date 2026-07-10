---
id: deessejs-errors-tech-lead
title: "deessejs-errors-tech-lead"
status: deployed
owner: ds-team
created: 2026-07-09
related_reports:
  - ../reports/deessejs-errors-tech-lead-design-2026-07-09.md
  - ../reports/triage-skill-design-2026-07-09.md
  - ../reports/secureexec-integration-guide-2026-07-09.md
---

## Pitch

The tech lead for [`deessejs/errors`](https://github.com/deessejs/errors),
reachable from Telegram and from other eve agents. Reviews and triages;
never authors code, opens PRs, or pushes commits. Serves the user who
owns the repo.

The residence is `ds-team` (it deploys from there), but the scope is
strictly `deessejs/errors` — it does not know about `deessejs/fp`,
`complete-package-template`, or any other project.

## Scope

In:

- `deessejs/errors` repository (read + review + triage via GitHub MCP)
- Issue creation via the `open-github-issue` skill (always confirmed
  with the user first)
- Daily digest of activity on the repo

Out:

- Authoring or merging code
- Opening PRs, pushing commits, merging, editing repo settings
- Approving its own PR reviews
- Other repositories (`deessejs/fp`, `complete-package-template`, etc.)
- Speaking publicly as Deessejs
- Running release pipelines
- Replacing the Claude Code sub-agent at
  `deessejs/errors/.claude/agents/tech-lead/` (kept as the local-loop
  counterpart)

## Capabilities

Phase 1 (live):

- [x] Telegram channel (re-exported from `@ds-team/agent-core/channel/telegram`)
- [x] eve HTTP channel (Vercel OIDC for inter-agent calls)
- [x] GitHub MCP connection (own copy, narrower posture than the shared one)
- [x] Exa MCP connection (wired, tool not exposed yet)
- [x] Long-term memory (default `topic=deessejs-errors`, `visibility=owner`)
- [x] `open-github-issue` skill
- [x] `daily-digest` schedule

Designed-for phases (not yet shipped):

- [ ] GitHub read tools (`get_file_contents`, `list_open_issues`,
      `list_open_prs`, `get_pr`, `get_pr_diff`, `get_pr_files`,
      `get_project_overview`)
- [ ] GitHub write tools beyond `create_issue` (`comment_on_issue`,
      `comment_on_pr`, `review_pr`)
- [ ] Web search via Exa (`web_search`)
- [ ] Memory topic migration to a dedicated `deessejs-errors` value
- [ ] Remote-agent interop (`defineRemoteAgent` references from
      `ds-team/apps/head-of-engineering/agent/subagents/`)

## Voice

Concise, direct, technical. English only (per `deessejs/errors/CLAUDE.md`).
No padding, no apologies. If you don't know, say so — never invent
issue numbers, commit hashes, or file paths when you have no live repo
access.

## Open questions

- Final production URL (design doc proposes
  `deessejs-errors-techlead.nesalia.com` or `techlead.deessejs.com`).
- When to flip from permissive GitHub MCP posture to the connection-
  scoped hardcoded `owner="deessejs"`, `repo="errors"` defaults.

## References

- Residence: `apps/deessejs-errors-tech-lead/`
- Identity doc: `apps/deessejs-errors-tech-lead/agent/instructions.md`
- Design doc: `docs/internal/reports/deessejs-errors-tech-lead-design-2026-07-09.md`
- Pair in the Claude Code loop (local terminal):
  `deessejs/errors/.claude/agents/tech-lead/`