/**
 * Tests for `IssueSchema`.
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { IssueSchema, type Issue } from "../src/schemas/issue.ts";
import issuesFixture from "./fixtures/issues.json";

describe("IssueSchema", () => {
  it("parses the issue fixture", () => {
    const data: Issue = issuesFixture[0];
    expect(() => IssueSchema.parse(data)).not.toThrow();
  });

  it("accepts nullable body", () => {
    const data: Issue = { ...issuesFixture[0], body: null };
    const parsed = IssueSchema.parse(data);
    expect(parsed.body).toBeNull();
  });

  it("keeps unknown fields (passthrough mode — live API response)", () => {
    // Live GitHub API responses add new fields regularly; the schema
    // uses `.passthrough()` so downstream code can read them via the
    // typed object without a schema bump.
    const data = { ...issuesFixture[0], suspicious_field: true };
    const parsed = IssueSchema.parse(data);
    expect(parsed.suspicious_field).toBe(true);
  });

  it("rejects invalid state", () => {
    const data = { ...issuesFixture[0], state: "paused" };
    expect(() => IssueSchema.parse(data)).toThrow(ZodError);
  });

  it("accepts empty assignees", () => {
    const data: Issue = issuesFixture[1];
    const parsed = IssueSchema.parse(data);
    expect(parsed.assignees).toEqual([]);
  });

  it("accepts null state_reason", () => {
    const data: Issue = issuesFixture[0];
    const parsed = IssueSchema.parse(data);
    expect(parsed.state_reason).toBeNull();
  });

  it("accepts valid state_reason enum", () => {
    const data1: Issue = issuesFixture[1];
    const parsed1 = IssueSchema.parse(data1);
    expect(parsed1.state_reason).toBe("completed");

    const data2: Issue = issuesFixture[2];
    const parsed2 = IssueSchema.parse(data2);
    expect(parsed2.state_reason).toBe("not_planned");
  });

  it("rejects an empty payload (all required keys missing)", () => {
    expect(() => IssueSchema.parse({})).toThrow(ZodError);
  });
});
