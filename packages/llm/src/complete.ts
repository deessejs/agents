import { generateText } from "ai";
import { minimax } from "@ai-sdk/minimax";

import { useSystemCaching } from "./cache.ts";
import { readCachedInputTokens } from "./metadata.ts";
import { buildResolvers } from "./resolver.ts";
import { withFallback } from "./fallback.ts";
import { MaxTokensSchema, TemperatureSchema, validatedNumber } from "./metadata-internal.ts";
import type { CompletionOpts, CompletionResult, RunConfig } from "./types.ts";
import type { ModelId } from "./models.ts";

/**
 * Return type of `minimax(modelId)`. Extracted here (rather than from
 * the resolver module) so this file does not depend on a private
 * type defined in a sibling module.
 */
type MiniMaxModel = ReturnType<typeof minimax>;

/**
 * Implementation of {@link LLM.complete} that applies our defaults
 * and walks the fallback chain on retryable errors.
 */
export async function complete(opts: CompletionOpts, config: RunConfig): Promise<CompletionResult> {
  const validatedMaxTokens = validatedNumber(MaxTokensSchema, opts.maxTokens, "maxTokens");
  const validatedTemperature = validatedNumber(TemperatureSchema, opts.temperature, "temperature");

  const resolvers = buildResolvers(config.primary, config.fallbackModels, opts.model);
  const effectiveModel = opts.model ?? config.primary;

  return await withFallback(
    async () => {
      // `buildResolvers` always returns a non-empty tuple, so the head
      // is `() => LanguageModelV4` (no `| undefined`).
      const [resolver] = resolvers;
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
  config: RunConfig,
  effectiveModel: ModelId,
  validated: {
    maxTokens: number | undefined;
    temperature: number | undefined;
  },
): Promise<CompletionResult> {
  const cachedInstructions = useSystemCaching(config, opts, opts.system);
  const plainInstructions =
    opts.system !== undefined && opts.system.length > 0 ? opts.system : undefined;

  const result = await generateText({
    model,
    maxOutputTokens: validated.maxTokens ?? 2000,
    temperature: validated.temperature ?? 0.3,
    maxRetries: config.maxRetries,
    timeout: config.timeoutMs,
    // AI SDK v7 stabilized `experimental_telemetry` → `telemetry`. The
    // `functionId` is the v7 way to group spans in the observability
    // backend; defaulting to `"llm.complete"` keeps every single-shot
    // call under one label unless the caller overrides it.
    telemetry: {
      isEnabled: true,
      functionId: opts.functionId ?? "llm.complete",
      ...(opts.metadata !== undefined ? { metadata: { ...opts.metadata } } : {}),
    },
    ...(cachedInstructions !== undefined
      ? { instructions: cachedInstructions }
      : plainInstructions !== undefined
        ? { instructions: plainInstructions }
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
