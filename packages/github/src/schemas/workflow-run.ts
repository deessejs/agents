/**
 * Zod schema for a GitHub Actions workflow run.
 *
 * Reference: <https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository>.
 */
import { z } from "zod";

import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "./datetime.ts";
import { CommitShaSchema } from "./shared.ts";
import { GitHubHtmlUrlSchema } from "./url.ts";

/**
 * Workflow run trigger events. GitHub's docs list a large but stable set;
 * rather than enum every value, we accept any of the documented names and
 * reject obviously wrong shapes via the regex + max-length bound.
 *
 * Reference: <https://docs.github.com/en/webhooks/webhook-events-and-payloads>
 */
const WorkflowEventSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z_]+$/, "event must be a lowercase_underscore identifier");

export const WorkflowRunSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(255),
    head_branch: z.string().max(255).nullable(),
    head_sha: CommitShaSchema,
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
    created_at: IsoDateTimeSchema,
    updated_at: IsoDateTimeSchema,
    run_started_at: NullableIsoDateTimeSchema.optional(),
    html_url: GitHubHtmlUrlSchema,
    event: WorkflowEventSchema,
  })
  .passthrough();

export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
