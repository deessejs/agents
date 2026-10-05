/**
 * Fetch the current primary rate-limit state via `GET /rate_limit`.
 *
 * The endpoint requires no permissions and is safe to poll.
 */
import type { Octokit } from "@octokit/core";

import type { RateLimitInfo } from "./client.ts";
import { RateLimitResponseSchema } from "./schemas/rate-limit.ts";

/**
 * Return the current rate-limit state. Parses the response through the
 * Zod {@link RateLimitResponseSchema} so we get the typed shape back, and
 * converts the unix-seconds `reset` field into a `Date` for callers.
 *
 * @example
 * ```ts
 * const gh = createGitHubClient({ auth: process.env.GITHUB_TOKEN! });
 * const { remaining, reset } = await gh.getRateLimit();
 * if (remaining === 0) console.log("reset at", reset);
 * ```
 */
export async function getRateLimit(octokit: Octokit): Promise<RateLimitInfo> {
  const response = await octokit.request("GET /rate_limit", {});
  const data = RateLimitResponseSchema.parse(response.data);
  return {
    remaining: data.rate.remaining,
    // `reset` is a unix timestamp (seconds); convert to a `Date`.
    reset: new Date(data.rate.reset * 1000),
    limit: data.rate.limit,
  };
}
