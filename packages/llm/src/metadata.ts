import { z } from "zod";

/**
 * Zod schema for the shape of the AI SDK's `providerMetadata` map.
 *
 * The AI SDK exposes `providerMetadata` as `ProviderMetadata` (v7) — a
 * `Record<string, JSONValue>` indexed by provider name. We narrow
 * it for the specific Anthropic fields we read so cache stats can be
 * surfaced without an `as` cast.
 */
const ProviderMetadataSchema = z.object({
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
});

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
