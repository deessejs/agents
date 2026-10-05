/**
 * GitHub Actions helpers.
 */
import type { Octokit } from "@octokit/core";

import { paginateAll } from "../pagination.ts";
import { WorkflowRunSchema, type WorkflowRun } from "../schemas/workflow-run.ts";

export interface GetWorkflowRunsOpts {
  owner: string;
  repo: string;
  /** Workflow filename (e.g. "ci.yml") or numeric ID. */
  workflow?: string;
  branch?: string;
  max?: number;
}

export async function getWorkflowRuns(
  octokit: Octokit,
  opts: GetWorkflowRunsOpts,
): Promise<WorkflowRun[]> {
  const route: string = opts.workflow
    ? "GET /repos/{owner}/{repo}/actions/workflows/{workflow}/runs"
    : "GET /repos/{owner}/{repo}/actions/runs";

  const params = opts.workflow
    ? {
        owner: opts.owner,
        repo: opts.repo,
        workflow: opts.workflow,
        branch: opts.branch,
        per_page: 100,
      }
    : {
        owner: opts.owner,
        repo: opts.repo,
        branch: opts.branch,
        per_page: 100,
      };

  const rows = await paginateAll<unknown>(octokit, route, params, { max: opts.max ?? 100 });

  return rows.map((r) => WorkflowRunSchema.parse(r));
}

export interface GetFailedRunsOpts {
  owner: string;
  repo: string;
  workflow?: string;
  branch?: string;
  max?: number;
}

/**
 * Convenience: workflow runs with a failure conclusion.
 */
export async function getFailedRuns(
  octokit: Octokit,
  opts: GetFailedRunsOpts,
): Promise<WorkflowRun[]> {
  const runs = await getWorkflowRuns(octokit, opts);
  return runs.filter((r) => r.conclusion === "failure");
}
