/**
 * Issue helpers.
 *
 * `GET /repos/{owner}/{repo}/issues` returns both issues AND pull
 * requests; PRs include a `pull_request` field. We filter those out so
 * callers only see real issues.
 */
import type { Octokit } from "@octokit/core";

import { paginateAll } from "../pagination.js";
import { IssueSchema, type Issue } from "../schemas/issue.js";

export interface GetOpenIssuesOpts {
  org: string;
  repo?: string;
  /** Filter by issue author login. */
  author?: string;
  /** ISO date (inclusive lower bound on `created_at`). */
  since?: string;
  max?: number;
}

interface RawIssue {
  pull_request?: unknown;
}

/**
 * List currently-open issues.
 */
export async function getOpenIssues(octokit: Octokit, opts: GetOpenIssuesOpts): Promise<Issue[]> {
  const rows = await paginateAll<RawIssue>(
    octokit,
    opts.repo ? "GET /repos/{owner}/{repo}/issues" : "GET /search/issues",
    opts.repo
      ? {
          owner: opts.org,
          repo: opts.repo,
          state: "open",
          since: opts.since,
          per_page: 100,
        }
      : {
          q: [
            "is:issue",
            "is:open",
            `org:${opts.org}`,
            opts.repo ? `repo:${opts.org}/${opts.repo}` : "",
            opts.author ? `author:${opts.author}` : "",
          ]
            .filter(Boolean)
            .join(" "),
          per_page: 100,
        },
    { max: opts.max ?? 1000 },
  );

  // The search endpoint already filters out PRs, but the repo endpoint
  // includes them — guard both.
  return rows.filter((r) => r.pull_request === undefined).map((r) => IssueSchema.parse(r));
}

export interface GetClosedIssuesOpts {
  org: string;
  repo?: string;
  author?: string;
  since?: string;
  until?: string;
  max?: number;
}

export async function getClosedIssues(
  octokit: Octokit,
  opts: GetClosedIssuesOpts,
): Promise<Issue[]> {
  const rows = await paginateAll<RawIssue>(
    octokit,
    opts.repo ? "GET /repos/{owner}/{repo}/issues" : "GET /search/issues",
    opts.repo
      ? {
          owner: opts.org,
          repo: opts.repo,
          state: "closed",
          since: opts.since,
          per_page: 100,
        }
      : {
          q: [
            "is:issue",
            "is:closed",
            `org:${opts.org}`,
            opts.repo ? `repo:${opts.org}/${opts.repo}` : "",
            opts.author ? `author:${opts.author}` : "",
            opts.since ? `closed:>=${opts.since}` : "",
            opts.until ? `closed:<=${opts.until}` : "",
          ]
            .filter(Boolean)
            .join(" "),
          per_page: 100,
        },
    { max: opts.max ?? 1000 },
  );

  return rows.filter((r) => r.pull_request === undefined).map((r) => IssueSchema.parse(r));
}

export interface GetIssueTimelineOpts {
  owner: string;
  repo: string;
  issue_number: number;
  max?: number;
}

export async function getIssueTimeline(
  octokit: Octokit,
  opts: GetIssueTimelineOpts,
): Promise<unknown[]> {
  return paginateAll<unknown>(
    octokit,
    "GET /repos/{owner}/{repo}/issues/{issue_number}/timeline",
    { owner: opts.owner, repo: opts.repo, issue_number: opts.issue_number },
    { max: opts.max ?? 1000 },
  );
}
