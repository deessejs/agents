/**
 * Tests for `RepoSchema`.
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { RepoSchema, type Repo } from "../src/schemas/repo.ts";

const baseRepo = {
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
    type: "User" as const,
  },
} satisfies Repo;

describe("RepoSchema", () => {
  it("parses a fully-populated repo", () => {
    const parsed = RepoSchema.parse(baseRepo);
    expect(parsed.full_name).toBe("octocat/agents");
    expect(parsed.owner.login).toBe("octocat");
    expect(parsed.private).toBe(false);
  });

  it("keeps unknown fields (passthrough mode — live API response)", () => {
    const data = { ...baseRepo, topics: ["typescript", "octokit"] };
    const parsed = RepoSchema.parse(data);
    expect(parsed.topics).toEqual(["typescript", "octokit"]);
  });

  it("rejects a default_branch containing `..`", () => {
    const data = { ...baseRepo, default_branch: "feature/../escape" };
    expect(() => RepoSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects a default_branch containing refspec metacharacters", () => {
    for (const char of ["~", "^", ":", "?", "*", "\\"]) {
      const data = { ...baseRepo, default_branch: `feature${char}x` };
      expect(() => RepoSchema.parse(data)).toThrow(ZodError);
    }
  });

  it("rejects an over-long default_branch (256+ chars)", () => {
    const data = { ...baseRepo, default_branch: "a".repeat(256) };
    expect(() => RepoSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects an html_url on an unrelated hostname", () => {
    const data = { ...baseRepo, html_url: "https://evil.com/agents" };
    expect(() => RepoSchema.parse(data)).toThrow(/html_url|github\.com/);
  });

  it("rejects an empty payload (all required keys missing)", () => {
    expect(() => RepoSchema.parse({})).toThrow(ZodError);
  });
});
