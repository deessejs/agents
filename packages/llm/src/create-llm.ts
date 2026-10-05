import { complete } from "./complete.ts";
import { countTokens } from "./tokens.ts";
import { streamComplete } from "./stream.ts";
import type { LLM, LLMConfig } from "./types.ts";
import { MODELS } from "./models.ts";

/**
 * Default factory values. Centralized so individual methods don't have
 * to repeat them and so tests can snapshot the defaults. Module-private
 * — only {@link createLLM} uses it.
 */
const DEFAULT_LLM_CONFIG = {
  primary: MODELS.PRIMARY,
  fallbackModels: [] as ReadonlyArray<typeof MODELS.PRIMARY>,
  promptCaching: true,
  maxRetries: 2,
  timeoutMs: 30_000,
} as const;

/**
 * Create a configured {@link LLM} handle.
 *
 * The handle is a thin façade over AI SDK `generateText` / `streamText`
 * with our defaults applied: the fallback list, prompt caching, retries,
 * and timeout. Each call resolves a fresh provider object internally — the
 * underlying `fetch` keeps the connection alive on the agent's behalf
 * because the provider is module-level.
 */
export function createLLM(config?: LLMConfig): LLM {
  const merged = {
    ...DEFAULT_LLM_CONFIG,
    ...(config ?? {}),
  };

  return {
    complete(opts) {
      return complete(opts, merged);
    },
    streamComplete(opts) {
      return streamComplete(opts, merged);
    },
    countTokens,
  };
}
