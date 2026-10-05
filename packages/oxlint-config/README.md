# `@workspace/oxlint-config`

Shared [oxlint](https://oxc.rs) + [oxfmt](https://oxc.rs) configs for the monorepo.

## Why oxlint + oxfmt?

- **oxlint** (1.x stable) replaces ESLint with a 50-100× faster linter written in Rust (VoidZero / OXC).
- **oxfmt** (0.71 beta) replaces Prettier with a 30-50× faster formatter, 100 % Prettier-conformant on JS/TS.
- Both are siblings from the same OXC project — shared parser, shared roadmap, single CLI surface.
- Native support for TypeScript, React, JSX a11y, import, unicorn, promise, vitest, Next.js.
- Import sort and Tailwind class sort are **built-in** (no plugins needed).

## Exports

| Subpath                           | Use case                                                  |
| --------------------------------- | --------------------------------------------------------- |
| `@workspace/oxlint-config/oxlint` | Base oxlint config object (`baseOxlintConfig`)            |
| `@workspace/oxlint-config/oxfmt`  | Base oxfmt JSON config (spread into your `.oxfmtrc.json`) |

## Usage

In the root `oxlint.config.ts`:

```ts
import { baseOxlintConfig } from "@workspace/oxlint-config/oxlint";

export default {
  ...baseOxlintConfig,
  // root-level overrides here
};
```

In a workspace's `oxlint.config.ts`:

```ts
import { baseOxlintConfig } from "@workspace/oxlint-config/oxlint";

export default {
  ...baseOxlintConfig,
  rules: {
    ...baseOxlintConfig.rules,
    // workspace-specific overrides
  },
  ignorePatterns: [...baseOxlintConfig.ignorePatterns, "fixtures/**"],
};
```

For format, copy `.oxfmtrc.json` or import it from your workspace.

## Conventions

- **Two config files, not sixteen**: oxlint's nested config auto-discovery means workspaces rarely need their own file.
- **Type-aware rules** (via `oxlint-tsgolint`) live in the **root config only** — not in workspace overrides.
- **Style rules** are off by default — `oxfmt` handles all formatting deterministically.
- **`pedantic` is off** — pedantic rules are noise; correctness/security/performance rules are what matter.
- **Import sort is on** — groups in order: builtin, external, internal, parent/sibling/index, type, with blank lines between groups.
