/**
 * Model identifiers understood by the `@workspace/llm` package.
 *
 * The default primary model is `minimax-m3`, which is the current text model
 * exposed by the `@ai-sdk/minimax` community provider
 * (see the package's README: `model: minimax('minimax-m3')`).
 *
 * The model id is intentionally typed as `string & {}` for the open-ended
 * union so future additions do not require a code change here.
 *
 * TODO(verify): cross-check the exact model id against the @ai-sdk/minimax
 * README at install time. The provider advertises a `MiniMaxChatModelId`
 * union of `'minimax-m3' | 'minimax-m2.7' | ... | (string & {})` so any
 * provider-supported id is also accepted by the underlying SDK.
 */
export const MODELS = {
  /** Default text model. */
  PRIMARY: "minimax-m3",
} as const;

/**
 * Union of model identifiers declared in {@link MODELS}. Falls back to
 * `string` so additional ids accepted by the underlying provider can be
 * passed through with a cast if needed.
 */
export type ModelId = (typeof MODELS)[keyof typeof MODELS];
