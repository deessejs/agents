import { minimax } from "@ai-sdk/minimax";
import type { ModelId } from "./models.ts";

/**
 * Return type of `minimax(modelId)`.
 *
 * The provider's callable interface returns a `LanguageModelV4` from
 * `@ai-sdk/provider`; we extract it via `ReturnType<typeof …>` so we
 * don't take a hard dependency on `@ai-sdk/provider` for types.
 */
export type MiniMaxModel = ReturnType<typeof minimax>;

/**
 * Resolve a model id to a `MiniMaxModel` instance.
 *
 * Kept as a separate function so the fallback chain can build its list
 * of resolvers.
 */
function resolveModel(modelId: ModelId): MiniMaxModel {
  return minimax(modelId);
}

/**
 * Build the resolver list for `withFallback`.
 *
 * The first resolver is the per-call override (if any), otherwise the
 * configured primary model. Any remaining entries come from
 * `LLMConfig.fallbackModels`. The returned thunks defer model
 * resolution until the call site so that a fallback model is only
 * instantiated when it's tried.
 */
export function buildResolvers(
  primary: ModelId,
  fallbackModels: ReadonlyArray<ModelId>,
  perCallOverride: ModelId | undefined,
): Array<() => MiniMaxModel> {
  const head = perCallOverride ?? primary;
  const resolvers: Array<() => MiniMaxModel> = [() => resolveModel(head)];
  for (const id of fallbackModels) {
    resolvers.push(() => resolveModel(id));
  }
  return resolvers;
}
