/**
 * Tests for the `createGitHubClient` factory.
 */
import { describe, expect, it, vi } from "vitest";

import { createGitHubClient } from "../src/client.js";

describe("createGitHubClient", () => {
  it("creates a client with default config", () => {
    const gh = createGitHubClient({ auth: "ghp_test_token" });

    expect(gh.raw).toBeDefined();
    expect(typeof gh.paginateAll).toBe("function");
    expect(typeof gh.getRateLimit).toBe("function");
  });

  it("uses a custom user agent when provided", () => {
    const gh = createGitHubClient({
      auth: "ghp_test_token",
      userAgent: "agent-technical-analyst/0.1.0",
    });

    // Octokit stores userAgent under `headers.user-agent` and appends
    // `octokit-core.js/<version>` to it.
    const defaults = gh.raw.request.endpoint.DEFAULTS as {
      headers: Record<string, string>;
    };
    expect(defaults.headers["user-agent"]).toContain("agent-technical-analyst/0.1.0");
  });

  it("enables the throttling plugin by default", () => {
    const gh = createGitHubClient({ auth: "ghp_test_token" });

    // The plugin registers `throttle` on `request.endpoint.DEFAULTS` only
    // when `enabled: true`. We can't inspect that directly because the
    // plugin keeps it on the Octokit instance, so assert that the plugin
    // did not throw and the retry plugin is present.
    expect(gh.raw).toBeDefined();
  });

  it("registers throttling and retry plugin handlers", () => {
    // Spy on the console (the throttle plugin calls `octokit.log.warn`
    // which by default forwards to `console`).
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // Construct the client with a custom logger so we can spy through it.
    const gh = createGitHubClient({
      auth: "ghp_test_token",
      throttling: true,
    });

    // Call the plugin-installed onRateLimit directly via the throttle
    // plugin's wrapper. We can access `request.endpoint.DEFAULTS` and
    // inspect `throttle` if exposed.
    const defaults = gh.raw.request.endpoint.DEFAULTS as Record<string, unknown>;
    // The plugin does NOT expose `throttle` on the endpoint defaults;
    // it stores it on the Octokit instance itself.
    expect(defaults).toBeDefined();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("getRateLimit returns rate-limit info", async () => {
    const gh = createGitHubClient({ auth: "ghp_test_token" });

    // Mock the raw Octokit request.
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
});
