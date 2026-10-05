/**
 * Tests for `IssueSchema`.
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { IssueSchema, type Issue } from "../src/schemas/issue.ts";

const baseIssue = {
  id: 1000,
  number: 101,
  title: "Bug in ad-hoc HTTP client",
  body: "Steps to reproduce...",
  state: "open" as const,
  state_reason: null,
  user: {
    login: "octocat",
    id: 1,
    avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
    html_url: "https://github.com/octocat",
    type: "User" as const,
  },
  labels: [
    {
      id: 8,
      name: "bug",
      color: "d73a4a",
      description: "Something isn't working",
      default: true,
    },
  ],
  assignees: [
    {
      login: "monalisa",
      id: 2,
      avatar_url: "https://avatars.githubusercontent.com/u/2?v=4",
      html_url: "https://github.com/monalisa",
      type: "User" as const,
    },
  ],
  comments: 5,
  created_at: "2026-10-04T10:00:00Z",
  updated_at: "2026-10-04T10:30:00Z",
  closed_at: null,
  html_url: "https://github.com/octocat/agents/issues/101",
} satisfies Issue;

const issueWithEmptyAssignees = {
  ...baseIssue,
  id: 1001,
  number: 102,
  title: "Feature request: batch imports",
  body: null,
  state: "closed" as const,
  state_reason: "completed",
  user: {
    login: "hubot",
    id: 3,
    avatar_url: "https://avatars.githubusercontent.com/u/3?v=4",
    html_url: "https://github.com/hubot",
    type: "User" as const,
  },
  labels: [],
  assignees: [],
  comments: 2,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-15T10:00:00Z",
  closed_at: "2026-09-15T10:00:00Z",
} satisfies Issue;

const issueNotPlanned = {
  ...baseIssue,
  id: 1002,
  number: 99,
  title: "Duplicate of #101 — ignoring",
  body: "Duplicate of the bug.",
  state: "closed" as const,
  state_reason: "not_planned",
  labels: [
    {
      id: 9,
      name: "duplicate",
      color: "cfd3d7",
      description: null,
      default: false,
    },
  ],
  assignees: [],
  comments: 0,
  created_at: "2026-08-01T10:00:00Z",
  updated_at: "2026-08-02T10:00:00Z",
  closed_at: "2026-08-02T10:00:00Z",
} satisfies Issue;

describe("IssueSchema", () => {
  it("parses the issue fixture", () => {
    expect(() => IssueSchema.parse(baseIssue)).not.toThrow();
  });

  it("accepts nullable body", () => {
    const data = { ...baseIssue, body: null };
    const parsed = IssueSchema.parse(data);
    expect(parsed.body).toBeNull();
  });

  it("keeps unknown fields (passthrough mode — live API response)", () => {
    // Live GitHub API responses add new fields regularly; the schema
    // uses `.passthrough()` so downstream code can read them via the
    // typed object without a schema bump.
    const data = { ...baseIssue, suspicious_field: true };
    const parsed = IssueSchema.parse(data);
    expect(parsed.suspicious_field).toBe(true);
  });

  it("rejects invalid state", () => {
    const data = { ...baseIssue, state: "paused" };
    expect(() => IssueSchema.parse(data)).toThrow(ZodError);
  });

  it("accepts empty assignees", () => {
    const parsed = IssueSchema.parse(issueWithEmptyAssignees);
    expect(parsed.assignees).toEqual([]);
  });

  it("accepts null state_reason", () => {
    const parsed = IssueSchema.parse(baseIssue);
    expect(parsed.state_reason).toBeNull();
  });

  it("accepts valid state_reason enum", () => {
    const parsed1 = IssueSchema.parse(issueWithEmptyAssignees);
    expect(parsed1.state_reason).toBe("completed");

    const parsed2 = IssueSchema.parse(issueNotPlanned);
    expect(parsed2.state_reason).toBe("not_planned");
  });

  it("rejects negative comments", () => {
    // The schema is `.int().nonnegative()` — comment counts are never
    // negative. Surface a ZodError so a malformed payload never reaches
    // callers that assume the count is non-negative.
    const data = { ...baseIssue, comments: -1 };
    expect(() => IssueSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects an empty payload (all required keys missing)", () => {
    expect(() => IssueSchema.parse({})).toThrow(ZodError);
  });
});
