/**
 * Zod schema for a GitHub Actions job (and its steps).
 *
 * Reference: <https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt>.
 */
import { z } from "zod";

export const ActionStepSchema = z
  .object({
    name: z.string(),
    status: z.enum(["queued", "in_progress", "completed", "pending", "waiting", "skipped"]),
    conclusion: z.string().nullable(),
    number: z.number().int(),
    started_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
  })
  .strict();

export type ActionStep = z.infer<typeof ActionStepSchema>;

export const ActionJobSchema = z
  .object({
    id: z.number().int().positive(),
    run_id: z.number().int().positive(),
    name: z.string(),
    status: z.enum(["queued", "in_progress", "completed", "pending", "waiting"]),
    conclusion: z.string().nullable(),
    started_at: z.string(),
    completed_at: z.string().nullable(),
    steps: z.array(ActionStepSchema),
  })
  .strict();

export type ActionJob = z.infer<typeof ActionJobSchema>;
