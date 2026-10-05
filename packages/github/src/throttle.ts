/**
 * Default throttle handlers for the GitHub API.
 *
 * The `@octokit/plugin-throttling` plugin requires two callbacks:
 *   - `onRateLimit`         — primary rate limit (X-RateLimit-Remaining header)
 *   - `onSecondaryRateLimit` — secondary rate limit (abuse-detection mechanism)
 *
 * Returning `true` from either callback instructs the plugin to retry the
 * request after the provided delay. Returning `false` rejects the request
 * with an `RequestError`.
 *
 * We default to retrying up to 3 times on primary rate limits. On
 * secondary rate limits we retry up to `secondaryMaxRetries` (default 5)
 * times — bound because the plugin's `onSecondaryRateLimit` signature
 * does NOT include a retry count, so we track it in module state.
 */
import type { Octokit } from "@octokit/core";
import type { EndpointDefaults } from "@octokit/types";

export type RateLimitHandler = (
  retryAfter: number,
  options: Required<EndpointDefaults>,
  octokit: Octokit,
  retryCount: number,
) => boolean;

export type SecondaryRateLimitHandler = (
  retryAfter: number,
  options: Required<EndpointDefaults>,
  octokit: Octokit,
) => boolean;

export interface ThrottleHandlers {
  onRateLimit: RateLimitHandler;
  onSecondaryRateLimit: SecondaryRateLimitHandler;
}

export interface DefaultThrottleHandlersOptions {
  /** Maximum number of retries on primary rate limit. Defaults to 3. */
  maxRetries?: number;
  /**
   * Maximum number of retries on secondary rate limit. Defaults to 5.
   * (Bounded because the plugin signature doesn't expose retryCount for
   * secondary — returning `true` unconditionally would loop forever.)
   */
  secondaryMaxRetries?: number;
  /** Optional logger compatible with Octokit's log interface. */
  logger?: { warn: (message: string) => unknown };
}

/**
 * No-op logger used when callers don't pass one in. Avoids referencing the
 * global `console` (which is not declared under `lib: ["ES2022"]`).
 */
const noopLogger = { warn: (_msg: string) => undefined };

/**
 * Module-level secondary-retry counter. Keyed by a stable identifier
 * derived from the request URL so two unrelated requests don't share a
 * quota; cleared on each call to {@link __resetSecondaryRetryForTests}.
 *
 * Bounded by {@link SECONDARY_RETRY_MAP_MAX}: when the map grows beyond
 * the cap we drop the oldest entries (insertion order via `Map`'s
 * iteration order) so a long-lived client can't leak memory.
 */
const SECONDARY_RETRY_MAP_MAX = 1_000;
const secondaryRetryCounts = new Map<string, number>();

/**
 * Increment the secondary-retry counter for a key and return the new
 * value. Trims the oldest entries if the map exceeds the cap.
 */
function bumpSecondaryRetry(key: string): number {
  const next = (secondaryRetryCounts.get(key) ?? 0) + 1;
  secondaryRetryCounts.set(key, next);
  while (secondaryRetryCounts.size > SECONDARY_RETRY_MAP_MAX) {
    const oldestKey = secondaryRetryCounts.keys().next().value;
    if (oldestKey === undefined) break;
    secondaryRetryCounts.delete(oldestKey);
  }
  return next;
}

/**
 * Reset the secondary-retry counter for a key — call after a successful
 * request to release the slot.
 */
function clearSecondaryRetry(key: string): void {
  secondaryRetryCounts.delete(key);
}

/**
 * Test-only hook: forget all secondary-retry state. Production code must
 * never call this.
 */
export function __resetSecondaryRetryForTests(): void {
  secondaryRetryCounts.clear();
}

/**
 * Returns the default throttle callbacks required by the
 * `@octokit/plugin-throttling` plugin.
 */
export function defaultThrottleHandlers(opts?: DefaultThrottleHandlersOptions): ThrottleHandlers {
  const maxRetries = opts?.maxRetries ?? 3;
  const secondaryMax = opts?.secondaryMaxRetries ?? 5;
  const log = opts?.logger ?? noopLogger;

  return {
    onRateLimit: (retryAfter, options, _octokit, retryCount) => {
      log.warn(
        `[github] primary rate limit hit on ${options.method} ${options.url}, ` +
          `retrying after ${retryAfter}s (attempt ${retryCount + 1}/${maxRetries + 1})`,
      );
      // Returning true here triggers the retry; false aborts.
      return retryCount < maxRetries;
    },
    onSecondaryRateLimit: (retryAfter, options, _octokit) => {
      const key = `${options.method} ${options.url}`;
      const attempt = bumpSecondaryRetry(key);
      log.warn(
        `[github] secondary rate limit hit on ${key}, ` +
          `retrying after ${retryAfter}s (attempt ${attempt}/${secondaryMax + 1})`,
      );
      if (attempt > secondaryMax) {
        clearSecondaryRetry(key);
        return false;
      }
      return true;
    },
  };
}
