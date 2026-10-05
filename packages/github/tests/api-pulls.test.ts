/**
 * Tests for the `pulls` API helpers.
 */
import { describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/core";

import { getMergedPRs, getOpenPRs } from "../src/api/pulls.js";
import pullRequestsFixture from "./fixtures/pull-requests.json";

interface FakePage<T> {
  data: T[];
}

function fakeOctokit(pages: unknown[][]): {
  octokit: Octokit;
  iteratorSpy: ReturnType<typeof vi.fn>;
} {
  const iteratorSpy = vi.fn(async function* () {
    for (const page of pages) {
      yield { data: page } as FakePage<unknown>;
    }
  });
  const octokit = {
    paginate: { iterator: iteratorSpy },
    request: vi.fn(),
  } as unknown as Octokit;
  return { octokit, iteratorSpy };
}

describe("getMergedPRs", () => {
  it("returns parsed PRs from the search endpoint", async () => {
    const { octokit } = fakeOctokit([pullRequestsFixture]);

    const prs = await getMergedPRs(octokit, {
      org: "octocat",
      since: "2026-09-01T00:00:00Z",
    });

    expect(prs).toHaveLength(2);
    expect(prs[0]?.number).toBe(42);
    expect(prs[0]?.title).toContain("rate-limit");
    expect(prs[0]?.labels[0]?.name).toBe("enhancement");
  });

  it("uses the search route when no repo is provided", async () => {
    const { octokit, iteratorSpy } = fakeOctokit([pullRequestsFixture]);
    await getMergedPRs(octokit, {
      org: "octocat",
      since: "2026-09-01T00:00:00Z",
    });
    expect(iteratorSpy).toHaveBeenCalledWith(
      "GET /search/issues",
      expect.objectContaining({ q: expect.stringContaining("is:merged") }),
    );
  });

  it("uses the repo-scoped pulls route when repo is provided", async () => {
    const { octokit, iteratorSpy } = fakeOctokit([pullRequestsFixture]);
    await getMergedPRs(octokit, {
      org: "octocat",
      repo: "agents",
      since: "2026-09-01T00:00:00Z",
    });
    // The repo-scoped endpoint path must be the pulls route, not the
    // search route — this is the fix for the prior weak assertion.
    expect(iteratorSpy).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/pulls",
      expect.objectContaining({ owner: "octocat", repo: "agents" }),
    );
  });

  it("applies the author filter via the search query", async () => {
    const { octokit, iteratorSpy } = fakeOctokit([pullRequestsFixture]);
    await getMergedPRs(octokit, {
      org: "octocat",
      author: "hubot",
      since: "2026-09-01T00:00:00Z",
    });
    const [, params] = iteratorSpy.mock.calls[0] as [string, { q: string }];
    expect(params.q).toContain("author:hubot");
  });

  it("returns [] when the search returns no results", async () => {
    const { octokit } = fakeOctokit([[]]);
    const prs = await getMergedPRs(octokit, {
      org: "octocat",
      since: "2020-01-01T00:00:00Z",
    });
    expect(prs).toEqual([]);
  });
});

describe("getOpenPRs", () => {
  it("returns open PRs from the repo endpoint", async () => {
    const { octokit } = fakeOctokit([pullRequestsFixture]);
    const prs = await getOpenPRs(octokit, {
      org: "octocat",
      repo: "agents",
    });
    expect(prs).toHaveLength(2);
    expect(prs.every((p) => p.state === "open" || p.state === "closed")).toBe(true);
  });

  it("applies the author filter via the search query", async () => {
    const { octokit, iteratorSpy } = fakeOctokit([pullRequestsFixture]);
    await getOpenPRs(octokit, {
      org: "octocat",
      author: "hubot",
    });
    const [, params] = iteratorSpy.mock.calls[0] as [string, { q: string }];
    expect(params.q).toContain("author:hubot");
  });
});
