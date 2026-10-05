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
  const existingAnthropic = (existingOptions.anthropic ?? {}) as Record<string, unknown>;
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
 * Wrap a string instructions value into a `SystemModelMessage` with an
 * Anthropic cache breakpoint attached.
 *
 * The AI SDK's `instructions` (formerly `system`) field accepts
 * `string | SystemModelMessage | Array<SystemModelMessage>`; passing a
 * structured message is the supported way to attach provider-specific
 * options such as the cache directive.
 */
export function withCaching(input: string | SystemModelMessage): SystemModelMessage {
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
 * Convenience wrapper around {@link withCaching} that accepts the full
 * `Instructions` union (string | SystemModelMessage | SystemModelMessage[]).
 * Array inputs are mapped element-wise; string inputs are converted via
 * `withCaching`.
 */
export function withCachingAll(instructions: Instructions): Instructions {
  if (Array.isArray(instructions)) {
    return instructions.map((msg) => withCachedSystemMessage(msg));
  }
  return withCaching(instructions);
}
