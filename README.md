# DeesseJS Agents

A monorepo of specialized AI agents, each shipped as an independent Vercel project. Every agent plays a "head of" role (engineering, product, fitness, finance, ...) and shares one Postgres database for cross-agent memory. Maintained and used internally by the [deessejs.com](https://deessejs.com) teams.

## Repository layout

```
ds-team/
├── apps/                       # one folder per agent = one Vercel project
│   ├── head-of-engineering/
│   ├── fitness-coach/
│   └── ...
├── packages/
│   ├── agent-core/             # shared channels (eve, telegram) + MCP connections (exa, github, ...)
│   ├── database/               # Drizzle + Neon; shared memories + memory_audit
│   └── typescript-config/      # shared tsconfig presets
├── docs/
│   ├── internal/agents/        # per-agent docs, grouped by status (idea/design/scaffolded/deployed/retired)
│   ├── internal/product/       # product specs
│   └── internal/reports/       # design docs (memory schema, MCP integrations, skills)
├── turbo.json
└── pnpm-workspace.yaml
```

## Stack

- **Agent framework**: [eve](https://eve.dev) v0.20 (runs on Vercel)
- **Model SDK**: Vercel AI SDK [`ai`](https://ai-sdk.dev) v7
- **Model**: `MiniMax-M3` via [`vercel-minimax-ai-provider`](https://www.npmjs.com/package/vercel-minimax-ai-provider) (direct provider, not the AI Gateway)
- **Auth**: [@vercel/connect](https://vercel.com/docs/connect) (OIDC)
- **Database**: Postgres on Neon, accessed via Drizzle ORM (`@neondatabase/serverless`)
- **MCP tools**: Exa (web search/fetch), GitHub (repos, issues, PRs), Liftosaur (fitness), Todoist (in progress)
- **Channels**: eve HTTP, Telegram
- **Build orchestrator**: [Turborepo](https://turborepo.com)
- **Package manager**: pnpm workspaces
- **Runtime**: Node 24.x, TypeScript 7.0.1-rc

## Prerequisites

- Node.js 24.x
- pnpm 9.15+
- A Vercel account (each `apps/<agent>/` becomes its own Vercel project)
- API keys for the providers your agents use (see `.env.example`)

## Setup

```bash
# enable pnpm if you don't already have it
corepack enable

# install dependencies for the whole workspace
pnpm install

# copy the env template and fill in real values
cp .env.example .env
```

Each agent also ships its own `.env.example` under `apps/<agent>/` with the variables it actually needs (most inherit from the root `.env`).

## Commands

Run from the repo root. Turborepo fans out across all packages.

| Command | What it does |
|---|---|
| `pnpm dev` | Start every agent's dev server in parallel |
| `pnpm build` | Build every agent |
| `pnpm typecheck` | Run `tsc --noEmit` everywhere |
| `pnpm start` | Run the production build of every agent |

To target a single app:

```bash
pnpm --filter fitness-coach dev
pnpm --filter head-of-engineering build
```

## Database

The shared `memories` and `memory_audit` tables live in [`packages/database`](packages/database) and are migrated through Drizzle Kit. Agents read and write each other's memories through the tool factory in `packages/database/src/tools/memory.ts`, which closes over the calling `agentId` so memories are scoped correctly.

```bash
# generate a migration after editing schema.ts
pnpm --filter @ds-team/database generate

# apply pending migrations
pnpm --filter @ds-team/database migrate

# open Drizzle Studio
pnpm --filter @ds-team/database studio
```

## Deploying an agent

1. In the Vercel dashboard, **Add New → Project** and import this repo.
2. Set **Root Directory** to the chosen app (e.g. `apps/fitness-coach`).
3. Add the project's environment variables (or migrate to Vercel Connect).
4. Deploy.

Pushes that don't touch an app are automatically skipped (Turborepo's content-aware hashing), so shared-package changes don't redeploy every agent.

## Adding a new agent

The agent lifecycle is `idea → design → scaffolded → deployed`. Short version:

1. Drop a one-pager describing the idea, scope, and capabilities.
2. When the design firms up, write a design doc with a dated filename.
3. Scaffold `apps/<id>/`, register the agentId in `KNOWN_AGENT_IDS` (`packages/database/src/schema.ts`), and run `pnpm --filter @ds-team/database guardrail`.
4. Provision the Vercel project (and a Telegram bot, if needed). Update the registry.

## Conventions

- **Naming**: kebab-case everywhere (folder name, `agentId`, package name, Vercel project name, Telegram bot handle).
- **Shared infra is reused, never forked**: channels and connections come from `@ds-team/agent-core`, persistence from `@ds-team/database`.
- **MCP surfaces default to permissive**: no client-side filtering, no read-only mode, no approval gate. Behavior is shaped by the agent's `instructions.md`, the canonical skill bodies, and per-tool HITL where the channel offers it.
- **Memory is always written through `@ds-team/database`** with the agentId baked into the tool closure. Direct table access is discouraged.

## License

MIT. See [LICENSE](LICENSE) for the full text.