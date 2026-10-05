/**
 * Tests for the `pulls` API helpers.
 */
import { describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/core";

import { getMergedPRs, getOpenPRs } from "../src/api/pulls.js";
import pullRequestsFixture from "./fixtures/pull-requests.json";

function fakeOctokit(pages: unknown[][]): Octokit {
  const iterator = (async function* () {
    for (const page of pages) {
      yield { data: page } as never;
    }
  })();

  return {
    paginate: { iterator: () => iterator },
    request: vi.fn(),
  } as unknown as Octokit;
}

describe("getMergedPRs", () => {
  it("returns parsed PRs from the search endpoint", async () => {
    const octokit = fakeOctokit([pullRequestsFixture]);

    const prs = await getMergedPRs(octokit, {
      org: "octocat",
      since: "2026-09-01T00:00:00Z",
    });

    expect(prs).toHaveLength(2);
    expect(prs[0]?.number).toBe(42);
    expect(prs[0]?.title).toContain("rate-limit");
    expect(prs[0]?.labels[0]?.name).toBe("enhancement");
  });

  it("returns [] when the search returns no results", async () => {
    const octokit = fakeOctokit([[]]);
    const prs = await getMergedPRs(octokit, {
      org: "octocat",
      since: "2020-01-01T00:00:00Z",
    });
    expect(prs).toEqual([]);
  });

  it("uses repo-scoped endpoint when repo is provided", async () => {
    const octokit = fakeOctokit([pullRequestsFixture]);

    const prs = await getMergedPRs(octokit, {
      org: "octocat",
      repo: "agents",
      since: "2026-09-01T00:00:00Z",
    });

    expect(prs).toHaveLength(2);
    expect(prs[1]?.state).toBe("open");
    expect(prs[1]?.draft).toBe(true);
  });
});

describe("getOpenPRs", () => {
  it("returns open PRs", async () => {
    const octokit = fakeOctokit([pullRequestsFixture]);
    const prs = await getOpenPRs(octokit, {
      org: "octocat",
      repo: "agents",
    });
    expect(prs).toHaveLength(2);
    expect(prs.every((p) => p.state === "open" || p.state === "closed")).toBe(true);
  });
});
