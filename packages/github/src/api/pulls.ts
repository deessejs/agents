/**
 * Pull Request helpers.
 *
 * The Octokit endpoints list PRs by `state` (`open` / `closed`) but
 * can't filter by `merged=true` or date range directly. We use
 * `state=closed` and filter in-memory — agents rarely need more than
 * the last ~1000 merged PRs.
 */
import type { Octokit } from "@octokit/core";

import { paginateAll } from "../pagination.js";
import { PullRequestSchema, type PullRequest } from "../schemas/pull-request.js";

export interface GetMergedPRsOpts {
  org: string;
  repo?: string;
  /** ISO date (inclusive). */
  since: string;
  /** ISO date (exclusive). Defaults to now. */
  until?: string;
  /** Filter by PR author login. */
  author?: string;
  /** Cap on results. Default: 1000. */
  max?: number;
}

/**
 * List merged PRs in the [since, until] window.
 */
export async function getMergedPRs(
  octokit: Octokit,
  opts: GetMergedPRsOpts,
): Promise<PullRequest[]> {
  const route: string = opts.repo ? "GET /repos/{owner}/{repo}/pulls" : "GET /search/issues";

  const baseParams = opts.repo
    ? {
        owner: opts.org,
        repo: opts.repo,
        state: "closed",
        per_page: 100,
        sort: "updated",
        direction: "desc" as const,
      }
    : {
        q: [
          `is:pr`,
          `is:merged`,
          `org:${opts.org}`,
          opts.repo ? `repo:${opts.org}/${opts.repo}` : "",
          opts.author ? `author:${opts.author}` : "",
          `merged:${opts.since}..${opts.until ?? new Date().toISOString()}`,
        ]
          .filter(Boolean)
          .join(" "),
        per_page: 100,
      };

  const rows = await paginateAll<unknown>(octokit, route, baseParams, { max: opts.max ?? 1000 });

  return rows.map((raw) => PullRequestSchema.parse(raw));
}

export interface GetOpenPRsOpts {
  org: string;
  repo?: string;
  author?: string;
  max?: number;
}

/**
 * List currently open PRs (no merge state filtering).
 */
export async function getOpenPRs(octokit: Octokit, opts: GetOpenPRsOpts): Promise<PullRequest[]> {
  const route: string = opts.repo ? "GET /repos/{owner}/{repo}/pulls" : "GET /search/issues";

  const params = opts.repo
    ? {
        owner: opts.org,
        repo: opts.repo,
        state: "open",
        per_page: 100,
      }
    : {
        q: [
          `is:pr`,
          `is:open`,
          `org:${opts.org}`,
          opts.repo ? `repo:${opts.org}/${opts.repo}` : "",
          opts.author ? `author:${opts.author}` : "",
        ]
          .filter(Boolean)
          .join(" "),
        per_page: 100,
      };

  const rows = await paginateAll<unknown>(octokit, route, params, { max: opts.max ?? 1000 });

  return rows.map((raw) => PullRequestSchema.parse(raw));
}
