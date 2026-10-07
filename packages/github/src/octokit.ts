/**
 * Octokit instantiation with throttling, retry, and pagination plugins.
 *
 * The throttling plugin's `onRateLimit` / `onSecondaryRateLimit` callbacks
 * are configured with sensible defaults (3 retries on primary rate limit,
 * 5 retries on secondary). The plugin also surfaces `retryCount` in the
 * secondary callback signature since @octokit/plugin-throttling v11 — we
 * use it to bound retries and do not maintain a separate counter.
 */
import { Octokit } from "@octokit/core";
import { throttling } from "@octokit/plugin-throttling";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { retry } from "@octokit/plugin-retry";

import type { GitHubClientConfig } from "./client.ts";

export const ComposedOctokit = Octokit.plugin(throttling, retry, paginateRest);

type ComposedOctokitOptions = ConstructorParameters<typeof ComposedOctokit>[0];

export function createOctokit(config: GitHubClientConfig): Octokit {
  const opts: ComposedOctokitOptions = {
    auth: config.auth,
    userAgent: config.userAgent ?? "agents-studio",
    request: { timeout: config.requestTimeoutMs ?? 10_000 },
    throttle: {
      enabled: config.throttling !== false,
      onRateLimit: (
        _retryAfter: number,
        _options: unknown,
        _octokit: unknown,
        retryCount: number,
      ): boolean => retryCount < 3,
      onSecondaryRateLimit: (
        _retryAfter: number,
        _options: unknown,
        _octokit: unknown,
        retryCount?: number,
      ): boolean => (retryCount ?? 0) < 5,
    },
    retry: {
      enabled: config.retry?.enabled !== false,
      retries: config.retry?.maxRetries ?? 3,
    },
  };
  if (config.baseUrl !== undefined) {
    opts.baseUrl = config.baseUrl;
  }
  return new ComposedOctokit(opts);
}
