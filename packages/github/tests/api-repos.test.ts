/**
 * Tests for the `repos` API helpers.
 */
import { describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/core";

import { getOrgRepos, getRepo } from "../src/api/repos.ts";

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
    const octokit = fakeOctokit([[sampleRepo]]);
    const repos = await getOrgRepos(octokit, { org: "octocat" });
    expect(repos).toHaveLength(1);
    expect(repos[0]?.name).toBe("agents");
    expect(repos[0]?.owner.login).toBe("octocat");
  });

  it("returns [] when no repos match", async () => {
    const octokit = fakeOctokit([[]]);
    const repos = await getOrgRepos(octokit, { org: "octocat" });
    expect(repos).toEqual([]);
  });
});

describe("getRepo", () => {
  it("returns a parsed repo for the given owner/name", async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: sampleRepo }),
    } as unknown as Octokit;
    const repo = await getRepo(octokit, { owner: "octocat", repo: "agents" });
    expect(repo.id).toBe(100);
    expect(repo.full_name).toBe("octocat/agents");
  });
});
