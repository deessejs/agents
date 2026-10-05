# @workspace/env

> Strict, ergonomic `process.env` validation for every agent — built on Zod 4.

## Elevator pitch

`createEnv(schema)` parses `process.env` against a Zod schema, throws a
human-readable `EnvValidationError` on failure (with actionable hints per
known key), and returns a frozen, fully-typed object. Every agent shares
the same base schema (`NODE_ENV` + `LOG_LEVEL`) and extends it with the
provider-specific schemas it needs (Vercel, GitHub, Resend).

## Install

This is an **internal workspace package** — no install step. Apps and
other packages consume it via the workspace protocol:

```json
{
  "dependencies": {
    "@workspace/env": "workspace:*"
  }
}
```

The package ships as raw TypeScript (`./src/index.ts`); the consuming
package's `tsc` / `vitest` run handles compilation.

## Quick start (30 lines)

```ts
import { z } from "zod";
import { createEnv, EnvValidationError } from "@workspace/env";

const schema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  })
  .strict();

try {
  const env = createEnv(schema);
  // `env.PORT` is typed as `number`; mutations throw in strict mode.
  console.log(`listening on ${env.PORT}`);
} catch (err) {
  if (err instanceof EnvValidationError) {
    console.error(err.message); // Already formatted for stderr.
    process.exit(1);
  }
  throw err;
}
```

## API reference

### `createEnv<T>(schema: ZodType<T>): Inferred<T>`

Validates `process.env` against `schema`. Throws an
[`EnvValidationError`](#envvalidationerror) on failure; on success returns
a frozen, deeply-typed object whose runtime shape matches
`z.infer<typeof schema>`.

```ts
const env = createEnv(githubSchema);
// env.GITHUB_TOKEN: string
// env.GITHUB_ORG: string
```

The returned object is `Object.freeze`'d at the top level — attempting to
mutate it throws in strict mode.

### `EnvValidationError`

Thrown when validation fails. Properties:

| Field     | Type                      | Description                                        |
| --------- | ------------------------- | -------------------------------------------------- |
| `name`    | `"EnvValidationError"`    | Class name (stable for `instanceof` / `err.name`). |
| `message` | `string`                  | Pre-formatted, human-readable error block.         |
| `issues`  | `ReadonlyArray<EnvIssue>` | Per-field issues (key, message, hint, received).   |

`err.message` is already formatted for stderr — print it verbatim.

### `EnvIssue`

```ts
interface EnvIssue {
  readonly key: string;
  readonly message: string;
  readonly hint?: string;
  readonly received?: unknown;
}
```

## Schema list

| Schema         | Required env vars                             | Use case                                |
| -------------- | --------------------------------------------- | --------------------------------------- |
| `baseSchema`   | _(none — `NODE_ENV` and `LOG_LEVEL` default)_ | Every agent's foundation.               |
| `vercelSchema` | _all optional_                                | Vercel deployment metadata.             |
| `githubSchema` | `GITHUB_TOKEN`, `GITHUB_ORG`                  | GitHub App / fine-grained PAT consumer. |
| `resendSchema` | `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`       | Email delivery via Resend.              |

All schemas are `.strict()` — unknown keys are rejected. Combine them
with `z.object().extend(...)` or `z.object({ ...githubSchema.shape, ... })`
when an agent needs multiple.

## JSDoc imports

```ts
import {
  createEnv,
  EnvValidationError,
  baseSchema,
  vercelSchema,
  githubSchema,
  resendSchema,
  type Inferred,
  type EnvIssue,
} from "@workspace/env";
```

Subpath exports for splitting schemas across packages:

```ts
import { githubSchema } from "@workspace/env/schemas/github";
import { baseSchema } from "@workspace/env/schemas/base";
```

## Subpath map

| Subpath                         | Source                    |
| ------------------------------- | ------------------------- |
| `@workspace/env`                | `./src/index.ts`          |
| `@workspace/env/schemas`        | `./src/schemas/index.ts`  |
| `@workspace/env/schemas/base`   | `./src/schemas/base.ts`   |
| `@workspace/env/schemas/vercel` | `./src/schemas/vercel.ts` |
| `@workspace/env/schemas/github` | `./src/schemas/github.ts` |
| `@workspace/env/schemas/resend` | `./src/schemas/resend.ts` |
