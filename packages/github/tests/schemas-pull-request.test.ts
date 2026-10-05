/**
 * Tests for `PullRequestSchema`.
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { PullRequestSchema, type PullRequest } from "../src/schemas/pull-request.ts";

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
};

const baseUser = {
  login: "octocat",
  id: 1,
  avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
  html_url: "https://github.com/octocat",
  type: "User" as const,
};

const baseRef = {
  label: "octocat:feature/throttling",
  ref: "feature/throttling",
  sha: "abc1234567890abc1234567890abc1234567890a",
  user: baseUser,
  repo: baseRepo,
};

const baseBaseRef = {
  label: "octocat:main",
  ref: "main",
  sha: "def0987654321def0987654321def0987654321d",
  user: baseUser,
  repo: baseRepo,
};

const mergedPR = {
  id: 1000,
  number: 42,
  title: "Add rate-limit handling to GitHub client",
  body: "This PR introduces throttling callbacks for primary and secondary rate limits.",
  state: "closed" as const,
  draft: false,
  merged: true,
  mergeable: true,
  mergeable_state: "clean",
  user: baseUser,
  head: baseRef,
  base: baseBaseRef,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-02T11:00:00Z",
  closed_at: "2026-10-02T11:00:00Z",
  merged_at: "2026-10-02T11:00:00Z",
  merge_commit_sha: "deadbeefcafebabedeadbeefcafebabedeadbeef",
  additions: 120,
  deletions: 30,
  changed_files: 5,
  comments: 3,
  review_comments: 1,
  commits: 2,
  html_url: "https://github.com/octocat/agents/pull/42",
  labels: [
    {
      id: 7,
      name: "enhancement",
      color: "a2eeef",
      description: "New feature or request",
      default: true,
    },
  ],
} satisfies PullRequest;

const draftPR = {
  ...mergedPR,
  id: 1001,
  number: 43,
  title: "WIP: experimental schema exploration",
  body: null,
  state: "open" as const,
  draft: true,
  merged: false,
  mergeable: null,
  mergeable_state: "draft",
  user: null,
  head: {
    label: "octocat:wip/schemas",
    ref: "wip/schemas",
    sha: "f00d01e1f1f1f1f00d01e1f1f1f1f00d01e1f1f1",
    user: null,
    repo: baseRepo,
  },
  base: baseBaseRef,
  created_at: "2026-10-03T09:00:00Z",
  updated_at: "2026-10-03T09:00:00Z",
  closed_at: null,
  merged_at: null,
  merge_commit_sha: null,
  additions: null,
  deletions: null,
  changed_files: null,
  comments: 0,
  review_comments: 0,
  commits: 1,
  html_url: "https://github.com/octocat/agents/pull/43",
  labels: [],
} satisfies PullRequest;

describe("PullRequestSchema", () => {
  it("parses a fully-populated fixture", () => {
    expect(() => PullRequestSchema.parse(mergedPR)).not.toThrow();
  });

  it("accepts nullable fields (body, user, additions)", () => {
    const parsed = PullRequestSchema.parse(draftPR);

    expect(parsed.body).toBeNull();
    expect(parsed.user).toBeNull();
    expect(parsed.additions).toBeNull();
    expect(parsed.merged_at).toBeNull();
  });

  it("keeps unknown fields (passthrough mode — live API response)", () => {
    // Live GitHub API responses add new fields regularly; the schema
    // uses `.passthrough()` so downstream code can read them via the
    // typed object without a schema bump.
    const data = { ...mergedPR, extra_field: "nope" };
    const parsed = PullRequestSchema.parse(data);
    expect(parsed.extra_field).toBe("nope");
  });

  it("rejects invalid state values", () => {
    const data = { ...mergedPR, state: "weird" };
    expect(() => PullRequestSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects missing number", () => {
    const { number, ...rest } = mergedPR;
    void number;
    expect(() => PullRequestSchema.parse(rest)).toThrow(ZodError);
  });

  it("rejects malformed label color (not 6-char hex)", () => {
    const data = {
      ...mergedPR,
      labels: [
        {
          id: 1,
          name: "bad",
          color: "not-a-color",
          description: null,
        },
      ],
    };
    expect(() => PullRequestSchema.parse(data)).toThrow(/color must be/);
  });

  it("rejects negative counters (additions, comments, review_comments, commits)", () => {
    for (const field of [
      "additions",
      "deletions",
      "changed_files",
      "comments",
      "review_comments",
      "commits",
    ] as const) {
      const data = { ...mergedPR, [field]: -1 };
      expect(() => PullRequestSchema.parse(data)).toThrow(ZodError);
    }
  });

  it("rejects a non-hex merge_commit_sha", () => {
    const data = { ...mergedPR, merge_commit_sha: "not-a-sha" };
    expect(() => PullRequestSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects an empty payload (all required keys missing)", () => {
    expect(() => PullRequestSchema.parse({})).toThrow(ZodError);
  });
});
