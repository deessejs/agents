import type { z, ZodType } from "zod";

/**
 * The validated environment shape for a given Zod schema.
 *
 * Each value is `Readonly` so consumers cannot mutate the env object
 * after it has been produced by `createEnv`.
 *
 * Named `Inferred` (rather than `Env`) to avoid colliding with the
 * `@workspace/env` package name when consumers write
 * `import type { Inferred } from "@workspace/env"`.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { createEnv, type Inferred } from "@workspace/env";
 *
 * const schema = z.object({ PORT: z.coerce.number() }).strict();
 * const env: Inferred<typeof schema> = createEnv(schema);
 * ```
 */
export type Inferred<T extends ZodType> = Readonly<z.infer<T>>;
