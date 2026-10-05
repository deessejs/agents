/**
 * Tests for the `releases` API helpers.
 */
import { describe, expect, it } from "vitest";

import { getReleases, getLatestRelease } from "../src/api/releases.ts";
import { type Release } from "../src/schemas/release.ts";
import { makeFakeOctokit, mockRequest } from "./helpers/fake-octokit.ts";

const sampleRelease: Release = {
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
};

describe("getReleases", () => {
  it("returns parsed releases from the repo endpoint", async () => {
    const { octokit } = makeFakeOctokit([sampleRelease]);
    const releases = await getReleases(octokit, {
      owner: "octocat",
      repo: "agents",
    });
    expect(releases).toHaveLength(1);
    expect(releases[0]?.tag_name).toBe("v1.2.3");
  });

  it("returns [] when no releases are found", async () => {
    const { octokit } = makeFakeOctokit([]);
    const releases = await getReleases(octokit, { owner: "octocat", repo: "agents" });
    expect(releases).toEqual([]);
  });

  it("uses the releases endpoint with the expected params", async () => {
    const { octokit, iteratorSpy } = makeFakeOctokit([sampleRelease]);
    await getReleases(octokit, { owner: "octocat", repo: "agents" });
    expect(iteratorSpy).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/releases",
      expect.objectContaining({ owner: "octocat", repo: "agents" }),
    );
  });
});

describe("getLatestRelease", () => {
  it("returns the latest release", async () => {
    const { octokit, requestSpy } = makeFakeOctokit();
    mockRequest(requestSpy, { data: sampleRelease });
    const release = await getLatestRelease(octokit, { owner: "octocat", repo: "agents" });
    expect(release.tag_name).toBe("v1.2.3");
    expect(release.author.login).toBe("octocat");
  });
});
