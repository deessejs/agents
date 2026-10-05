/**
 * Zod schema for a GitHub Actions job (and its steps).
 *
 * Reference: <https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt>.
 */
import { z } from "zod";

import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "./datetime.ts";

export const ActionStepSchema = z
  .object({
    name: z.string().min(1).max(255),
    status: z.enum(["queued", "in_progress", "completed", "pending", "waiting", "skipped"]),
    conclusion: z.string().max(50).nullable(),
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
    conclusion: z.string().max(50).nullable(),
    started_at: IsoDateTimeSchema,
    completed_at: NullableIsoDateTimeSchema,
    steps: z.array(ActionStepSchema),
  })
  .passthrough();

export type ActionJob = z.infer<typeof ActionJobSchema>;
