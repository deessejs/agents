import { z } from "zod";

/**
 * Internal-only metadata helpers shared by `complete.ts` / `stream.ts`.
 *
 * This file is **not** re-exported from the package entry point, so the
 * schemas and the validation helper are accessible to sibling source
 * files without becoming part of the public API. Mirror the public
 * `readCachedInputTokens` (in `metadata.ts`) for any helper that should
 * be exposed.
 */

export const MaxTokensSchema = z.number().int().min(1).max(8192);
export const TemperatureSchema = z.number().min(0).max(2);

/**
 * Resolve the validated value for a given parameter, or fall back to
 * `undefined` if the caller didn't pass one. Throws on invalid input
 * (e.g. `maxTokens: 10000` which exceeds the schema's `max(8192)`).
 */
export function validatedNumber<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
  fieldName: string,
): z.infer<T> | undefined {
  if (value === undefined) return undefined;
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`[@workspace/llm] invalid ${fieldName}: ${result.error.message}`);
  }
  return result.data;
}
