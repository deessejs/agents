/**
 * `collect_activity` — read the GitHub data the digest covers and
 * persist a bounded source corpus for `submit_digest` to validate
 * against.
 *
 * The window is canonical:
 *   - `daily`  : [now - 24h, now]
 *   - `weekly` : [most recent Monday 00:00 UTC, now] clamped to at
 *                least 5 calendar days so a Friday fire still covers
 *                a real Mon-Fri period.
 *
 * The agent owns the window identity; every other digest field (id,
 * idempotency key) is derived from it.
 *
 * Security: every fetched record is projected to a small typed shape
 * before returning. PR `body` is dropped. Secret-scanning alerts are
 * reduced to `(number, secret_type, state)` so the secret value
 * never reaches the model. Repository text is treated as untrusted —
 * only a small allowlist of fields is exposed.
 */
import { defineTool } from "eve/tools";
import { z } from "zod";

import { createGitHubClient } from "@workspace/github";
import { getMergedPRs, getOpenPRs } from "@workspace/github/api/pulls";
import { getOpenIssues, getClosedIssues } from "@workspace/github/api/issues";
import {
  getDependabotAlerts,
  getCodeScanningAlerts,
  getSecretScanningAlerts,
} from "@workspace/github/api/security";
import { getFailedRuns } from "@workspace/github/api/actions";
import { getReleases } from "@workspace/github/api/releases";

import { env } from "../env.ts";
import { sourceCorpus, type SourceEntry } from "../lib/source-corpus.ts";

/**
 * A canonical 24-hour window is `[now - 24h, now]`. A canonical
 * weekly window is the most recent Monday 00:00 UTC → now, but we
 * floor the lookback to 5 days so a Friday 18:00 fire still returns
 * a real Mon→Fri period even if the previous Monday is missing.
 */
function canonicalWindow(kind: "daily" | "weekly", now: Date): { start: Date; end: Date } {
  if (kind === "daily") {
    const end = new Date(now);
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { start, end };
  }
  // weekly: Monday 00:00 UTC of the current ISO week → now
  const end = new Date(now);
  const day = end.getUTCDay(); // 0 = Sun, 1 = Mon, …, 6 = Sat
  const daysSinceMonday = (day + 6) % 7; // Sun=6, Tue=1, …, Sat=5
  const monday = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - daysSinceMonday),
  );
  const fiveDayFloor = new Date(end.getTime() - 5 * 24 * 60 * 60 * 1000);
  const start = monday.getTime() < fiveDayFloor.getTime() ? fiveDayFloor : monday;
  return { start, end };
}

