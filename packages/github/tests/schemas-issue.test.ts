/**
 * Tests for `IssueSchema`.
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { IssueSchema, type Issue } from "../src/schemas/issue.ts";
import issuesFixture from "./fixtures/issues.json";

describe("IssueSchema", () => {
  it("parses the issue fixture", () => {
    expect(() => IssueSchema.parse(issuesFixture[0] as Issue)).not.toThrow();
  });

  it("accepts nullable body", () => {
    const data = { ...issuesFixture[0], body: null } as Issue;
    const parsed = IssueSchema.parse(data);
    expect(parsed.body).toBeNull();
  });

  it("keeps unknown fields (passthrough mode — live API response)", () => {
    // Live GitHub API responses add new fields regularly; the schema
    // uses `.passthrough()` so downstream code can read them via the
    // typed object without a schema bump.
    const data = { ...issuesFixture[0], suspicious_field: true };
    const parsed = IssueSchema.parse(data) as Record<string, unknown>;
    expect(parsed.suspicious_field).toBe(true);
  });

  it("rejects invalid state", () => {
    const data = { ...issuesFixture[0], state: "paused" };
    expect(() => IssueSchema.parse(data)).toThrow(ZodError);
  });

  it("accepts empty assignees", () => {
    const parsed = IssueSchema.parse(issuesFixture[1] as Issue);
    expect(parsed.assignees).toEqual([]);
  });

  it("accepts null state_reason", () => {
    const parsed = IssueSchema.parse(issuesFixture[0] as Issue);
    expect(parsed.state_reason).toBeNull();
  });

  it("accepts valid state_reason enum", () => {
    const parsed = IssueSchema.parse(issuesFixture[1] as Issue);
    expect(parsed.state_reason).toBe("completed");

    const parsed2 = IssueSchema.parse(issuesFixture[2] as Issue);
    expect(parsed2.state_reason).toBe("not_planned");
  });
});
