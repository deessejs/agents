/**
 * Tests for `ReviewSchema`.
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { ReviewSchema, type Review } from "../src/schemas/review.ts";

const baseReview = {
  id: 80,
  user: {
    login: "octocat",
    id: 1,
    avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
    html_url: "https://github.com/octocat",
    type: "User" as const,
  },
  body: "Looks good to me.",
  state: "APPROVED" as const,
  submitted_at: "2026-10-04T10:00:00Z",
  commit_id: "a".repeat(40),
  html_url: "https://github.com/octocat/agents/pull/42#pullrequestreview-80",
} satisfies Review;

describe("ReviewSchema", () => {
  it("parses a fully-populated review", () => {
    const parsed = ReviewSchema.parse(baseReview);
    expect(parsed.state).toBe("APPROVED");
    expect(parsed.commit_id).toHaveLength(40);
    expect(parsed.user?.login).toBe("octocat");
  });

  it("accepts all five state enum members", () => {
    const states = ["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"] as const;
    for (const state of states) {
      const data = { ...baseReview, state };
      const parsed = ReviewSchema.parse(data);
      expect(parsed.state).toBe(state);
    }
  });

  it("rejects an unknown state value", () => {
    const data = { ...baseReview, state: "THUMBS_UP" };
    expect(() => ReviewSchema.parse(data)).toThrow(ZodError);
  });

  it("accepts a nullable user (deleted accounts)", () => {
    const data = { ...baseReview, user: null };
    const parsed = ReviewSchema.parse(data);
    expect(parsed.user).toBeNull();
  });

  it("accepts a nullable body (empty review)", () => {
    const data = { ...baseReview, body: null };
    const parsed = ReviewSchema.parse(data);
    expect(parsed.body).toBeNull();
  });

  it("requires commit_id to be exactly 40 chars", () => {
    const tooShort = { ...baseReview, commit_id: "a".repeat(39) };
    expect(() => ReviewSchema.parse(tooShort)).toThrow(ZodError);

    const tooLong = { ...baseReview, commit_id: "a".repeat(41) };
    expect(() => ReviewSchema.parse(tooLong)).toThrow(ZodError);
  });

  it("rejects a negative id", () => {
    const data = { ...baseReview, id: -1 };
    expect(() => ReviewSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects a body over the 65_536 char max", () => {
    const data = { ...baseReview, body: "x".repeat(65_537) };
    expect(() => ReviewSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects an empty payload (all required keys missing)", () => {
    expect(() => ReviewSchema.parse({})).toThrow(ZodError);
  });
});
