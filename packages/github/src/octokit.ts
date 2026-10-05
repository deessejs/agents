/**
 * Octokit instantiation with throttling, retry, and pagination plugins.
 *
 * The throttling plugin requires `onRateLimit` and `onSecondaryRateLimit`
 * callbacks at construction time — see `./throttle.ts`.
 */
import { Octokit } from "@octokit/core";
import { throttling } from "@octokit/plugin-throttling";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { retry } from "@octokit/plugin-retry";

import { defaultThrottleHandlers } from "./throttle.ts";
import type { GitHubClientConfig } from "./client.ts";

/**
 * The Octokit class composed with our three plugins.
 *
 * Exported (not just module-local) so `pagination.ts` can derive the
 * `InstanceType<typeof ComposedOctokit>` paginated-Octokit shape without
 * resorting to `as unknown as { paginate: ... }` casts.
 *
 * Plugin order is significant: throttling wraps retry wraps paginateRest.
 * Throttle sits outermost so it can observe (and back off on) rate-limit
 * responses that the retry plugin's own backoff produced; retry wraps
 * pagination so that the per-request transient-error retry semantics
 * apply to every individual `paginate.iterator` request, not to the
 * whole iteration.
 */
export const ComposedOctokit = Octokit.plugin(throttling, retry, paginateRest);

/**
 * Constructor options for the composed Octokit class — extracted to the
 * top so {@link createOctokit} can name its parameter type without
 * inlining `ConstructorParameters<...>[0]` at the call site.
 */
type ComposedOctokitOptions = ConstructorParameters<typeof ComposedOctokit>[0];

/**
 * Build an Octokit instance configured with throttling + retry + pagination.
 *
 * Throttling callbacks are always supplied (the throttling plugin throws
 * without them); consumers can still toggle the plugin off via
 * `config.throttling === false`.
 */
export function createOctokit(config: GitHubClientConfig): Octokit {
  // With `exactOptionalPropertyTypes: true`, we must omit optional
  // properties rather than passing `undefined`.
  const opts: ComposedOctokitOptions = {
    auth: config.auth,
    userAgent: config.userAgent ?? "agents-studio",
    request: { timeout: config.requestTimeoutMs ?? 10_000 },
    throttle: {
      enabled: config.throttling !== false,
      ...defaultThrottleHandlers(),
    },
    retry: {
      enabled: config.retry?.enabled !== false,
      // The retry plugin uses `retries` (not `maxRetries`) — we expose a
      // friendlier name in `GitHubClientConfig` and translate it here.
      retries: config.retry?.maxRetries ?? 3,
    },
  };
  if (config.baseUrl !== undefined) {
    opts.baseUrl = config.baseUrl;
  }
  return new ComposedOctokit(opts);
}
