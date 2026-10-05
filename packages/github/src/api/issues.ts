/**
 * Issue helpers.
 *
 * `GET /repos/{owner}/{repo}/issues` returns both issues AND pull
 * requests; PRs include a `pull_request` field. We filter those out so
 * callers only see real issues.
 */
import type { Octokit } from "@octokit/core";

import { paginateAll } from "../pagination.ts";
import { IssueSchema, type Issue } from "../schemas/issue.ts";
import { parseTimelineEvent, type TimelineEvent } from "../schemas/timeline-event.ts";

/**
 * `Issue` carries an optional `pull_request` flag on the parsed object
 * (kept by `.passthrough()`). We use this intersection type to read it
 * after `IssueSchema.parse` runs — the schema itself does not declare
 * the field, so we model it once here instead of inline-casting per call.
 */
type IssueWithPrFlag = Issue & { pull_request?: unknown };

export interface GetOpenIssuesOpts {
  org: string;
  repo?: string;
  /** Filter by issue author login. */
  author?: string;
  /** ISO date (inclusive lower bound on `created_at`). */
  since?: string;
  max?: number;
}

/**
 * List currently-open issues.
 */
export async function getOpenIssues(octokit: Octokit, opts: GetOpenIssuesOpts): Promise<Issue[]> {
  const rows = await paginateAll<IssueWithPrFlag>(
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
    (raw): IssueWithPrFlag => IssueSchema.parse(raw) as IssueWithPrFlag,
  );

  // The search endpoint already filters out PRs, but the repo endpoint
  // includes them — guard both.
  return rows.filter((r) => r.pull_request === undefined);
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
  const rows = await paginateAll<IssueWithPrFlag>(
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
    (raw): IssueWithPrFlag => IssueSchema.parse(raw) as IssueWithPrFlag,
  );

  return rows.filter((r) => r.pull_request === undefined);
}

export interface GetIssueTimelineOpts {
  owner: string;
  repo: string;
  issue_number: number;
  max?: number;
}

/**
 * List timeline events for an issue, parsed through
 * {@link TimelineEventSchema}. The endpoint returns a heterogeneous mix
 * of `labeled`, `assigned`, `closed`, `commented`, etc. — the schema
 * models the common ones as a discriminated union and keeps the rest
 * via a passthrough fallback.
 *
 * @example
 * ```ts
 * const events = await getIssueTimeline(gh, {
 *   owner: "octocat",
 *   repo: "agents",
 *   issue_number: 101,
 * });
 * const labeled = events.filter((e) => e.event === "labeled");
 * ```
 */
export async function getIssueTimeline(
  octokit: Octokit,
  opts: GetIssueTimelineOpts,
): Promise<TimelineEvent[]> {
  return paginateAll<TimelineEvent>(
    octokit,
    "GET /repos/{owner}/{repo}/issues/{issue_number}/timeline",
    { owner: opts.owner, repo: opts.repo, issue_number: opts.issue_number },
    { max: opts.max ?? 1000 },
    parseTimelineEvent,
  );
}
