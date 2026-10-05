/**
 * Tests for `getRateLimit`.
 */
import { describe, expect, it, vi } from "vitest";

import { createGitHubClient } from "../src/client.ts";

describe("getRateLimit", () => {
  it("returns parsed rate-limit info", async () => {
    const gh = createGitHubClient({ auth: "ghp_test_token" });

    vi.spyOn(gh.raw, "request").mockResolvedValue({
      status: 200,
      url: "https://api.github.com/rate_limit",
      headers: {} as never,
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
    } as never);

    const info = await gh.getRateLimit();
    expect(info.limit).toBe(5000);
    expect(info.remaining).toBe(4900);
    expect(info.reset).toBeInstanceOf(Date);
    expect(info.reset.getTime()).toBe(1_726_800_000 * 1000);
  });

  it("throws when the response is malformed", async () => {
    const gh = createGitHubClient({ auth: "ghp_test_token" });
    vi.spyOn(gh.raw, "request").mockResolvedValue({
      status: 200,
      url: "https://api.github.com/rate_limit",
      headers: {} as never,
      // Missing the `rate` field — Zod must reject.
      data: { resources: { core: {} } },
    } as never);

    await expect(gh.getRateLimit()).rejects.toThrow(/RateLimitResponse|rate|Invalid/);
  });
});
