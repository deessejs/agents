/**
 * Tests for `ActionStepSchema`.
 *
 * `ActionStepSchema` is exported from the package root — verify the
 * dedicated test surface here. Cross-tests for the parent job (which
 * embeds steps) live in `schemas-action-job.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { ActionStepSchema, type ActionStep } from "../src/schemas/action-job.ts";

const baseStep = {
  name: "Set up job",
  status: "completed" as const,
  conclusion: "success",
  number: 1,
  started_at: "2026-10-04T10:00:00Z",
  completed_at: "2026-10-04T10:00:05Z",
} satisfies ActionStep;

describe("ActionStepSchema", () => {
  it("parses a fully-populated step", () => {
    const parsed = ActionStepSchema.parse(baseStep);
    expect(parsed.name).toBe("Set up job");
    expect(parsed.conclusion).toBe("success");
    expect(parsed.number).toBe(1);
  });

  it("accepts all six status enum members", () => {
    const statuses = [
      "queued",
      "in_progress",
      "completed",
      "pending",
      "waiting",
      "skipped",
    ] as const;
    for (const status of statuses) {
      const data = { ...baseStep, status };
      const parsed = ActionStepSchema.parse(data);
      expect(parsed.status).toBe(status);
    }
  });

  it("rejects an unknown status value", () => {
    const data = { ...baseStep, status: "frozen" };
    expect(() => ActionStepSchema.parse(data)).toThrow(ZodError);
  });

  it("accepts a nullable conclusion (in-progress run)", () => {
    const data = { ...baseStep, conclusion: null };
    const parsed = ActionStepSchema.parse(data);
    expect(parsed.conclusion).toBeNull();
  });

  it("accepts omitted started_at / completed_at (still-queued step)", () => {
    const data = {
      name: "queued",
      status: "queued" as const,
      conclusion: null,
      number: 1,
    };
    const parsed = ActionStepSchema.parse(data);
    expect(parsed.started_at).toBeUndefined();
    expect(parsed.completed_at).toBeUndefined();
  });

  it("rejects a negative step number", () => {
    const data = { ...baseStep, number: -2 };
    expect(() => ActionStepSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects an empty step name", () => {
    const data = { ...baseStep, name: "" };
    expect(() => ActionStepSchema.parse(data)).toThrow(ZodError);
  });
});
