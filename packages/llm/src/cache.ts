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
 */
function withCachedSystemMessage(message: SystemModelMessage): SystemModelMessage {
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

/**
 * Decide whether a system prompt should be wrapped with the Anthropic
 * cache breakpoint, and return the wrapped form when it should.
 *
 * Returns `undefined` when no caching should be applied (either the
 * caller opted out via `promptCaching: false`, the global config
 * disabled it, or the system prompt is empty). When caching is on,
 * returns the `Instructions` value the AI SDK's `instructions` field
 * expects (a `SystemModelMessage` or array thereof).
 *
 * Centralised so `complete.ts` and `stream.ts` stay in lock-step on
 * the cache-decision logic.
 */
export function useSystemCaching(
  config: { promptCaching: boolean },
  opts: { promptCaching?: boolean; system?: string },
  systemValue: string | undefined,
): Instructions | undefined {
  const useCaching =
    config.promptCaching &&
    opts.promptCaching !== false &&
    systemValue !== undefined &&
    systemValue.length > 0;
  return useCaching && systemValue !== undefined ? withCaching(systemValue) : undefined;
}
