import { minimax } from "@ai-sdk/minimax";
import type { ModelId } from "./models.ts";

/**
 * Return type of `minimax(modelId)`.
 *
 * The provider's callable interface returns a `LanguageModelV4` from
 * `@ai-sdk/provider`; we extract it via `ReturnType<typeof …>` so we
 * don't take a hard dependency on `@ai-sdk/provider` for types.
 */
type MiniMaxModel = ReturnType<typeof minimax>;

/**
 * Build the resolver list for `withFallback`.
 *
 * The first resolver is the per-call override (if any), otherwise the
 * configured primary model. Any remaining entries come from
 * `LLMConfig.fallbackModels`. The returned thunks defer model
 * resolution until the call site so that a fallback model is only
 * instantiated when it's tried.
 *
 * Always returns a non-empty tuple — callers can destructure the
 * first entry as `() => MiniMaxModel` without a `| undefined`
 * narrowing, eliminating the "no model configured" check.
 */
export function buildResolvers(
  primary: ModelId,
  fallbackModels: ReadonlyArray<ModelId>,
  perCallOverride: ModelId | undefined,
): readonly [() => MiniMaxModel, ...Array<() => MiniMaxModel>] {
  const head = perCallOverride ?? primary;
  const headResolver = () => minimax(head);
  const rest: Array<() => MiniMaxModel> = fallbackModels.map((id) => () => minimax(id));
  // Non-empty tuple: `[headResolver, ...rest]` is structurally typed as
  // `readonly [() => MiniMaxModel, ...Array<() => MiniMaxModel>]` — no cast.
  return [headResolver, ...rest];
}
