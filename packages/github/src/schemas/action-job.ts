/**
 * Zod schema for a GitHub Actions job (and its steps).
 *
 * Reference: <https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt>.
 */
import { z } from "zod";

import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "./datetime.ts";

/**
 * Documented set of `conclusion` values for completed Actions jobs/steps.
 * Hoisted into a named schema so both `ActionJobSchema` and
 * `ActionStepSchema` can reuse the same enum.
 *
 * Reference: <https://docs.github.com/en/rest/actions/workflow-jobs>.
 */
export const ActionConclusionSchema = z
  .enum([
    "success",
    "failure",
    "cancelled",
    "skipped",
    "timed_out",
    "action_required",
    "neutral",
    "stale",
    "startup_failure",
  ])
  .nullable();

export const ActionStepSchema = z
  .object({
    name: z.string().min(1).max(255),
    status: z.enum(["queued", "in_progress", "completed", "pending", "waiting", "skipped"]),
    conclusion: ActionConclusionSchema,
    number: z.number().int().positive(),
    started_at: NullableIsoDateTimeSchema.optional(),
    completed_at: NullableIsoDateTimeSchema.optional(),
  })
  .passthrough();

export type ActionStep = z.infer<typeof ActionStepSchema>;

export const ActionJobSchema = z
  .object({
    id: z.number().int().positive(),
    run_id: z.number().int().positive(),
    name: z.string().min(1).max(255),
    status: z.enum(["queued", "in_progress", "completed", "pending", "waiting"]),
    conclusion: ActionConclusionSchema,
    started_at: IsoDateTimeSchema,
    completed_at: NullableIsoDateTimeSchema,
    steps: z.array(ActionStepSchema),
  })
  .passthrough();

export type ActionJob = z.infer<typeof ActionJobSchema>;
