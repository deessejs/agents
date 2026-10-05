import type { LanguageModel } from "ai";
import { streamText } from "ai";
import { minimax } from "@ai-sdk/minimax";

import { withCaching } from "./cache.ts";
import { withFallback } from "./fallback.ts";
import type { CompletionOpts } from "./types.ts";
import type { ModelId } from "./models.ts";

function resolveModel(modelId: ModelId): LanguageModel {
  return minimax(modelId) as unknown as LanguageModel;
}

/**
 * Build the resolver list for the streaming path. Mirrors {@link complete}'s
 * resolver construction but is kept in this module so the two paths can
 * diverge if needed (e.g., only streaming-specific defaults).
 */
function buildResolvers(
  primary: ModelId,
  fallbackModels: ReadonlyArray<ModelId>,
  perCallOverride: ModelId | undefined,
): Array<() => LanguageModel> {
  const head = perCallOverride ?? primary;
  const resolvers: Array<() => LanguageModel> = [() => resolveModel(head)];
  for (const id of fallbackModels) {
    resolvers.push(() => resolveModel(id));
  }
  return resolvers;
}

/**
 * Run a single `streamText` call and return its text-only async iterable.
 *
 * Wrapped so we can attach our fallback chain uniformly with `complete()`.
 */
function runStream(
  opts: CompletionOpts,
  config: {
    promptCaching: boolean;
    maxRetries: number;
    timeoutMs: number;
  },
  model: LanguageModel,
): AsyncIterable<string> {
  const useCaching =
    config.promptCaching &&
    opts.promptCaching !== false &&
    opts.system !== undefined &&
    opts.system.length > 0;

  return streamText({
    model,
    maxOutputTokens: opts.maxTokens ?? 2000,
    temperature: opts.temperature ?? 0.3,
    maxRetries: config.maxRetries,
    timeout: config.timeoutMs,
    experimental_telemetry: { isEnabled: true },
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
 * If the primary model throws a retryable error during stream startup we
 * retry on the next fallback model; mid-stream errors propagate to the
 * caller via the standard `for await` loop.
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
  const resolvers = buildResolvers(config.primary, config.fallbackModels, opts.model);
  return await withFallback(
    async () => {
      const [resolver] = resolvers;
      if (resolver === undefined) throw new Error("[@workspace/llm] no model configured");
      return runStream(opts, config, resolver());
    },
    ...resolvers.slice(1).map((resolver) => async () => runStream(opts, config, resolver())),
  );
}
