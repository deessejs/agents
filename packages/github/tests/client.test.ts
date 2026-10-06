/**
 * Tests for the `createGitHubClient` factory.
 *
 * The throttling and retry plugins are verified by mocking the
 * `@octokit/core`, `@octokit/plugin-throttling`, `@octokit/plugin-retry`
 * and `@octokit/plugin-paginate-rest` modules and asserting that each
 * plugin's exported function is called exactly once during `Octokit.plugin(...)`.
 */
import { describe, expect, it, vi } from "vitest";

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

describe("createGitHubClient", () => {
  it("creates a client with a raw Octokit", () => {
    const gh = createGitHubClient({ auth: "ghp_test_token" });

    expect(gh.raw).toBeDefined();
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
    throttlingSpy.mockClear();
    createGitHubClient({ auth: "ghp_test_token", throttling: true });
    expect(throttlingSpy).toHaveBeenCalledTimes(1);
  });

  it("registers the retry plugin exactly once", () => {
    retrySpy.mockClear();
    createGitHubClient({ auth: "ghp_test_token" });
    expect(retrySpy).toHaveBeenCalledTimes(1);
  });

  it("registers the paginate-rest plugin exactly once", () => {
    paginateRestSpy.mockClear();
    createGitHubClient({ auth: "ghp_test_token" });
    expect(paginateRestSpy).toHaveBeenCalledTimes(1);
  });
});
