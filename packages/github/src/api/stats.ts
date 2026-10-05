/**
 * Repo statistics helpers — used for DORA-style metrics.
 */
import type { Octokit } from "@octokit/core";
import { z } from "zod";

/**
 * Activity bucket returned by `GET /repos/{owner}/{repo}/stats/commit_activity`.
 * `week` is the unix timestamp (seconds) for the start of the week
 * (Monday, UTC) and `days` is an array of 7 commit counts (Sun → Sat).
 */
export const CommitActivitySchema = z
  .object({
    week: z.number().int(),
    total: z.number().int(),
    days: z.array(z.number().int()).length(7),
  })
  .strict();

export type CommitActivity = z.infer<typeof CommitActivitySchema>;

export interface GetCommitActivityOpts {
  owner: string;
  repo: string;
}

export async function getCommitActivity(
  octokit: Octokit,
  opts: GetCommitActivityOpts,
): Promise<CommitActivity[]> {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/stats/commit_activity", {
    owner: opts.owner,
    repo: opts.repo,
  });
  if (!Array.isArray(data)) return [];
  return data.map((week) => CommitActivitySchema.parse(week));
}
