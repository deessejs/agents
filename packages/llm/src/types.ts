import type { FinishReason } from "ai";
import type { ModelId } from "./models.ts";

/**
 * Per-call options that control how a completion is generated.
 *
 * Mirrors the parameters most agents need to tune on a per-request basis;
 * global defaults belong on {@link LLMConfig}.
 */
export interface CompletionOpts {
  /** System prompt (instructions). */
  system?: string;

  /** User prompt. */
  prompt: string;

  /** Override the configured primary model for this call only. */
  model?: ModelId;

  /** Maximum number of tokens to generate. Default: 2000. */
  maxTokens?: number;

  /** Sampling temperature (0-1). Default: 0.3 (factual). */
  temperature?: number;

  /** When false, no Anthropic cache breakpoint is attached. Default: true. */
  promptCaching?: boolean;

  /** Free-form key/value metadata forwarded to the AI SDK for telemetry. */
  metadata?: Record<string, string>;
}

/**
 * Token usage breakdown for a single completion.
 *
 * The fields mirror the AI SDK v7 `LanguageModelUsage` shape: v7 renamed
 * the v4 `promptTokens` / `completionTokens` to `inputTokens` /
 * `outputTokens` and moved the cache breakdown to `inputTokenDetails`.
 * We re-expose them with the v4 names because they are easier to read for
 * humans.
 *
 * `cachedInputTokens` is read from the Anthropic `providerMetadata`
 * (`providerMetadata.anthropic.usage.cache_read_input_tokens`).
 */
export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
  cachedInputTokens?: number;
}

/**
 * Result returned from {@link LLM.complete}.
 *
 * `model` reflects which model actually answered — useful when a fallback
 * chain is configured and the primary model failed.
 */
export interface CompletionResult {
  text: string;
  usage: CompletionUsage;
  finishReason: FinishReason;
  model: ModelId;
}

/**
 * Factory configuration shared by every method on the returned {@link LLM}.
 *
 * Defaults: `primary = MODELS.PRIMARY`, `fallbackModels = []`,
 * `promptCaching = true`, `maxRetries = 2`, `timeoutMs = 30_000`.
 */
export interface LLMConfig {
  /** Primary model id. Default: `MODELS.PRIMARY`. */
  primary?: ModelId;
  /** Fallback models tried in order when the primary throws a retryable error. */
  fallbackModels?: ModelId[];
  /** Whether to attach an Anthropic cache breakpoint to the system message. */
  promptCaching?: boolean;
  /** Maximum number of retries per call (passed to the AI SDK). Default: 2. */
  maxRetries?: number;
  /** Per-call timeout in milliseconds. Default: 30_000. */
  timeoutMs?: number;
}

/**
 * The unified LLM handle returned by {@link createLLM}.
 *
 * Implementations wrap `generateText` and `streamText` from the AI SDK
 * with our defaults applied (model selection, fallback chain, cache,
 * retries, timeout, telemetry metadata).
 */
export interface LLM {
  /** Generate a single completion. */
  complete(opts: CompletionOpts): Promise<CompletionResult>;
  /** Generate a streaming completion. Returns a string-only async iterable. */
  streamComplete(opts: CompletionOpts): Promise<AsyncIterable<string>>;
  /** Synchronous local heuristic token count (uses gpt-tokenizer). */
  countTokens(text: string): number;
}
