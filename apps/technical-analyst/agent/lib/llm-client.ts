/**
 * Single source of truth for the agent's LLM model handle.
 *
 * Returns the AI SDK v7 model instance that `generateObject` /
 * `streamText` accept. The provider is picked by inspecting the
 * `LLM_MODEL_ID` env value:
 *
 *   - starts with `claude-`  → @ai-sdk/anthropic
 *   - anything else           → @ai-sdk/minimax (default)
 */
import { anthropic as anthropicProvider } from "@ai-sdk/anthropic";
import { minimax as minimaxProvider } from "@ai-sdk/minimax";
import { env } from "../env.ts";

/** Cache the model handle (avoid rebuilding it on every call). */
let cachedModel: unknown = undefined;

/**
 * Resolve the AI SDK model handle for the active LLM_MODEL_ID.
 *
 * Returned as `unknown` because each provider exports a different
 * concrete type; `ai.generateObject()` accepts the structural shape
 * and is the only intended consumer.
 */
export function model(): unknown {
  if (cachedModel !== undefined) return cachedModel;
  const id: string = env.LLM_MODEL_ID;
  // Provider model id types are narrow literal unions; cast through
  // `string` because the env-schema layer is `string` and the runtime
  // prefix-check prevents the wrong provider from receiving a wrong id.
  cachedModel = id.startsWith("claude-")
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (anthropicProvider(id as any) as unknown)
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (minimaxProvider(id as any) as unknown);
  return cachedModel;
}
