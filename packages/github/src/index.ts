/**
 * Public entry point for `@workspace/github`.
 *
 * Consumers typically only need `createGitHubClient`. Domain-specific
 * helpers live under subpath exports (`@workspace/github/api/pulls`,
 * etc.) and Zod schemas under `@workspace/github/schemas/*`.
 */
export {
  createGitHubClient,
  type GitHubClient,
  type GitHubClientConfig,
  type RateLimitInfo,
} from "./client.ts";

export {
  defaultThrottleHandlers,
  type ThrottleHandlers,
  type RateLimitHandler,
  type SecondaryRateLimitHandler,
} from "./throttle.ts";

// Note: `paginateAll` and `PaginateAllOptions` are intentionally NOT
// re-exported here. They are an internal implementation detail used by
// the `api/*` helpers. The public pagination surface is
// `gh.paginateAll(route, params?, opts?)` on the GitHubClient.
