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
} from "./client.js";

export {
  defaultThrottleHandlers,
  type ThrottleHandlers,
  type RateLimitHandler,
  type SecondaryRateLimitHandler,
} from "./throttle.js";

export { paginateAll, type PaginateAllOptions } from "./pagination.js";
