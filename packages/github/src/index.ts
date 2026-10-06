/**
 * Public entry point for `@workspace/github`.
 *
 * Consumers use `createGitHubClient({ auth })` to get a configured
 * Octokit with throttling, retry, and pagination plugins applied.
 * The returned `GitHubClient` exposes a typed `paginateAll` and a
 * `getRateLimit` convenience method.
 */
export {
  createGitHubClient,
  type GitHubClient,
  type GitHubClientConfig,
  type RateLimitInfo,
} from "./client.ts";

// Note: `paginateAll` and `PaginateAllOptions` are intentionally NOT
// re-exported here. The public pagination surface is
// `gh.paginateAll(route, params?, opts?)` on the GitHubClient.
