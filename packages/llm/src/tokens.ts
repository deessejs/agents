import { encode } from "gpt-tokenizer";

/**
 * Synchronous, local heuristic token count.
 *
 * Uses the cl100k_base tokenizer (the encoding that GPT-4-class models
 * share). This is an approximation: Anthropic and other vendors may
 * produce different counts for the same text, but it is good enough for
 * budget enforcement and digest length validation, and runs offline
 * without an API call.
 */
export function countTokens(text: string): number {
  return encode(text).length;
}
