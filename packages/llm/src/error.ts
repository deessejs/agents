/**
 * Error helpers for the `@workspace/llm` package.
 *
 * The AI SDK surfaces a handful of named error classes
 * (`APICallError`, `OverloadError`, etc.); we duck-type on `.name` to
 * avoid an extra import edge. The string-match path catches the cases
 * where the SDK has wrapped a transport error into a plain `Error`.
 */

const RETRYABLE_MESSAGE_PATTERNS: ReadonlyArray<RegExp> = [
  /\b429\b/,
  /\b5\d\d\b/,
  /overloaded/i,
  /rate.?limit/i,
  /\btimeout\b/i,
  /\bnetwork\b/i,
];

const RETRYABLE_ERROR_NAMES: ReadonlySet<string> = new Set(["APICallError", "OverloadError"]);

/**
 * Returns true when the error looks like a transient upstream failure
 * that the AI SDK (or our fallback chain) should retry on.
 *
 * The match is intentionally loose: a malformed body, a programming
 * bug, or a 4xx other than 429 will NOT match, and the error will
 * bubble up to the caller.
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    for (const pattern of RETRYABLE_MESSAGE_PATTERNS) {
      if (pattern.test(err.message)) return true;
    }
  }
  if (typeof err === "object" && err !== null) {
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string" && RETRYABLE_ERROR_NAMES.has(name)) return true;
  }
  return false;
}
