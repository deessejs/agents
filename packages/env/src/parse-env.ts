import type { z, ZodType } from "zod";
import { toEnvValidationError } from "./error.ts";

/**
 * Parses an arbitrary object against a Zod schema.
 *
 * On success returns the parsed value. On failure throws an
 * {@link EnvValidationError} whose message is the formatted error.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { parseEnv } from "@workspace/env";
 *
 * const schema = z.object({ name: z.string() });
 * const data = parseEnv({ name: "ada" }, schema);
 * ```
 */
export function parseEnv<T extends ZodType>(
  source: Record<string, unknown>,
  schema: T,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw toEnvValidationError(result.error);
  }
  return result.data;
}