export default defineTool({
  description:
    "Fetch the authoritative GitHub data for one digest edition. Returns a bounded " +
    "list of source records (PRs, issues, alerts, runs, releases) for the canonical " +
    "window. The model cites the `id` of any record it references. Always call this " +
    "first on a new run.",
  inputSchema: z.object({
    kind: z.enum(["daily", "weekly"]).describe("Digest edition to collect for."),
  }),
  label: {
    start: ({ kind }) => `Collect GitHub activity for the ${kind} digest`,
  },
  async execute({ kind }) {
    const { start, end } = canonicalWindow(kind, new Date());
    const since = start.toISOString();
    const until = end.toISOString();

    const gh = createGitHubClient({ auth: env.GITHUB_TOKEN });
    const org = env.GITHUB_ORG;
    const repo = env.GITHUB_REPO;

    // All fetches run concurrently — `collect_activity` is a single
    // tool call from the model's perspective; the per-endpoint Octokit
    // helpers handle their own throttling + retry.
    const [
      mergedRaw,
      newIssuesRaw,
      closedIssuesRaw,
      openDependabot,
      openCodeScanning,
      openSecretScanning,
      failedRuns,
      newReleases,
      openPRsRaw,
    ] = await Promise.all([
      getMergedPRs(gh.raw, { org, repo, since, until, max: 100 }).catch(() => []),
      getOpenIssues(gh.raw, { org, repo, since }).catch(() => []),
      getClosedIssues(gh.raw, { org, repo, since, until }).catch(() => []),
      getDependabotAlerts(gh.raw, { org, state: ["open"] }).catch(() => []),
      getCodeScanningAlerts(gh.raw, { org, state: "open" }).catch(() => []),
      getSecretScanningAlerts(gh.raw, { org, state: "open" }).catch(() => []),
      getFailedRuns(gh.raw, { owner: org, repo, max: 50 }).catch(() => []),
      getReleases(gh.raw, { owner: org, repo, max: 10 }).catch(() => []),
      getOpenPRs(gh.raw, { org, repo, max: 100 }).catch(() => []),
    ]);

    const sources: SourceEntry[] = [];

    for (const pr of mergedRaw) {
      if (!pr.merged_at) continue;
      const mergedAt = new Date(pr.merged_at);
      if (mergedAt < start || mergedAt > end) continue;
      sources.push({
        id: `pr:${pr.number}`,
        kind: "merged_pr",
        url: pr.html_url,
        title: pr.title,
        meta: {
          number: pr.number,
          additions: pr.additions ?? 0,
          deletions: pr.deletions ?? 0,
          changed_files: pr.changed_files ?? 0,
          author: pr.user?.login ?? null,
          merged_at: pr.merged_at,
        },
      });
    }

    for (const issue of newIssuesRaw) {
      if (issue.pull_request !== undefined) continue;
      sources.push({
        id: `issue:${issue.number}`,
        kind: "opened_issue",
        url: issue.html_url,
        title: issue.title,
        meta: {
          number: issue.number,
          user: issue.user?.login ?? null,
          created_at: issue.created_at,
        },
      });
    }

    for (const issue of closedIssuesRaw) {
      if (issue.pull_request !== undefined) continue;
      const closedAt = issue.closed_at ? new Date(issue.closed_at) : null;
      if (!closedAt || closedAt < start || closedAt > end) continue;
      sources.push({
        id: `issue:${issue.number}`,
        kind: "closed_issue",
        url: issue.html_url,
        title: issue.title,
        meta: {
          number: issue.number,
          user: issue.user?.login ?? null,
          closed_at: issue.closed_at,
        },
      });
    }

    for (const alert of openDependabot) {
      const pkg = alert.package?.name ?? null;
      const sev = alert.severity ?? "unknown";
      sources.push({
        id: `dependabot:${alert.number}`,
        kind: "dependabot_alert",
        url: alert.html_url,
        title: `${sev.toUpperCase()} — ${pkg ?? "(unknown package)"}`,
        meta: { number: alert.number, severity: sev, package: pkg },
      });
    }

    for (const alert of openCodeScanning) {
      const name = alert.rule?.name ?? `Rule ${alert.rule_id ?? alert.number}`;
      sources.push({
        id: `codeql:${alert.number}`,
        kind: "code_scanning_alert",
        url: alert.html_url,
        title: name,
        meta: {
          number: alert.number,
          severity: alert.rule?.severity ?? null,
          rule: alert.rule_id ?? null,
        },
      });
    }

    for (const alert of openSecretScanning) {
      // NEVER expose the secret value. We keep only `number`, secret
      // type (categorical, never the secret itself), and state.
      sources.push({
        id: `secret:${alert.number}`,
        kind: "secret_scanning_alert",
        url: alert.html_url,
        title: `Secret detected — ${alert.secret_type}`,
        meta: {
          number: alert.number,
          secret_type: alert.secret_type,
          state: alert.state ?? null,
        },
      });
    }

    for (const run of failedRuns) {
      const createdAt = new Date(run.created_at);
      if (createdAt < start || createdAt > end) continue;
      sources.push({
        id: `run:${run.id}`,
        kind: "failed_workflow_run",
        url: run.html_url,
        title: `Workflow failure — ${run.name ?? "unknown"}`,
        meta: {
          run_id: run.id,
          workflow: run.name ?? null,
          conclusion: run.conclusion ?? null,
          created_at: run.created_at,
        },
      });
    }

    for (const release of newReleases) {
      if (!release.published_at) continue;
      const publishedAt = new Date(release.published_at);
      if (publishedAt < start || publishedAt > end) continue;
      sources.push({
        id: `release:${release.id}`,
        kind: "release",
        url: release.html_url,
        title: release.name ?? release.tag_name,
        meta: {
          id: release.id,
          tag: release.tag_name,
          published_at: release.published_at,
          draft: release.draft,
        },
      });
    }

    // Open PRs are not window-bound; include them in the corpus so
    // the agent can mention stale in-flight work. The model's text
    // must distinguish them from merged PRs.
    for (const pr of openPRsRaw) {
      sources.push({
        id: `openpr:${pr.number}`,
        kind: "merged_pr", // single kind keeps the schema simple
        url: pr.html_url,
        title: pr.title,
        meta: {
          number: pr.number,
          additions: pr.additions ?? 0,
          deletions: pr.deletions ?? 0,
          changed_files: pr.changed_files ?? 0,
          author: pr.user?.login ?? null,
          merged_at: null,
          open: true,
          updated_at: pr.updated_at,
        },
      });
    }

    const corpus = {
      kind,
      windowStart: since,
      windowEnd: until,
      sources,
    };

    // Persist the corpus into session state so `submit_digest` can
    // validate every reference the model puts in its report.
    sourceCorpus.update(() => corpus);

    // Tool output: count + window + a model-visible sample. The full
    // list is held in session state and read by `submit_digest`.
    return {
      kind,
      windowStart: since,
      windowEnd: until,
      sourceCount: sources.length,
      sources: sources.slice(0, 50).map((s) => ({ id: s.id, kind: s.kind, url: s.url, title: s.title })),
    };
  },
});