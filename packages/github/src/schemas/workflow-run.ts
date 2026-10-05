/**
 * Zod schema for a GitHub Actions workflow run.
 *
 * Reference: <https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository>.
 */
import { z } from "zod";

export const WorkflowRunSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    head_branch: z.string().nullable(),
    head_sha: z.string(),
    status: z.enum(["queued", "in_progress", "requested", "waiting", "pending", "completed"]),
    conclusion: z
      .enum([
        "success",
        "failure",
        "neutral",
        "cancelled",
        "skipped",
        "timed_out",
        "action_required",
        "startup_failure",
        "stale",
      ])
      .nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    run_started_at: z.string().nullable().optional(),
    html_url: z.string(),
    event: z.string(),
  })
  .strict();

export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
