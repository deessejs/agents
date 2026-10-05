/**
 * Repository helpers.
 */
import type { Octokit } from "@octokit/core";
import { RepoSchema, type Repo } from "../schemas/repo.ts";
import { paginateAll } from "../pagination.ts";

export interface GetOrgReposOpts {
  org: string;
  type?: "all" | "public" | "private" | "forks" | "sources" | "member";
  max?: number;
}

/**
 * List every repository in an organization. Validates each row against
 * `RepoSchema`.
 */
export async function getOrgRepos(octokit: Octokit, opts: GetOrgReposOpts): Promise<Repo[]> {
  const paginationOpts: { max?: number } = {};
  if (opts.max !== undefined) {
    paginationOpts.max = opts.max;
  }
  const rows = await paginateAll<Repo>(
    octokit,
    "GET /orgs/{org}/repos",
    { org: opts.org, per_page: 100, type: opts.type ?? "all" },
    paginationOpts,
    RepoSchema.parse,
  );
  return rows;
}

export async function getRepo(
  octokit: Octokit,
  opts: { owner: string; repo: string },
): Promise<Repo> {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}", {
    owner: opts.owner,
    repo: opts.repo,
  });
  return RepoSchema.parse(data);
}
