import type { ZodType } from "zod";
import { toEnvValidationError } from "./error.ts";
import type { Inferred } from "./types.ts";

/**
 * Validates `process.env` against the given Zod schema and returns a
 * frozen, fully-typed env object.
 *
 * Throws an {@link EnvValidationError} on failure. On success the
 * returned object is shallow-frozen via `Object.freeze`, which is
 * sufficient to prevent accidental mutation of top-level keys.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { createEnv } from "@workspace/env";
 *
 * const schema = z.object({ PORT: z.coerce.number().default(3000) }).strict();
 * export const env = createEnv(schema);
 * ```
 */
export function createEnv<T extends ZodType>(schema: T): Inferred<T> {
  // We deliberately widen `process.env` to `Record<string, string | undefined>`
  // (not `Record<string, unknown>`) so that Zod's `z.string().min(1)` chains
  // can see the real type and reject empty strings as if the user had set
  // them to `""` rather than a generic unknown value.
  const source = process.env as Record<string, string | undefined>;
  const result = schema.safeParse(source);
  if (!result.success) {
    throw toEnvValidationError(result.error);
  }
  return Object.freeze(result.data);
}
