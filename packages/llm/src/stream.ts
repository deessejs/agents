import { streamText } from "ai";

import { useSystemCaching } from "./cache.ts";
import { buildResolvers, type MiniMaxModel } from "./resolver.ts";
import { withFallback } from "./fallback.ts";
import { MaxTokensSchema, TemperatureSchema, validatedNumber } from "./metadata-internal.ts";
import type { CompletionOpts, RunConfig } from "./types.ts";

/**
 * Run a single `streamText` call and return its text-only async
 * iterable.
 *
 * Wrapped so we can attach our fallback chain uniformly with
 * {@link complete}.
 */
function runStream(
  opts: CompletionOpts,
  config: RunConfig,
  model: MiniMaxModel,
  validated: {
    maxTokens: number | undefined;
    temperature: number | undefined;
  },
): AsyncIterable<string> {
  const cachedInstructions = useSystemCaching(config, opts, opts.system);
  const plainInstructions =
    opts.system !== undefined && opts.system.length > 0 ? opts.system : undefined;

  return streamText({
    model,
    maxOutputTokens: validated.maxTokens ?? 2000,
    temperature: validated.temperature ?? 0.3,
    maxRetries: config.maxRetries,
    timeout: config.timeoutMs,
    // AI SDK v7 stabilized `experimental_telemetry` → `telemetry`. The
    // `functionId` is the v7 way to group spans in the observability
    // backend; defaulting to `"llm.streamComplete"` keeps every
    // streaming call under one label unless the caller overrides it.
    telemetry: {
      isEnabled: true,
      functionId: opts.functionId ?? "llm.streamComplete",
      ...(opts.metadata !== undefined ? { metadata: { ...opts.metadata } } : {}),
    },
    ...(cachedInstructions !== undefined
      ? { instructions: cachedInstructions }
      : plainInstructions !== undefined
        ? { instructions: plainInstructions }
        : {}),
    prompt: opts.prompt,
  }).textStream;
}

/**
 * Implementation of {@link LLM.streamComplete}.
 *
 * Fallback semantics:
 *  - **Startup errors** (anything thrown by `streamText` or
 *    `buildResolvers`) retry on the next fallback model via the
 *    {@link withFallback} chain.
 *  - **Mid-stream errors** (thrown from inside the async iterable
 *    *after* the first chunk) propagate directly to the caller's
 *    `for await` loop — by then the consumer is committed to this
 *    stream, so switching models mid-stream would be confusing.
 *  - **Empty-stream completion** (provider returns a stream that
 *    immediately finishes with no chunks) is surfaced as an empty
 *    iterable, not an error.
 */
export async function streamComplete(
  opts: CompletionOpts,
  config: RunConfig,
): Promise<AsyncIterable<string>> {
  const validatedMaxTokens = validatedNumber(MaxTokensSchema, opts.maxTokens, "maxTokens");
  const validatedTemperature = validatedNumber(TemperatureSchema, opts.temperature, "temperature");

  const resolvers = buildResolvers(config.primary, config.fallbackModels, opts.model);
  return await withFallback(
    async () => {
      // `buildResolvers` always returns a non-empty tuple, so the head
      // is `() => MiniMaxModel` (no `| undefined`).
      const [resolver] = resolvers;
      return runStream(opts, config, resolver(), {
        maxTokens: validatedMaxTokens,
        temperature: validatedTemperature,
      });
    },
    ...resolvers.slice(1).map(
      (resolver) => async () =>
        runStream(opts, config, resolver(), {
          maxTokens: validatedMaxTokens,
          temperature: validatedTemperature,
        }),
    ),
  );
}
