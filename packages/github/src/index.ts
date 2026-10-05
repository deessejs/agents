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

export { paginateAll, type PaginateAllOptions } from "./pagination.ts";
