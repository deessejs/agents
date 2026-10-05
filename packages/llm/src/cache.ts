import type { Instructions, SystemModelMessage } from "ai";

/**
 * Anthropic prompt-cache directive. `ttl: "1h"` is the longest TTL the
 * provider exposes (the other option is `"5m"`); the cache breakpoint
 * must be attached to the last message whose tokens we want cached.
 */
const ANTHROPIC_CACHE_CONTROL = {
  type: "ephemeral",
  ttl: "1h",
} as const;

/**
 * Attach an Anthropic cache breakpoint to a single `SystemModelMessage`.
 *
 * If the message already carries an `anthropic` provider option, the
 * existing keys are preserved and the cache directive is merged on top.
 *
 * Exported as a named function (rather than overloading `withCaching`)
 * because the consumer needs to operate on a concrete `SystemModelMessage`
 * once it has decided caching is on; the string-to-message wrapping is a
 * convenience helper below.
 */
export function withCachedSystemMessage(message: SystemModelMessage): SystemModelMessage {
  const existingOptions = message.providerOptions ?? {};
  const recordExistingAnthropic = existingOptions.anthropic;
  const existingAnthropic =
    recordExistingAnthropic !== undefined ? { ...recordExistingAnthropic } : {};
  return {
    ...message,
    providerOptions: {
      ...existingOptions,
      anthropic: {
        ...existingAnthropic,
        cacheControl: ANTHROPIC_CACHE_CONTROL,
      },
    },
  };
}

/**
 * Wrap an instructions value into a `SystemModelMessage` (or array)
 * with an Anthropic cache breakpoint attached.
 *
 * The AI SDK's `instructions` (formerly `system`) field accepts
 * `string | SystemModelMessage | SystemModelMessage[]`; passing a
 * structured message is the supported way to attach provider-specific
 * options such as the cache directive. This helper accepts the same
 * union, maps array inputs element-wise, and otherwise delegates to
 * {@link withCachedSystemMessage}.
 *
 * @example
 * ```ts
 * import { withCaching } from "@workspace/llm";
 *
 * const instructions = withCaching("You are a helpful assistant.");
 * // instructions.providerOptions.anthropic.cacheControl is set.
 * ```
 */
export function withCaching(input: Instructions): SystemModelMessage | SystemModelMessage[] {
  if (Array.isArray(input)) {
    return input.map((msg) => withCachedSystemMessage(msg));
  }
  if (typeof input === "string") {
    return {
      role: "system",
      content: input,
      providerOptions: {
        anthropic: { cacheControl: ANTHROPIC_CACHE_CONTROL },
      },
    };
  }
  return withCachedSystemMessage(input);
}
