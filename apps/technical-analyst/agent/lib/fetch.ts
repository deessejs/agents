/**
 * GitHub data fetcher. Wraps @workspace/github's per-endpoint helpers
 * (under `@workspace/github/api/*`) with the agent's data-window
 * computation + per-repo config.
 *
 * Per the runtime doc §4.3:
 *   - Critical security endpoints (Dependabot, CodeQL, secret scanning)
 *     bypass `p-limit(4)` and are dispatched with `Promise.all` so a
 *     single failure aborts the whole digest.
 *   - Non-critical endpoints (PRs, issues, releases) are wrapped in
 *     `p-limit(4)` to cap burst concurrency.
 *
 * Phase 2 v1 scope: a single configured repo (`env.GITHUB_REPO`) under
 * a single org. v2 will iterate over `getOrgRepos`. Failed CI runs
 * are repo-wide (no date filter on the helper) — v2 will post-filter
 * in-app by `run.created_at` if needed.
 */
import pLimit from "p-limit";
import { createGitHubClient } from "@workspace/github";
import {
  type PullRequest,
  type Issue,
  type DependabotAlert,
  type CodeScanningAlert,
  type SecretScanningAlert,
  type Release,
  type WorkflowRun,
} from "@workspace/github/schemas";
import { getMergedPRs } from "@workspace/github/api/pulls";
import { getOpenIssues, getClosedIssues } from "@workspace/github/api/issues";
import {
  getDependabotAlerts,
  getCodeScanningAlerts,
  getSecretScanningAlerts,
} from "@workspace/github/api/security";
import { getFailedRuns } from "@workspace/github/api/actions";
import { getReleases } from "@workspace/github/api/releases";

import { env } from "../env.ts";
import { RateLimitExhausted } from "./errors.ts";

export interface DailyData {
  org: string;
  repo: string;
  window: { start: Date; end: Date };
  /** PRs projected to the safe field subset (I5 — no `body`). */
  mergedPRs: ReadonlyArray<Record<string, unknown>>;
  newIssues: ReadonlyArray<Issue>;
  closedIssues: ReadonlyArray<Issue>;
  openDependabotAlerts: ReadonlyArray<DependabotAlert>;
  openCodeScanningAlerts: ReadonlyArray<CodeScanningAlert>;
  openSecretScanningAlerts: ReadonlyArray<SecretScanningAlert>;
  failedWorkflowRuns: ReadonlyArray<WorkflowRun>;
  newReleases: ReadonlyArray<Release>;
  rateLimit: { remaining: number; reset: number };
}

/** Project a PR to the safe field subset (I5). */
function safePRSubset(pr: PullRequest): Record<string, unknown> {
  return {
    number: pr.number,
    title: pr.title,
    additions: pr.additions,
    deletions: pr.deletions,
    changed_files: pr.changed_files,
    html_url: pr.html_url,
    merged_at: pr.merged_at,
    author: pr.user?.login ?? "ghost",
  };
}

export async function fetchDailyData(opts: {
  start: Date;
  end: Date;
  log: {
    info: (msg: string, ctx?: Record<string, unknown>) => void;
    error: (msg: string, ctx?: Record<string, unknown>) => void;
  };
}): Promise<DailyData> {
  const gh = createGitHubClient({ auth: env.GITHUB_TOKEN });
  const octokit = gh.raw;
  const org = env.GITHUB_ORG;
  const repo = env.GITHUB_REPO;
  // v1: GITHUB_ORG == owner for per-repo endpoints. v2: enumerate org repos.
  const owner = org;
  const { start, end } = opts;
  // The per-repo helpers expect ISO date strings, not Date objects.
  const since = start.toISOString();
  const until = end.toISOString();

  // I4: rate-limit gate at the start.
  const rl = await gh.getRateLimit();
  if (rl.remaining < 500) {
    opts.log.error("GitHub rate limit too low", { remaining: rl.remaining });
    throw new RateLimitExhausted(rl.remaining, rl.reset.getTime());
  }

  const limit = pLimit(4);

  // IMP-2 + I3 + FIX 6: security endpoints use Promise.all and bypass
  // p-limit for minimum latency.
  const [
    mergedPRsRaw,
    newIssues,
    closedIssues,
    openDependabotAlerts,
    openCodeScanningAlerts,
    openSecretScanningAlerts,
    failedWorkflowRuns,
    newReleases,
  ] = await Promise.all([
    limit(() =>
      getMergedPRs(octokit, { org, repo, since, until }).then((r) => {
        opts.log.info("Fetched merged PRs", { count: r.length });
        return r;
      }),
    ),
    limit(() =>
      getOpenIssues(octokit, { org, repo, since }).then((r) => {
        opts.log.info("Fetched new issues", { count: r.length });
        return r;
      }),
    ),
    limit(() =>
      getClosedIssues(octokit, { org, repo, since, until }).then((r) => {
        opts.log.info("Fetched closed issues", { count: r.length });
        return r;
      }),
    ),
    getDependabotAlerts(octokit, { org, state: ["open"], severity: ["high", "critical"] }).then(
      (r) => {
        opts.log.info("Fetched Dependabot alerts", { count: r.length });
        return r;
      },
    ),
    getCodeScanningAlerts(octokit, { org, state: "open" }).then((r) => {
      opts.log.info("Fetched CodeQL alerts", { count: r.length });
      return r;
    }),
    getSecretScanningAlerts(octokit, { org, state: "open" }).then((r) => {
      opts.log.info("Fetched secret scanning alerts", { count: r.length });
      return r;
    }),
    limit(() =>
      getFailedRuns(octokit, { owner, repo, max: 50 }).then((r) => {
        opts.log.info("Fetched failed CI runs", { count: r.length });
        return r;
      }),
    ),
    limit(() =>
      getReleases(octokit, { owner, repo, max: 10 }).then((r) => {
        opts.log.info("Fetched releases", { count: r.length });
        return r;
      }),
    ),
  ]);

  return {
    org,
    repo,
    window: { start, end },
    mergedPRs: mergedPRsRaw.map(safePRSubset),
    newIssues,
    closedIssues,
    openDependabotAlerts,
    openCodeScanningAlerts,
    openSecretScanningAlerts,
    failedWorkflowRuns,
    newReleases,
    rateLimit: { remaining: rl.remaining, reset: rl.reset.getTime() },
  };
}
