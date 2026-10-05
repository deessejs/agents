/**
 * Fetch the current primary rate-limit state via `GET /rate_limit`.
 *
 * The endpoint requires no permissions and is safe to poll.
 */
import type { Octokit } from "@octokit/core";
import type { RateLimitInfo } from "./client.js";

interface RateLimitEndpoint {
  resources: {
    core: {
      limit: number;
      used: number;
      remaining: number;
      reset: number;
    };
  };
  rate: {
    limit: number;
    used: number;
    remaining: number;
    reset: number;
  };
}

export async function getRateLimit(octokit: Octokit): Promise<RateLimitInfo> {
  const response = await octokit.request("GET /rate_limit", {});
  const data = response.data as RateLimitEndpoint;
  return {
    remaining: data.rate.remaining,
    // `reset` is a unix timestamp (seconds).
    reset: new Date(data.rate.reset * 1000),
    limit: data.rate.limit,
  };
}
