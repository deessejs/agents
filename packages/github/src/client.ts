/**
 * Public client factory + types for `@workspace/github`.
 *
 * Use `createGitHubClient({ auth })` to get a configured Octokit with
 * throttling, retry, and pagination plugins applied. The returned
 * `GitHubClient` exposes a typed `paginateAll` and a `getRateLimit`
 * convenience method.
 */
import type { Octokit } from "@octokit/core";
import type { RequestParameters, Route } from "@octokit/types";

import { createOctokit } from "./octokit.ts";
import { paginateAll as paginateAllImpl } from "./pagination.ts";

export interface GitHubClientConfig {
  /** Fine-grained PAT or GitHub App token. */
  auth: string;
  /** Enable primary/secondary rate limit handling. Default: `true`. */
  throttling?: boolean;
  /** User-Agent header. Default: `"agents-studio"`. */
  userAgent?: string;
  /** API base URL. Default: `"https://api.github.com"`. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default: 10 000. */
  requestTimeoutMs?: number;
  /** Retry configuration. */
  retry?: {
    /** Toggle the retry plugin. Default: `true`. */
    enabled?: boolean;
    /** Maximum number of retries for transient errors. Default: 3. */
    maxRetries?: number;
  };
}

export interface RateLimitInfo {
  remaining: number;
  /** ISO date when the limit window resets. */
  reset: Date;
  limit: number;
}

export interface GitHubClient {
  /** Underlying Octokit instance — for endpoints not covered by helpers. */
  readonly raw: Octokit;
  /**
   * Walk every page of a paginated response and return a flat array.
   * Generic in the page-item type for full type safety.
   */
  paginateAll: <T>(
    route: Route,
    params?: RequestParameters,
    opts?: { max?: number },
  ) => Promise<T[]>;
  /** Fetch the current primary rate-limit state. */
  getRateLimit(): Promise<RateLimitInfo>;
}

/**
 * Module-private: read the primary rate-limit bucket from
 * `GET /rate_limit`. The endpoint requires no permissions and is safe
 * to poll.
 */
async function getRateLimitImpl(octokit: Octokit): Promise<RateLimitInfo> {
  const response = await octokit.request("GET /rate_limit", {});
  const data = response.data as {
    resources?: { core?: { remaining: number; reset: number; limit: number } };
  };
  const core = data.resources?.core;
  if (!core) throw new Error("getRateLimit: malformed response (no resources.core)");
  return {
    remaining: core.remaining,
    reset: new Date(core.reset * 1000),
    limit: core.limit,
  };
}

/**
 * Build a `GitHubClient` configured with throttling, retry, and pagination.
 *
 * @example
 * ```ts
 * const gh = createGitHubClient({ auth: process.env.GITHUB_TOKEN! });
 * const prs = await gh.paginateAll<PullRequest>("GET /repos/{owner}/{repo}/pulls", {
 *   owner: "octocat",
 *   repo:  "hello",
 * });
 * ```
 */
export function createGitHubClient(config: GitHubClientConfig): GitHubClient {
  const raw = createOctokit(config);

  return {
    raw,
    paginateAll: <T>(route: Route, params?: RequestParameters, opts?: { max?: number }) =>
      paginateAllImpl<T>(raw, route, params, opts),
    getRateLimit: () => getRateLimitImpl(raw),
  };
}

export type { Octokit } from "@octokit/core";
