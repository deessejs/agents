# `@workspace/tsconfig`

Shared TypeScript configs for the monorepo.

## Exports

| Subpath                            | Use case                                          |
| ---------------------------------- | ------------------------------------------------- |
| `@workspace/tsconfig/base.json`    | Base strict config (every workspace extends this) |
| `@workspace/tsconfig/library.json` | Library preset (composite-style outDir)           |

## Usage

In a workspace's `tsconfig.json`:

```json
{
  "extends": "@workspace/tsconfig/base.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules"]
}
```

For a library:

```json
{
  "extends": "@workspace/tsconfig/library.json"
}
```

## Conventions

- All workspaces extend `@workspace/tsconfig/base.json` (or `library.json` for libs).
- Strict mode is on by default (no `any` escape hatch).
- `verbatimModuleSyntax` enforces explicit `type` imports.
- `noUncheckedIndexedAccess` is on — index access returns `T | undefined`.
- Keep per-workspace `compilerOptions` minimal; propose additions back to base.

## Adding a new preset

When ≥2 workspaces need a new config shape (e.g., `next.json`, `eve.json`):

1. Add the file in this package.
2. Add it to `exports` in `package.json`.
3. Document it here.
