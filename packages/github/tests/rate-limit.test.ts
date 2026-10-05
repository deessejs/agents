/**
 * Tests for `getRateLimit`.
 */
import { describe, expect, it, vi } from "vitest";
import type { OctokitResponse } from "@octokit/types";

import { createGitHubClient } from "../src/client.ts";
import type { MockOctokitResponse } from "./helpers/fake-octokit.ts";

/**
 * Build an `OctokitResponse`-shaped mock for `vi.spyOn(...).mockResolvedValue`.
 * Mirrors the same helper used by `client.test.ts` so the cast surface is
 * contained to one builder rather than `as never` scattered everywhere.
 */
function buildResponse<T>(payload: MockOctokitResponse<T>): OctokitResponse<T> {
  return payload as OctokitResponse<T>;
}

describe("getRateLimit", () => {
  it("returns parsed rate-limit info", async () => {
    const gh = createGitHubClient({ auth: "ghp_test_token" });

    vi.spyOn(gh.raw, "request").mockResolvedValue(
      buildResponse({
        status: 200,
        url: "https://api.github.com/rate_limit",
        headers: {},
        data: {
          resources: {
            core: {
              limit: 5000,
              used: 100,
              remaining: 4900,
              reset: 1_726_800_000,
            },
            search: {
              limit: 30,
              used: 0,
              remaining: 30,
              reset: 1_726_800_000,
            },
          },
          rate: {
            limit: 5000,
            used: 100,
            remaining: 4900,
            reset: 1_726_800_000,
          },
        },
      }),
    );

    const info = await gh.getRateLimit();
    expect(info.limit).toBe(5000);
    expect(info.remaining).toBe(4900);
    expect(info.reset).toBeInstanceOf(Date);
    expect(info.reset.getTime()).toBe(1_726_800_000 * 1000);
  });

  it("throws when the response is malformed", async () => {
    const gh = createGitHubClient({ auth: "ghp_test_token" });
    vi.spyOn(gh.raw, "request").mockResolvedValue(
      buildResponse({
        status: 200,
        url: "https://api.github.com/rate_limit",
        headers: {},
        // Missing the `rate` field — Zod must reject.
        data: { resources: { core: {} } },
      }),
    );

    await expect(gh.getRateLimit()).rejects.toThrow(/RateLimitResponse|rate|Invalid/);
  });
});
