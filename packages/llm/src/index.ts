/**
 * Public API surface for the `@workspace/llm` package.
 *
 * Consumers should only import from this entry point. Subpath exports
 * (text/stream/object/tokens/types) are part of the design doc; only the
 * main entry is currently wired in `package.json#exports` because the
 * skeleton keeps things minimal. Consumers can still import directly
 * from `./src/...` during development.
 */

export { createLLM } from "./create-llm.ts";
export { MODELS } from "./models.ts";

export { countTokens } from "./tokens.ts";
export { withCaching } from "./cache.ts";
export { withFallback } from "./fallback.ts";
export { isRetryable } from "./error.ts";

export type { LLM, LLMConfig, CompletionOpts, CompletionResult, CompletionUsage } from "./types.ts";

export type { ModelId } from "./models.ts";
