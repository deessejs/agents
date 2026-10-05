import { streamText } from "ai";
import { withCaching } from "./cache.ts";
import { validatedNumber, MaxTokensSchema, TemperatureSchema } from "./metadata.ts";
import { buildResolvers, type MiniMaxModel } from "./resolver.ts";
import { withFallback } from "./fallback.ts";
import type { CompletionOpts } from "./types.ts";
import type { ModelId } from "./models.ts";

/**
 * Run a single `streamText` call and return its text-only async
 * iterable.
 *
 * Wrapped so we can attach our fallback chain uniformly with
 * {@link complete}.
 */
function runStream(
  opts: CompletionOpts,
  config: {
    promptCaching: boolean;
    maxRetries: number;
    timeoutMs: number;
  },
  model: MiniMaxModel,
  validated: {
    maxTokens: number | undefined;
    temperature: number | undefined;
  },
): AsyncIterable<string> {
  const useCaching =
    config.promptCaching &&
    opts.promptCaching !== false &&
    opts.system !== undefined &&
    opts.system.length > 0;

  return streamText({
    model,
    maxOutputTokens: validated.maxTokens ?? 2000,
    temperature: validated.temperature ?? 0.3,
    maxRetries: config.maxRetries,
    timeout: config.timeoutMs,
    experimental_telemetry: {
      isEnabled: true,
      ...(opts.metadata !== undefined ? { metadata: { ...opts.metadata } } : {}),
    },
    ...(useCaching
      ? { instructions: withCaching(opts.system ?? "") }
      : opts.system !== undefined && opts.system.length > 0
        ? { instructions: opts.system }
        : {}),
    prompt: opts.prompt,
  }).textStream;
}

/**
 * Implementation of {@link LLM.streamComplete}.
 *
 * If the primary model throws a retryable error during stream startup
 * we retry on the next fallback model; mid-stream errors propagate to
 * the caller via the standard `for await` loop.
 */
export async function streamComplete(
  opts: CompletionOpts,
  config: {
    primary: ModelId;
    fallbackModels: ReadonlyArray<ModelId>;
    promptCaching: boolean;
    maxRetries: number;
    timeoutMs: number;
  },
): Promise<AsyncIterable<string>> {
  const validatedMaxTokens = validatedNumber(MaxTokensSchema, opts.maxTokens, "maxTokens");
  const validatedTemperature = validatedNumber(TemperatureSchema, opts.temperature, "temperature");

  const resolvers = buildResolvers(config.primary, config.fallbackModels, opts.model);
  return await withFallback(
    async () => {
      const [resolver] = resolvers;
      if (resolver === undefined) throw new Error("[@workspace/llm] no model configured");
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
