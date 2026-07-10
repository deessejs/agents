# ds-team agents — registry

The single source of truth for *which agents exist, what they do, and
what state they're in*. One file per agent, grouped by status in
subfolders. This file is the index.

## Layout

```
docs/internal/agents/
├── README.md              # this file
├── deployed/              # live on Vercel and/or reachable from a channel
│   └── <agent-id>.md
├── scaffolded/            # code committed, no Vercel project yet (.gitkeep)
├── design/                # full design doc exists in reports/ (.gitkeep)
├── idea/                  # paragraph of intent, no design yet
│   └── <agent-id>.md
└── retired/               # no longer maintained (.gitkeep)
```

## Deployed

Live on Vercel and/or reachable from a channel.

| # | Agent | Telegram bot | Vercel URL | Doc |
|---|---|---|---|---|
| 1 | deessejs-errors-tech-lead | — | TBD (design doc proposes `deessejs-errors-techlead.nesalia.com` or `techlead.deessejs.com`) | [deployed/01-deessejs-errors-tech-lead.md](deployed/01-deessejs-errors-tech-lead.md) |
| 2 | fitness-coach | @ns_fitness_coach_bot | `fitness-coach-agent.nesalia.com` | [deployed/02-fitness-coach.md](deployed/02-fitness-coach.md) |
| 3 | general-assistant | — | (URL not recorded in repo) | [deployed/03-general-assistant.md](deployed/03-general-assistant.md) |
| 4 | head-of-engineering | — | (URL not recorded in repo) | [deployed/04-head-of-engineering.md](deployed/04-head-of-engineering.md) |
| 5 | head-of-product | — | (URL not recorded in repo) | [deployed/05-head-of-product.md](deployed/05-head-of-product.md) |
| 6 | home-automation-assistant | @home_automation_assistant_bot | `home-automation-assistant-agent.nesalia.com` | [deployed/06-home-automation-assistant.md](deployed/06-home-automation-assistant.md) |

## Scaffolded

Code committed, no Vercel project yet.

_None._

## Design

Full design doc exists in `docs/internal/reports/`.

_None._

## Idea

Paragraph of intent, no design doc yet.

| # | Agent | Doc |
|---|---|---|
| 1 | city-expert | [idea/01-city-expert.md](idea/01-city-expert.md) |
| 2 | finance-expert | [idea/02-finance-expert.md](idea/02-finance-expert.md) |
| 3 | nutrition-coach | [idea/03-nutrition-coach.md](idea/03-nutrition-coach.md) |
| 4 | personal-development-coach | [idea/04-personal-development-coach.md](idea/04-personal-development-coach.md) |

## Retired

_None._

## Lifecycle

```
idea → design → scaffolded → deployed → retired
```

- **idea** — a paragraph of intent in `idea/<id>.md`, status `idea`.
- **design** — a full design doc exists at
  `docs/internal/reports/<id>-design-<YYYY-MM-DD>.md`; the per-agent file
  in the relevant subfolder links to it via `related_reports`.
- **scaffolded** — code is committed (`apps/<id>/` exists, agentId is
  registered in `@ds-team/database/KNOWN_AGENT_IDS`). No Vercel project
  yet. File lives in `scaffolded/`.
- **deployed** — Vercel project is live and the Telegram webhook (if any)
  has been set via `setWebhook`. File moves to `deployed/`.
- **retired** — agent is no longer maintained. File moves to
  `retired/`. Kept for history.

## Conventions

- **Naming**: kebab-case. The subfolder filename, the agentId in
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
- **Cross-references** between per-agent files use relative paths
  (`../deployed/fitness-coach.md`, `../reports/<design-doc>.md`).

## How to add a new agent

1. Create `idea/<id>.md` with status `idea`. Fill in the pitch, scope,
   capabilities checklist. Add a row to the Idea table in this README.
2. When the design is firm, write the design doc at
   `reports/<id>-design-<YYYY-MM-DD>.md` and add it to `related_reports`
   in the per-agent file. Status → `design`. Move the file to `design/`.
3. Scaffold: create `apps/<id>/`, register the agentId in
   `@ds-team/database/KNOWN_AGENT_IDS`, run typecheck and the
   `pnpm --filter @ds-team/database guardrail`. Status → `scaffolded`.
   Move the file to `scaffolded/`.
4. Provision Vercel project + (optionally) Telegram bot, set the
   webhook. Move the file to `deployed/`, update the Deployed table in
   this README.

## How to retire

Move the file from its current subfolder to `retired/`. Move the row
in this README from Deployed (or wherever) to Retired. Leave the
per-agent file in place — it stays useful as history.