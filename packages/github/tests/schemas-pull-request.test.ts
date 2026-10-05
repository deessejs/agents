/**
 * Tests for `PullRequestSchema`.
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { PullRequestSchema, type PullRequest } from "../src/schemas/pull-request.js";
import pullRequestsFixture from "./fixtures/pull-requests.json";

describe("PullRequestSchema", () => {
  it("parses a fully-populated fixture", () => {
    const merged = pullRequestsFixture[0] as PullRequest;
    expect(() => PullRequestSchema.parse(merged)).not.toThrow();
  });

  it("accepts nullable fields (body, user, additions)", () => {
    const draft = pullRequestsFixture[1] as PullRequest;
    const parsed = PullRequestSchema.parse(draft);

    expect(parsed.body).toBeNull();
    expect(parsed.user).toBeNull();
    expect(parsed.additions).toBeNull();
    expect(parsed.merged_at).toBeNull();
  });

  it("rejects unknown fields (strict mode)", () => {
    const data = { ...pullRequestsFixture[0], extra_field: "nope" };
    expect(() => PullRequestSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects invalid state values", () => {
    const data = { ...pullRequestsFixture[0], state: "weird" };
    expect(() => PullRequestSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects missing number", () => {
    const { number, ...rest } = pullRequestsFixture[0] as Record<string, unknown>;
    void number;
    expect(() => PullRequestSchema.parse(rest)).toThrow(ZodError);
  });

  it("rejects malformed label color (not 6-char hex)", () => {
    const data = {
      ...pullRequestsFixture[0],
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
});
