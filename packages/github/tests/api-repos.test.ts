/**
 * Tests for the `repos` API helpers.
 */
import { describe, expect, it } from "vitest";

import { getOrgRepos, getRepo } from "../src/api/repos.ts";
import { makeFakeOctokit, mockRequest } from "./helpers/fake-octokit.ts";

const sampleRepo = {
  id: 100,
  name: "agents",
  full_name: "octocat/agents",
  private: false,
  html_url: "https://github.com/octocat/agents",
  default_branch: "main",
  owner: {
    login: "octocat",
    id: 1,
    avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
    html_url: "https://github.com/octocat",
    type: "User",
  },
} as const;

describe("getOrgRepos", () => {
  it("returns parsed repos from the org endpoint", async () => {
    const { octokit } = makeFakeOctokit([sampleRepo as unknown as Record<string, unknown>]);
    const repos = await getOrgRepos(octokit, { org: "octocat" });
    expect(repos).toHaveLength(1);
    expect(repos[0]?.name).toBe("agents");
    expect(repos[0]?.owner.login).toBe("octocat");
  });

  it("returns [] when no repos match", async () => {
    const { octokit } = makeFakeOctokit([]);
    const repos = await getOrgRepos(octokit, { org: "octocat" });
    expect(repos).toEqual([]);
  });

  it("forwards the `type` parameter to the org endpoint", async () => {
    // Exercise all six enum members of the `type` option.
    const types = ["all", "public", "private", "forks", "sources", "member"] as const;
    await Promise.all(
      types.map(async (type) => {
        const { octokit, iteratorSpy } = makeFakeOctokit([
          sampleRepo as unknown as Record<string, unknown>,
        ]);
        await getOrgRepos(octokit, { org: "octocat", type });
        expect(iteratorSpy).toHaveBeenCalledWith(
          "GET /orgs/{org}/repos",
          expect.objectContaining({ org: "octocat", type }),
        );
      }),
    );
  });

  it("defaults the `type` parameter to 'all' when none is supplied", async () => {
    const { octokit, iteratorSpy } = makeFakeOctokit([
      sampleRepo as unknown as Record<string, unknown>,
    ]);
    await getOrgRepos(octokit, { org: "octocat" });
    expect(iteratorSpy).toHaveBeenCalledWith(
      "GET /orgs/{org}/repos",
      expect.objectContaining({ type: "all" }),
    );
  });
});

describe("getRepo", () => {
  it("returns a parsed repo for the given owner/name", async () => {
    const { octokit, requestSpy } = makeFakeOctokit();
    mockRequest(requestSpy, { data: sampleRepo });
    const repo = await getRepo(octokit, { owner: "octocat", repo: "agents" });
    expect(repo.id).toBe(100);
    expect(repo.full_name).toBe("octocat/agents");
  });
});
