import { z } from "zod";

/**
 * Zod schema for the shape of the AI SDK's `providerMetadata` map.
 *
 * The AI SDK exposes `providerMetadata` as
 * `SharedV4ProviderMetadata = Record<string, JSONObject>` — i.e. we
 * have to do our own narrowing for each provider. Parsing with a
 * Zod schema at the boundary lets us read the Anthropic cache stats
 * with confidence and without an `as` cast.
 */
export const ProviderMetadataSchema = z
  .object({
    anthropic: z
      .object({
        usage: z
          .object({
            cache_read_input_tokens: z.number().optional(),
            cache_creation_input_tokens: z.number().optional(),
            input_tokens: z.number().optional(),
            output_tokens: z.number().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .partial();

/**
 * Read the cached-input token count from an Anthropic metadata block.
 *
 * Returns 0 when the metadata is missing, malformed, or simply has no
 * cache stats. We never throw — this is a best-effort read on an
 * already-completed call.
 */
export function readCachedInputTokens(providerMetadata: unknown): number {
  const parsed = ProviderMetadataSchema.safeParse(providerMetadata);
  if (!parsed.success) return 0;
  return parsed.data?.anthropic?.usage?.cache_read_input_tokens ?? 0;
}

/**
 * Schemas for validating per-call options at the API boundary.
 *
 * Validated as a `safeParse`; failure throws a tagged error so the
 * caller learns about the bad value (and which field it was on).
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
  return result.data as z.infer<T>;
}
