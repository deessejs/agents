# agents-studio

Multi-agent monorepo powered by [eve.dev](https://eve.dev) (Vercel).

**First agent:** [`Technical Analyst`](apps/technical-analyst/) — daily + weekly GitHub digests, delivered by email.

> 📐 Architecture is documented in [`temp/monorepo-structure.md`](./temp/monorepo-structure.md).
> 📊 The Technical Analyst's design is in [`temp/technical-analyst-agent.md`](./temp/technical-analyst-agent.md).

---

## Tooling

| Concern                 | Tool                                        | Why                                                             |
| ----------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| **Runtime / framework** | [eve.dev](https://eve.dev)                  | Vercel-native, filesystem-first agent discovery                 |
| **Package manager**     | pnpm 11.x                                   | Workspace catalogs, strict resolution                           |
| **Build / task runner** | Turborepo 2.x                               | Free Remote Cache on Vercel, auto-skip                          |
| **Linter**              | [oxlint](https://oxc.rs) (1.x, Rust)        | 50-100× faster than ESLint, 870+ native rules                   |
| **Formatter**           | [oxfmt](https://oxc.rs) (0.71 beta, Rust)   | 30-50× faster than Prettier, 100 % Prettier-conformant on JS/TS |
| **Type-checker**        | TypeScript 5.x (strict)                     | Standard                                                        |
| **Versioning**          | Changesets (independent mode)               | Per-agent semver                                                |
| **CI**                  | TBD (Vercel multi-project + GitHub Actions) | See `monorepo-structure.md`                                     |

> We chose **oxlint + oxfmt** over ESLint + Prettier for the same reasons [stlite](https://github.com/whitphx/stlite/pull/1999) and [Pyreon](https://github.com/pyreon/pyreon) did: 30-50× faster, 2 config files instead of 16, and the OXC team (VoidZero) maintains both with shared parser/roadmap.

---

## Structure

```
agents-studio/
├── apps/                          # Deployable eve agents
│   └── technical-analyst/         # First agent (planned)
├── packages/                      # Shared internal libraries
│   ├── oxlint-config/             # @workspace/oxlint-config (lint + format)
│   └── tsconfig/                  # @workspace/tsconfig
├── tools/                         # Internal CLI scripts (future)
├── skills/                        # Cross-agent Markdown skills (future)
├── .changeset/                    # Changesets config
├── oxlint.config.ts               # Root oxlint config (imports @workspace/oxlint-config)
├── .oxfmtrc.json                  # Root oxfmt config
├── .github/                       # GitHub Actions (added when remote is configured)
└── ...config
```

## Conventions

- **Package prefix:** `@workspace/*`
- **Branch model:** Trunk-based, `agent/<name>/<feature>` short-lived branches
- **Node:** >= 22 (see `.nvmrc`)
- **Lint/format:** oxlint for behavior, oxfmt for style — no overlap, no conflict
- **Type-aware rules:** root config only (oxlint-tsgolint constraint)

See [`temp/monorepo-structure.md`](./temp/monorepo-structure.md) for the full rationale.

## Common commands

```bash
# Install deps (run after every pull)
pnpm install

# Lint everything (oxlint, fast — ~1s on 1000 files)
pnpm lint

# Auto-fix what's safe
pnpm lint:fix

# Format everything (oxfmt, fast)
pnpm format

# Check formatting in CI
pnpm format:check

# Combined check (lint + format)
pnpm check

# Build all (cache-aware via Turborepo)
pnpm build

# Type-check, test, etc. (delegated to Turborepo)
pnpm typecheck
pnpm test

# Watch a specific app (e.g., Technical Analyst)
pnpm -F agent-technical-analyst dev

# Add a changeset entry (semver bump + changelog)
pnpm changeset
```

## Adding a new agent

1. `mkdir -p apps/<new-agent>`
2. Copy the scaffold pattern (see `temp/monorepo-structure.md` §6)
3. Update root scripts if needed (Turbo picks them up automatically)
4. Add a Changeset entry

## Adding a new shared package

Only when ≥2 agents would consume it (the "two consumers" rule).
When the time comes, see `temp/monorepo-structure.md` §5.1 and §7.

---

**Status:** Phase 0 complete — monorepo skeleton with oxlint + oxfmt.
