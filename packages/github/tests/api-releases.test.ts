/**
 * Tests for the `releases` API helpers.
 */
import { describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/core";

import { getReleases, getLatestRelease } from "../src/api/releases.ts";

interface FakePage<T> {
  data: T[];
}

function fakeOctokit(pages: unknown[][]): Octokit {
  const iterator = (async function* () {
    for (const page of pages) {
      yield { data: page } as FakePage<unknown>;
    }
  })();
  return {
    paginate: { iterator: () => iterator },
    request: vi.fn(),
  } as unknown as Octokit;
}

const sampleRelease = {
  id: 9001,
  tag_name: "v1.2.3",
  name: "Release 1.2.3",
  body: "Notes",
  draft: false,
  prerelease: false,
  created_at: "2026-10-04T10:00:00Z",
  published_at: "2026-10-04T10:05:00Z",
  html_url: "https://github.com/octocat/agents/releases/tag/v1.2.3",
  author: {
    login: "octocat",
    id: 1,
    avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
    html_url: "https://github.com/octocat",
    type: "User",
  },
} as const;

describe("getReleases", () => {
  it("returns parsed releases from the repo endpoint", async () => {
    const octokit = fakeOctokit([[sampleRelease]]);
    const releases = await getReleases(octokit, {
      owner: "octocat",
      repo: "agents",
    });
    expect(releases).toHaveLength(1);
    expect(releases[0]?.tag_name).toBe("v1.2.3");
  });

  it("returns [] when no releases are found", async () => {
    const octokit = fakeOctokit([[]]);
    const releases = await getReleases(octokit, { owner: "octocat", repo: "agents" });
    expect(releases).toEqual([]);
  });
});

describe("getLatestRelease", () => {
  it("returns the latest release", async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: sampleRelease }),
    } as unknown as Octokit;
    const release = await getLatestRelease(octokit, { owner: "octocat", repo: "agents" });
    expect(release.tag_name).toBe("v1.2.3");
    expect(release.author.login).toBe("octocat");
  });
});
