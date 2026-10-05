/**
 * Release helpers.
 */
import type { Octokit } from "@octokit/core";

import { paginateAll } from "../pagination.ts";
import { ReleaseSchema, type Release } from "../schemas/release.ts";

export interface GetReleasesOpts {
  owner: string;
  repo: string;
  max?: number;
}

export async function getReleases(octokit: Octokit, opts: GetReleasesOpts): Promise<Release[]> {
  const rows = await paginateAll<Release>(
    octokit,
    "GET /repos/{owner}/{repo}/releases",
    { owner: opts.owner, repo: opts.repo, per_page: 100 },
    { max: opts.max ?? 100 },
    ReleaseSchema.parse,
  );
  return rows;
}

export async function getLatestRelease(
  octokit: Octokit,
  opts: { owner: string; repo: string },
): Promise<Release> {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/releases/latest", {
    owner: opts.owner,
    repo: opts.repo,
  });
  return ReleaseSchema.parse(data);
}
