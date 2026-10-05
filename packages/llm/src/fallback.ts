import { isRetryable } from "./error.ts";

/**
 * Try each thunks in sequence, returning the first successful result.
 *
 * If `primary` rejects with a retryable error and at least one fallback
 * is provided, the next fallback is tried. Non-retryable errors bubble
 * immediately without consuming the remaining fallbacks.
 *
 * If every thunk rejects (with retryable errors), the last rejection is
 * re-thrown — earlier errors are not aggregated.
 *
 * The recursion is intentionally explicit (instead of an iterative
 * `for` loop) so the call stack makes the "where did we give up?"
 * decision obvious in a debugger.
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  ...fallbacks: Array<() => Promise<T>>
): Promise<T> {
  try {
    return await primary();
  } catch (err) {
    if (!isRetryable(err) || fallbacks.length === 0) throw err;
    const [head, ...tail] = fallbacks;
    if (head === undefined) throw err;
    return await withFallback(head, ...tail);
  }
}
