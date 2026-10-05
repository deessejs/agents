import { generateText } from "ai";
import { withCaching } from "./cache.ts";
import {
  readCachedInputTokens,
  validatedNumber,
  MaxTokensSchema,
  TemperatureSchema,
} from "./metadata.ts";
import { buildResolvers, type MiniMaxModel } from "./resolver.ts";
import { withFallback } from "./fallback.ts";
import type { CompletionOpts, CompletionResult } from "./types.ts";
import type { ModelId } from "./models.ts";

/**
 * Implementation of {@link LLM.complete} that applies our defaults
 * and walks the fallback chain on retryable errors.
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
  const validatedMaxTokens = validatedNumber(MaxTokensSchema, opts.maxTokens, "maxTokens");
  const validatedTemperature = validatedNumber(TemperatureSchema, opts.temperature, "temperature");

  const resolvers = buildResolvers(config.primary, config.fallbackModels, opts.model);
  const effectiveModel = opts.model ?? config.primary;

  return await withFallback(
    async () => {
      const [resolver] = resolvers;
      if (resolver === undefined) {
        throw new Error("[@workspace/llm] no model configured");
      }
      return runComplete(resolver(), opts, config, effectiveModel, {
        maxTokens: validatedMaxTokens,
        temperature: validatedTemperature,
      });
    },
    ...resolvers.slice(1).map(
      (resolver) => async () =>
        runComplete(resolver(), opts, config, effectiveModel, {
          maxTokens: validatedMaxTokens,
          temperature: validatedTemperature,
        }),
    ),
  );
}

/**
 * Run a single `generateText` call against the given model and map the
 * result into our `CompletionResult` shape. Extracted so the fallback
 * chain can call it for each resolver without code duplication.
 */
async function runComplete(
  model: MiniMaxModel,
  opts: CompletionOpts,
  config: {
    promptCaching: boolean;
    maxRetries: number;
    timeoutMs: number;
  },
  effectiveModel: ModelId,
  validated: {
    maxTokens: number | undefined;
    temperature: number | undefined;
  },
): Promise<CompletionResult> {
  const useCaching =
    config.promptCaching &&
    opts.promptCaching !== false &&
    opts.system !== undefined &&
    opts.system.length > 0;

  const result = await generateText({
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
  });

  const cached = readCachedInputTokens(result.providerMetadata);
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
