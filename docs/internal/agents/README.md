# ds-team agents — registry

The single source of truth for *which agents exist, what they do, and
what state they're in*. One file per agent in this folder, plus this
index.

## Deployed

Live on Vercel and/or reachable from a channel.

| Agent | Status | Telegram bot | Vercel URL |
|---|---|---|---|
| home-automation-assistant | deployed | @home_automation_assistant_bot | `home-automation-assistant-agent.nesalia.com` |
| fitness-coach | deployed | @ns_fitness_coach_bot | `fitness-coach-agent.nesalia.com` |
| deessejs-errors-tech-lead | deployed | — | TBD (design doc proposes `deessejs-errors-techlead.nesalia.com` or `techlead.deessejs.com`) |
| head-of-engineering | deployed | — | (URL not recorded in repo) |
| head-of-product | deployed | — | (URL not recorded in repo) |
| general-assistant | deployed | — | (URL not recorded in repo) |

## Planned

Agents under design but not yet scaffolded.

| Agent | Status | Owner file |
|---|---|---|
| personal-development-coach | idea | [agents/personal-development-coach.md](personal-development-coach.md) |
| finance-expert | idea | [agents/finance-expert.md](finance-expert.md) |
| nutrition-coach | idea | [agents/nutrition-coach.md](nutrition-coach.md) |

## Retired

_None._

## Lifecycle

```
idea → design → scaffolded → deployed → retired
```

- **idea** — a paragraph of intent in `agents/<id>.md`, status `idea`.
- **design** — a full design doc exists at
  `docs/internal/reports/<id>-design-<YYYY-MM-DD>.md`; the per-agent file
  in this folder links to it via `related_reports`.
- **scaffolded** — code is committed (`apps/<id>/` exists, agentId is
  registered in `@ds-team/database/KNOWN_AGENT_IDS`). No Vercel project
  yet.
- **deployed** — Vercel project is live and the Telegram webhook (if any)
  has been set via `setWebhook`.
- **retired** — agent is no longer maintained. Keep the file for history.

## Conventions

- **Naming**: kebab-case. The folder/file name, the agentId in
  `KNOWN_AGENT_IDS`, the package name, and the Vercel project name all
  match.
- **One Vercel project per agent** at `apps/<id>/`.
- **Shared infra** (`@ds-team/agent-core`, `@ds-team/database`,
  `@ds-team/typescript-config`) is reused, never forked.
- **Memory** always goes through `@ds-team/database`. agentId is baked
  into the tool factory closure (`createMemoryTools(agentId)`); see
  `docs/internal/reports/memory-schema-refactor-2026-07-09.md` for the
  contract.
- **Channels** (`eve`, `telegram`) and connections (`exa`, `github`) are
  re-exported from `@ds-team/agent-core`. An app overrides a connection
  only when it needs a different posture (e.g. the GitHub MCP allowlist
  on `deessejs-errors-tech-lead`).
- **MCP surfaces** default to permissive: no client-side filtering, no
  read-only mode, no approval gate. Behavior is shaped by the agent's
  `instructions.md`, the canonical skill bodies, and per-tool HITL where
  the channel offers it.

## How to add a new agent

1. Create `agents/<id>.md` with status `idea`. Fill in the pitch, scope,
   capabilities checklist.
2. When the design is firm, write the design doc at
   `reports/<id>-design-<YYYY-MM-DD>.md` and add it to `related_reports`
   in the per-agent file. Status → `design`.
3. Scaffold: create `apps/<id>/`, register the agentId in
   `@ds-team/database/KNOWN_AGENT_IDS`, run typecheck and the
   `pnpm --filter @ds-team/database guardrail`. Status → `scaffolded`.
4. Provision Vercel project + (optionally) Telegram bot, set the
   webhook. Update the table in this README. Status → `deployed`.

## How to retire

Move the row from **Deployed** to **Retired** in this README. Leave the
per-agent file in place — it stays useful as history.