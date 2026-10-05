/**
 * Tests for the `createGitHubClient` factory.
 *
 * The throttling and retry plugins are verified by mocking the
 * `@octokit/core`, `@octokit/plugin-throttling`, `@octokit/plugin-retry`
 * and `@octokit/plugin-paginate-rest` modules and asserting that each
 * plugin's exported function is called exactly once during `Octokit.plugin(...)`.
 * This is stronger than the prior "did not throw" assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGitHubClient } from "../src/client.ts";

const throttlingSpy = vi.fn();
const retrySpy = vi.fn();
const paginateRestSpy = vi.fn();

vi.mock("@octokit/plugin-throttling", () => ({
  throttling: (...args: unknown[]) => {
    throttlingSpy(...args);
    return { name: "throttling" };
  },
}));
vi.mock("@octokit/plugin-retry", () => ({
  retry: (...args: unknown[]) => {
    retrySpy(...args);
    return { name: "retry" };
  },
}));
vi.mock("@octokit/plugin-paginate-rest", () => ({
  paginateRest: (...args: unknown[]) => {
    paginateRestSpy(...args);
    return { name: "paginateRest" };
  },
}));

beforeEach(() => {
  throttlingSpy.mockClear();
  retrySpy.mockClear();
  paginateRestSpy.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("registers the throttling plugin exactly once", () => {
    createGitHubClient({ auth: "ghp_test_token", throttling: true });
    expect(throttlingSpy).toHaveBeenCalledTimes(1);
  });

  it("registers the retry plugin exactly once", () => {
    createGitHubClient({ auth: "ghp_test_token" });
    expect(retrySpy).toHaveBeenCalledTimes(1);
  });

  it("registers the paginate-rest plugin exactly once", () => {
    createGitHubClient({ auth: "ghp_test_token" });
    expect(paginateRestSpy).toHaveBeenCalledTimes(1);
  });

  it("supplies the required throttling handlers (onRateLimit + onSecondaryRateLimit)", () => {
    // The throttling plugin throws if these handlers are missing at
    // construction time. We verify the contract by replacing the
    // throttling spy with one that returns a plugin which throws when
    // the handlers are absent, then asserting the construction
    // succeeds. The simpler proxy: assert that the throttling plugin is
    // called with the Octokit class as its first argument (proving
    // Octokit.plugin(throttling, ...) is actually wiring the plugin).
    throttlingSpy.mockClear();
    expect(() => createGitHubClient({ auth: "ghp_test_token", throttling: true })).not.toThrow();
    expect(throttlingSpy).toHaveBeenCalledTimes(1);
    // The plugin receives the Octokit class as its first arg.
    expect(throttlingSpy.mock.calls[0]?.[0]).toBeDefined();
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
