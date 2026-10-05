import type { z, ZodType } from "zod";

/**
 * The validated environment shape for a given Zod schema.
 *
 * Each value is `Readonly` so consumers cannot mutate the env object
 * after it has been produced by `createEnv`.
 *
 * Named `Inferred` (rather than `Env`) because `Env` would shadow the
 * `ZodType.env` and other field names inside long type expressions;
 * `Inferred<typeof schema>` reads better in call sites and stays
 * unambiguous in editor hovers.
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
