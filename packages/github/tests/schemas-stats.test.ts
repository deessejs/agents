/**
 * Tests for `CommitActivitySchema` (the stats schema).
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { CommitActivitySchema } from "../src/api/stats.ts";

const baseWeek = {
  week: 1_726_800_000,
  total: 42,
  days: [0, 5, 8, 2, 12, 10, 5],
} as const;

describe("CommitActivitySchema", () => {
  it("parses a fully-populated week", () => {
    const parsed = CommitActivitySchema.parse(baseWeek);
    expect(parsed.total).toBe(42);
    expect(parsed.days).toHaveLength(7);
  });

  it("keeps unknown fields (passthrough mode — live API response)", () => {
    const data = { ...baseWeek, extra: "field" };
    const parsed = CommitActivitySchema.parse(data);
    expect(parsed.extra).toBe("field");
  });

  it("rejects negative week timestamps", () => {
    const data = { ...baseWeek, week: -1 };
    expect(() => CommitActivitySchema.parse(data)).toThrow(ZodError);
  });

  it("rejects negative total counts", () => {
    const data = { ...baseWeek, total: -1 };
    expect(() => CommitActivitySchema.parse(data)).toThrow(ZodError);
  });

  it("rejects days array with negative counts", () => {
    const data = { ...baseWeek, days: [0, -1, 0, 0, 0, 0, 0] };
    expect(() => CommitActivitySchema.parse(data)).toThrow(ZodError);
  });

  it("rejects days array of length != 7", () => {
    const data = { ...baseWeek, days: [1, 2, 3] };
    expect(() => CommitActivitySchema.parse(data)).toThrow(ZodError);
  });

  it("rejects an empty payload (all required keys missing)", () => {
    expect(() => CommitActivitySchema.parse({})).toThrow(ZodError);
  });
});
