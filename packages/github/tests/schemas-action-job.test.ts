/**
 * Tests for `ActionJobSchema` and `ActionStepSchema`.
 *
 * These cover the workflow-run action sub-resources. Most jobs include a
 * `steps` array of `ActionStep` items; both schemas are exported from the
 * package root.
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  ActionJobSchema,
  ActionStepSchema,
  type ActionJob,
  type ActionStep,
} from "../src/schemas/action-job.ts";

const baseStep = {
  name: "Set up job",
  status: "completed" as const,
  conclusion: "success",
  number: 1,
  started_at: "2026-10-04T10:00:00Z",
  completed_at: "2026-10-04T10:00:05Z",
} satisfies ActionStep;

const baseJob = {
  id: 1000,
  run_id: 9001,
  name: "build",
  status: "completed" as const,
  conclusion: "success",
  started_at: "2026-10-04T10:00:00Z",
  completed_at: "2026-10-04T10:01:00Z",
  steps: [baseStep],
} satisfies ActionJob;

describe("ActionStepSchema", () => {
  it("parses a fully-populated step", () => {
    const parsed = ActionStepSchema.parse(baseStep);
    expect(parsed.name).toBe("Set up job");
    expect(parsed.conclusion).toBe("success");
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

  it("rejects an unknown status", () => {
    const data = { ...baseStep, status: "frozen" };
    expect(() => ActionStepSchema.parse(data)).toThrow(ZodError);
  });

  it("accepts a nullable conclusion (in-progress run)", () => {
    const data = { ...baseStep, conclusion: null };
    const parsed = ActionStepSchema.parse(data);
    expect(parsed.conclusion).toBeNull();
  });

  it("accepts every documented conclusion enum value on a step", () => {
    // `conclusion` was previously `z.string().max(50).nullable()` —
    // upgrading to a strict enum means each valid value must round-trip
    // through the parser; this test pins the nine valid strings.
    const conclusions = [
      "success",
      "failure",
      "cancelled",
      "skipped",
      "timed_out",
      "action_required",
      "neutral",
      "stale",
      "startup_failure",
    ] as const;
    for (const conclusion of conclusions) {
      const data = { ...baseStep, conclusion };
      const parsed = ActionStepSchema.parse(data);
      expect(parsed.conclusion).toBe(conclusion);
    }
  });

  it("rejects an unknown step conclusion", () => {
    const data = { ...baseStep, conclusion: "exploded" };
    expect(() => ActionStepSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects a negative step number", () => {
    const data = { ...baseStep, number: -2 };
    expect(() => ActionStepSchema.parse(data)).toThrow(ZodError);
  });
});

describe("ActionJobSchema", () => {
  it("parses a job with nested steps", () => {
    const parsed = ActionJobSchema.parse(baseJob);
    expect(parsed.id).toBe(1000);
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]?.name).toBe("Set up job");
  });

  it("accepts all five status enum members", () => {
    // Note: jobs omit "skipped" from the status enum (only steps can be skipped).
    const statuses = ["queued", "in_progress", "completed", "pending", "waiting"] as const;
    for (const status of statuses) {
      const data = { ...baseJob, status };
      const parsed = ActionJobSchema.parse(data);
      expect(parsed.status).toBe(status);
    }
  });

  it("rejects an unknown job status", () => {
    const data = { ...baseJob, status: "weird" };
    expect(() => ActionJobSchema.parse(data)).toThrow(ZodError);
  });

  it("accepts a nullable conclusion (in-progress run)", () => {
    const data = { ...baseJob, conclusion: null };
    const parsed = ActionJobSchema.parse(data);
    expect(parsed.conclusion).toBeNull();
  });

  it("accepts every documented conclusion enum value on a job", () => {
    // Same coverage as the step-level test, but exercises the schema
    // re-use path: `ActionJobSchema.conclusion` references the shared
    // `ActionConclusionSchema` enum.
    const conclusions = [
      "success",
      "failure",
      "cancelled",
      "skipped",
      "timed_out",
      "action_required",
      "neutral",
      "stale",
      "startup_failure",
    ] as const;
    for (const conclusion of conclusions) {
      const data = { ...baseJob, conclusion };
      const parsed = ActionJobSchema.parse(data);
      expect(parsed.conclusion).toBe(conclusion);
    }
  });

  it("rejects an unknown job conclusion", () => {
    const data = { ...baseJob, conclusion: "exploded" };
    expect(() => ActionJobSchema.parse(data)).toThrow(ZodError);
  });

  it("requires steps to be an array", () => {
    // Intentionally malformed — the runtime value is a string, not an
    // array of steps. The schema must surface this as a `ZodError`.
    const data: Record<string, unknown> = { ...baseJob, steps: "not-an-array" };
    expect(() => ActionJobSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects a nested step with an invalid status", () => {
    const data = {
      ...baseJob,
      steps: [{ ...baseStep, status: "frozen" as const }],
    };
    expect(() => ActionJobSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects a non-positive run_id", () => {
    const data = { ...baseJob, run_id: 0 };
    expect(() => ActionJobSchema.parse(data)).toThrow(ZodError);
  });
});
