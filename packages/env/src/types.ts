import type { z, ZodType } from "zod";

/**
 * The validated environment shape for a given Zod schema.
 *
 * Each value is `Readonly` so consumers cannot mutate the env object
 * after it has been produced by `createEnv`.
 */
export type Env<T extends ZodType> = Readonly<z.infer<T>>;

/**
 * Alias for {@link Env}. Provided so callers can use either name
 * depending on which reads more naturally in context.
 */
export type InferEnv<T extends ZodType> = Readonly<z.infer<T>>;
