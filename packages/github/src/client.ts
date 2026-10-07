/**
 * Public client factory for `@workspace/github`.
 *
 * Use `createGitHubClient({ auth })` to get a configured Octokit with
 * throttling, retry, and pagination plugins applied. The agent
 * accesses the underlying `raw` Octokit directly; no opinionated
 * helper wrappers live on this client for v1.
 */
import type { Octokit } from "@octokit/core";

import { createOctokit } from "./octokit.ts";

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

export interface GitHubClient {
  /** Underlying Octokit instance. */
  readonly raw: Octokit;
}

/**
 * Build a `GitHubClient` configured with throttling, retry, and
 * pagination plugins.
 */
export function createGitHubClient(config: GitHubClientConfig): GitHubClient {
  return { raw: createOctokit(config) };
}

export type { Octokit } from "@octokit/core";
