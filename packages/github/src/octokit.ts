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

import { defaultThrottleHandlers } from "./throttle.js";
import type { GitHubClientConfig } from "./client.js";

/** The Octokit class composed with our three plugins. */
const MyOctokit = Octokit.plugin(throttling, retry, paginateRest);

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
  const opts: ConstructorParameters<typeof MyOctokit>[0] = {
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
  return new MyOctokit(opts);
}
