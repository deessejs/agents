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
 * We default to retrying up to 3 times on primary rate limits and always
 * retrying on secondary rate limits (GitHub's documented recommendation).
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
  /** Optional logger compatible with Octokit's log interface. */
  logger?: { warn: (message: string) => unknown };
}

/**
 * No-op logger used when callers don't pass one in. Avoids referencing the
 * global `console` (which is not declared under `lib: ["ES2022"]`).
 */
const noopLogger = { warn: (_msg: string) => undefined };

/**
 * Returns the default throttle callbacks required by the
 * `@octokit/plugin-throttling` plugin.
 */
export function defaultThrottleHandlers(opts?: DefaultThrottleHandlersOptions): ThrottleHandlers {
  const maxRetries = opts?.maxRetries ?? 3;
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
    onSecondaryRateLimit: (retryAfter, options) => {
      log.warn(
        `[github] secondary rate limit hit on ${options.method} ${options.url}, ` +
          `retrying after ${retryAfter}s`,
      );
      return true;
    },
  };
}
