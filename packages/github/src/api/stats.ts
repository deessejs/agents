/**
 * Repo statistics helpers — used for DORA-style metrics.
 */
import type { Octokit } from "@octokit/core";
import { z } from "zod";

/**
 * Activity bucket returned by `GET /repos/{owner}/{repo}/stats/commit_activity`.
 * `week` is the unix timestamp (seconds) for the start of the week
 * (Monday, UTC) and `days` is an array of 7 commit counts (Sun → Sat).
 *
 * `passthrough()` keeps any extra fields GitHub adds so live API
 * additions land on the parsed object without a schema bump.
 */
export const CommitActivitySchema = z
  .object({
    week: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    days: z.array(z.number().int().nonnegative()).length(7),
  })
  .passthrough();

export interface GetCommitActivityOpts {
  owner: string;
  repo: string;
}

export async function getCommitActivity(
  octokit: Octokit,
  opts: GetCommitActivityOpts,
): Promise<Array<z.infer<typeof CommitActivitySchema>>> {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/stats/commit_activity", {
    owner: opts.owner,
    repo: opts.repo,
  });
  if (!Array.isArray(data)) return [];
  return data.map((week) => CommitActivitySchema.parse(week));
}
