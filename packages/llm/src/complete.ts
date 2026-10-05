import type { LanguageModel } from "ai";
import { generateText } from "ai";
import { minimax } from "@ai-sdk/minimax";

import { withCaching } from "./cache.ts";
import { withFallback } from "./fallback.ts";
import type { CompletionOpts, CompletionResult } from "./types.ts";
import type { ModelId } from "./models.ts";

/**
 * Anthropic-specific metadata shape we care about. Other providers may
 * emit their own keys (which we simply ignore).
 */
interface AnthropicProviderMetadata {
  usage?: {
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}

/**
 * Internal shape of the merged `providerMetadata` map. Unrecognized keys
 * are intentionally tolerated.
 */
type ProviderMetadataMap = Record<string, AnthropicProviderMetadata | undefined>;

/**
 * Extract cached input tokens from the Anthropic provider metadata block.
 * Returns 0 when no cache info is present.
 */
function readCached(providerMetadata: unknown): number {
  if (typeof providerMetadata !== "object" || providerMetadata === null) return 0;
  const anthropic = (providerMetadata as ProviderMetadataMap).anthropic;
  return anthropic?.usage?.cache_read_input_tokens ?? 0;
}

/**
 * Resolve a model id to a `LanguageModel` instance. Kept as a separate
 * function so the fallback chain can build its list of resolvers.
 */
function resolveModel(modelId: ModelId): LanguageModel {
  return minimax(modelId) as unknown as LanguageModel;
}

/**
 * Build the resolver list for `withFallback`. The first resolver is the
 * primary model (or the per-call override); any remaining entries come
 * from `LLMConfig.fallbackModels`.
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
 * Run a single `generateText` call against the given model and map the
 * result into our `CompletionResult` shape. Extracted so the fallback
 * chain can call it for each resolver without code duplication.
 */
async function runComplete(
  model: LanguageModel,
  opts: CompletionOpts,
  config: {
    promptCaching: boolean;
    maxRetries: number;
    timeoutMs: number;
  },
  effectiveModel: ModelId,
): Promise<CompletionResult> {
  const useCaching =
    config.promptCaching &&
    opts.promptCaching !== false &&
    opts.system !== undefined &&
    opts.system.length > 0;

  const result = await generateText({
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
  });

  const cached = readCached(result.providerMetadata);
  // AI SDK v7 `LanguageModelUsage` exposes `inputTokens` and
  // `outputTokens` as plain scalars (the structured breakdown lives on
  // `inputTokenDetails` / `outputTokenDetails`).
  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  return {
    text: result.text,
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      ...(cached > 0 ? { cachedInputTokens: cached } : {}),
    },
    finishReason: result.finishReason,
    model: effectiveModel,
  };
}

/**
 * Implementation of {@link LLM.complete} that applies our defaults and
 * walks the fallback chain on retryable errors.
 */
export async function complete(
  opts: CompletionOpts,
  config: {
    primary: ModelId;
    fallbackModels: ReadonlyArray<ModelId>;
    promptCaching: boolean;
    maxRetries: number;
    timeoutMs: number;
  },
): Promise<CompletionResult> {
  const resolvers = buildResolvers(config.primary, config.fallbackModels, opts.model);
  const effectiveModel = opts.model ?? config.primary;

  return await withFallback(
    async () => {
      const [resolver] = resolvers;
      if (resolver === undefined) {
        throw new Error("[@workspace/llm] no model configured");
      }
      return runComplete(resolver(), opts, config, effectiveModel);
    },
    ...resolvers
      .slice(1)
      .map((resolver) => async () => runComplete(resolver(), opts, config, effectiveModel)),
  );
}
