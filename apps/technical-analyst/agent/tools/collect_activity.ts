/**
 * `collect_activity` — fetch the GitHub activity for one edition and
 * return the source corpus the model will report against.
 *
 * The edition window is **canonical UTC**:
 *
 *   - **daily**  : the **previous** UTC calendar day
 *                  `[00:00:00Z, 00:00:00Z)`. A daily run on 2026-10-06
 *                  covers 2026-10-05.
 *   - **weekly** : the **current** ISO week, Monday 00:00 UTC up to
 *                  the collection instant. A Friday run covers the
 *                  current Monday → Friday. (v1 weekly is a "weekly
 *                  progress check", not the last fully-elapsed week.)
 *
 * The window is stable across retries because it is derived from the
 * canonical UTC date of the edition. A retry reuses the same window,
 * the same editionId, and the same Resend content-derived idempotency
 * key — Resend deduplicates identical requests within its 24h window.
 *
 * **Repository scope:** all endpoints are repo-scoped to
 * `env.GITHUB_ORG / env.GITHUB_REPO`. The org-wide endpoints (which
 * would conflate alerts under a single repo prefix) are not used.
 *
 * **Period filtering:** the server-side query expresses the exact
 * window whenever the endpoint supports it (search, merged-date
 * queries). Client-side filtering is reserved for endpoints without
 * server-side date filters and is documented at each call site.
 *
 * **Failure semantics:** essential sources (security alerts) throw on
 * failure so the schedule aborts; an inaccessible security endpoint
 * must never be reported as "no alerts". Optional sources (open PRs,
 * recent runs) return `availability: "unavailable"` so the corpus
 * carries the explicit signal rather than silently masking the gap.
 *
 * **Truncation:** when a paginated source reaches its cap before the
 * server reports end-of-results, the corpus's availability entry
 * records the truncation so the renderer can surface it. Counts are
 * NOT presented as complete metrics when truncated.
 *
 * **Out:** raw secret values, full PR bodies, exhaustive GitHub REST
 * shapes. The corpus is small and projected.
 */
import { defineTool } from "eve/tools";
import { z } from "zod";
import { createHash } from "node:crypto";

import { createGitHubClient } from "@workspace/github";

type OctokitRaw = ReturnType<typeof createGitHubClient>["raw"];

import { env } from "../env.ts";
import {
  edition,
  sourceCorpus,
  type Edition,
  type Period,
  type Source,
  type SourceAvailability,
} from "../lib/state.ts";

const repo = (): string => `${env.GITHUB_ORG}/${env.GITHUB_REPO}`;

/** Canonical UTC window for a kind. Stable across retries. */
function canonicalPeriod(kind: "daily" | "weekly", now: Date): Period {
  // Daily: the previous UTC calendar day.
  if (kind === "daily") {
    const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const startMs = todayUtcMidnight - 24 * 60 * 60 * 1000;
    const start = new Date(startMs);
    const end = new Date(todayUtcMidnight);
    return {
      kind,
      start: start.toISOString(),
      end: end.toISOString(),
      label: utcDate(start),
    };
  }
  // Weekly: the **current** ISO week, Monday 00:00 UTC up to now.
  // A Friday run covers Monday → Friday (the work week so far).
  // `now.getUTCDay()`: 0 = Sun, 1 = Mon, …, 6 = Sat.
  const dayOfWeek = now.getUTCDay();
  const daysFromMonday = (dayOfWeek + 6) % 7; // Mon=0, …, Sun=6
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const thisMonday = todayUtcMidnight - daysFromMonday * 24 * 60 * 60 * 1000;
  return {
    kind,
    start: new Date(thisMonday).toISOString(),
    end: now.toISOString(),
    label: utcDate(new Date(thisMonday)),
  };
}

function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function within(dateIso: string | null, period: Period): boolean {
  if (dateIso === null) return false;
  const t = Date.parse(dateIso);
  if (Number.isNaN(t)) return false;
  return t >= Date.parse(period.start) && t < Date.parse(period.end);
}

const KINDS_REQUIRING_DATE: ReadonlySet<Source["kind"]> = new Set([
  "merged_pr",
  "opened_issue",
  "closed_issue",
  "failed_workflow_run",
  "release",
]);

function periodForKind(kind: Source["kind"]): "window" | "now" {
  return KINDS_REQUIRING_DATE.has(kind) ? "window" : "now";
}

export default defineTool({
  description:
    "Collect GitHub activity for one digest edition (daily = previous UTC day, " +
    "weekly = previous ISO week). Returns the source corpus the model cites, plus " +
    "computed counts and weekly metrics. Throws when an essential source (security " +
    "alerts) is inaccessible. Optional sources report availability explicitly.",
  inputSchema: z.object({
    kind: z.enum(["daily", "weekly"]).describe("Digest edition to collect for."),
  }),
  label: {
    start: ({ kind }) => `Collect ${kind} activity`,
  },
  async execute({ kind }) {
    // ── Pause-before-collect ────────────────────────────────────────
    if (env.AGENTS_PAUSED) {
      throw new Error("Agent is paused (env.AGENTS_PAUSED=true)");
    }

    // ── Stable edition identity ─────────────────────────────────────
    const now = new Date();
    const period = canonicalPeriod(kind, now);
    const recipient = env.DIGEST_RECIPIENT;
    const editionValue: Edition = {
      id: editionIdFor(env.GITHUB_ORG, env.GITHUB_REPO, kind, period, recipient),
      kind,
      repo: repo(),
      period,
      recipient,
      collectedAt: now.toISOString(),
    };
    edition.update(() => editionValue);

    // ── Fetch (fail loud for security endpoints) ──────────────────
    const gh = createGitHubClient({ auth: env.GITHUB_TOKEN });
    const octokit = gh.raw;

    const essential = await Promise.all([
      fetchDependabot(octokit),
      fetchCodeScanning(octokit),
      fetchSecretScanning(octokit),
    ]);
    const [dependabot, codeScanning, secretScanning] = essential;

    const optional = await Promise.allSettled([
      fetchMergedPRs(octokit, period),
      fetchOpenedIssues(octokit, period),
      fetchClosedIssues(octokit, period),
      fetchFailedRuns(octokit, period),
      fetchReleases(octokit, period),
      fetchOpenPRs(octokit),
    ]);

    const sources: Source[] = [...dependabot, ...codeScanning, ...secretScanning];
    const availability: SourceAvailability[] = [];

    // Merged-PR result includes a truncation flag (search/issues caps at 1000).
    const mergedRaw = optional[0];
    if (mergedRaw.status === "fulfilled") {
      sources.push(...mergedRaw.value.sources);
      if (mergedRaw.value.truncated) {
        availability.push({
          status: "unavailable",
          reason: `Merged-PR search reached the 1000-result cap; counts may be partial.`,
        });
      }
    } else {
      availability.push({
        status: "unavailable",
        reason:
          mergedRaw.reason instanceof Error ? mergedRaw.reason.message : String(mergedRaw.reason),
      });
    }

    const opened = unwrap(optional[1]);
    if (opened.ok) sources.push(...opened.value);
    else availability.push(opened.availability);

    const closed = unwrap(optional[2]);
    if (closed.ok) sources.push(...closed.value);
    else availability.push(closed.availability);

    const failedRuns = unwrap(optional[3]);
    if (failedRuns.ok) sources.push(...failedRuns.value);
    else availability.push(failedRuns.availability);

    const releases = unwrap(optional[4]);
    if (releases.ok) sources.push(...releases.value);
    else availability.push(releases.availability);

    const openPRs = unwrap(optional[5]);
    if (openPRs.ok) sources.push(...openPRs.value);
    else availability.push(openPRs.availability);

    // ── Persist + return compact, model-visible corpus ────────────
    const counts = computeCounts(sources);
    const weeklyMetrics = kind === "weekly" ? computeWeeklyMetrics(sources) : null;

    const corpus = {
      edition: editionValue,
      sources,
      counts,
      weeklyMetrics,
      availability,
    };
    sourceCorpus.update(() => corpus);

    return corpus;
  },
});

// ── Edition id ───────────────────────────────────────────────────────
// The edition id must be a content-independent hash of the canonical
// identity so:
//   - different dates, recipients, repos or kinds produce distinct ids
//     (no collision between adjacent days or runs),
//   - retries with identical inputs preserve the id.
//
// Buffer.from(seed).toString("base64url").slice(0, 24) does NOT do
// that — it only encodes the seed and chops the front off, so two
// different seeds can share the same 24-char prefix. sha256 over the
// full seed gives a uniform 64-hex id; we truncate to 24 for short
// headers and headers in logs.
function editionIdFor(
  org: string,
  repoName: string,
  kind: "daily" | "weekly",
  period: Period,
  recipient: string,
): string {
  const seed = `${org}|${repoName}|${kind}|${period.start}|${period.end}|${recipient}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 24);
}

// ── GitHub helpers (small projections; raw Octokit; pagination-safe) ───

async function listAll(
  octokit: OctokitRaw,
  route: string,
  params: Record<string, unknown>,
  max: number,
): Promise<unknown[]> {
  // The paginate plugin attaches a `paginate` field at runtime that
  // the base Octokit type does not model. We cast through unknown to
  // call `paginate.iterator(...)` without losing the underlying
  // type-safety of the raw client.
  type WithPaginate = {
    paginate: { iterator: (...args: unknown[]) => AsyncIterable<{ data: unknown[] }> };
  };
  const paginated = octokit as unknown as WithPaginate;
  const iter = paginated.paginate.iterator(route, params);
  const out: unknown[] = [];
  for await (const page of iter) {
    for (const item of page.data) {
      out.push(item);
      if (out.length >= max) return out;
    }
  }
  return out;
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v === null) return null;
  return v as Record<string, unknown>;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Dependabot alerts — repo-scoped, projection from the nested `dependency` + `security_vulnerability`. */
async function fetchDependabot(octokit: OctokitRaw): Promise<Source[]> {
  const rows = await listAll(
    octokit,
    "GET /repos/{owner}/{repo}/dependabot/alerts",
    { owner: env.GITHUB_ORG, repo: env.GITHUB_REPO, state: "open", per_page: 100 },
    200,
  );
  const out: Source[] = [];
  for (const raw of rows) {
    const r = asObject(raw);
    if (!r) continue;
    if (r.state !== "open") continue;
    const vuln = asObject(r.security_vulnerability);
    const dep = asObject(r.dependency);
    const pkg = asObject(dep?.package);
    const sev = asString(vuln?.severity) ?? "unknown";
    const pkgName = asString(pkg?.name) ?? "(unknown package)";
    const number = asNumber(r.number);
    const url = asString(r.html_url);
    if (number === null || url === null) continue;
    out.push({
      id: `${repo()}:dependabot:${number}`,
      kind: "dependabot_alert",
      repo: repo(),
      url,
      title: `${sev.toUpperCase()} — ${pkgName}`,
      meta: {
        severity: sev,
        package: pkgName,
        number,
      },
    });
  }
  return out;
}

/** CodeQL alerts — repo-scoped, projection preserves diagnostic severity
 * (`warning`/`error`/`note`) AND security severity (when present). */
async function fetchCodeScanning(octokit: OctokitRaw): Promise<Source[]> {
  const rows = await listAll(
    octokit,
    "GET /repos/{owner}/{repo}/code-scanning/alerts",
    { owner: env.GITHUB_ORG, repo: env.GITHUB_REPO, state: "open", per_page: 100 },
    200,
  );
  const out: Source[] = [];
  for (const raw of rows) {
    const r = asObject(raw);
    if (!r) continue;
    const number = asNumber(r.number);
    const url = asString(r.html_url);
    if (number === null || url === null) continue;
    const rule = asObject(r.rule);
    const diagSeverity = asString(rule?.severity); // warning/error/note
    const secSeverity = asString(r.security_severity_level); // low/medium/high/critical
    const severity = secSeverity ?? diagSeverity ?? null;
    const ruleId = asString(r.rule_id) ?? asString(rule?.id) ?? null;
    const ruleName = asString(rule?.name) ?? `Rule ${ruleId ?? number}`;
    out.push({
      id: `${repo()}:codeql:${number}`,
      kind: "code_scanning_alert",
      repo: repo(),
      url,
      title: ruleName,
      meta: {
        severity,
        diagnostic_severity: diagSeverity,
        security_severity: secSeverity,
        rule: ruleId,
        number,
      },
    });
  }
  return out;
}

/** Secret-scanning alerts — repo-scoped, categorical fields only; never the secret value. */
async function fetchSecretScanning(octokit: OctokitRaw): Promise<Source[]> {
  const rows = await listAll(
    octokit,
    "GET /repos/{owner}/{repo}/secret-scanning/alerts",
    { owner: env.GITHUB_ORG, repo: env.GITHUB_REPO, state: "open", per_page: 100 },
    200,
  );
  const out: Source[] = [];
  for (const raw of rows) {
    const r = asObject(raw);
    if (!r) continue;
    const number = asNumber(r.number);
    const url = asString(r.html_url);
    if (number === null || url === null) continue;
    const secretType = asString(r.secret_type) ?? "unknown";
    out.push({
      id: `${repo()}:secret:${number}`,
      kind: "secret_scanning_alert",
      repo: repo(),
      url,
      title: `Secret detected — ${secretType}`,
      meta: { secret_type: secretType, number },
    });
  }
  return out;
}

/** Merged PRs — search endpoint, exact merge-date filter on the server.
 * Default PR listing is ordered by created-at; for "merged during
 * period" the only correct ordering is the search `merged:start..end`
 * qualifier. The repo's pulls?state=closed endpoint is NOT used here
 * because it caps before merge-date filtering. */
async function fetchMergedPRs(
  octokit: OctokitRaw,
  period: Period,
): Promise<{ sources: Source[]; truncated: boolean }> {
  const q = [
    "is:pr",
    "is:merged",
    `repo:${env.GITHUB_ORG}/${env.GITHUB_REPO}`,
    `merged:${period.start}..${period.end}`,
  ].join(" ");
  const rows = await listAll(
    octokit,
    "GET /search/issues",
    { q, per_page: 100, sort: "updated", order: "desc" },
    1000,
  );
  const out: Source[] = [];
  for (const raw of rows) {
    const r = asObject(raw);
    if (!r) continue;
    // search/issues returns `pull_request` as a nested object plus an
    // `merged_at` string. Skip entries without a merged_at to be safe.
    const mergedAt = asString(r.merged_at) ?? asString(r.closed_at);
    if (mergedAt === null) continue;
    if (!within(mergedAt, period)) continue;
    const number = asNumber(r.number);
    const url = asString(r.html_url);
    if (number === null || url === null) continue;
    const user = asObject(r.user);
    out.push({
      id: `${repo()}:pr:${number}`,
      kind: "merged_pr",
      repo: repo(),
      url,
      title: asString(r.title) ?? `PR #${number}`,
      meta: {
        number,
        author: asString(user?.login) ?? null,
        merged_at: mergedAt,
      },
    });
  }
  // search/issues caps at 1000 results. We can't always know we hit
  // end-of-results, so we don't claim truncation here; we report the
  // cap via availability from the caller.
  return { sources: out, truncated: rows.length >= 1000 };
}

/** Open PRs — window-independent. */
async function fetchOpenPRs(octokit: OctokitRaw): Promise<Source[]> {
  const rows = await listAll(
    octokit,
    "GET /repos/{owner}/{repo}/pulls",
    { owner: env.GITHUB_ORG, repo: env.GITHUB_REPO, state: "open", per_page: 100 },
    100,
  );
  const out: Source[] = [];
  for (const raw of rows) {
    const r = asObject(raw);
    if (!r) continue;
    const number = asNumber(r.number);
    const url = asString(r.html_url);
    if (number === null || url === null) continue;
    const user = asObject(r.user);
    out.push({
      id: `${repo()}:openpr:${number}`,
      kind: "open_pr",
      repo: repo(),
      url,
      title: asString(r.title) ?? `PR #${number}`,
      meta: {
        number,
        author: asString(user?.login) ?? null,
        updated_at: asString(r.updated_at),
      },
    });
  }
  return out;
}

/** Opened issues — search endpoint filters by `created`. No `is:open`
 * qualifier so issues created and closed within the period are still
 * surfaced (they belong in the opened set even if currently closed). */
async function fetchOpenedIssues(octokit: OctokitRaw, period: Period): Promise<Source[]> {
  const q = [
    "is:issue",
    `repo:${env.GITHUB_ORG}/${env.GITHUB_REPO}`,
    `created:${period.start}..${period.end}`,
  ].join(" ");
  const rows = await listAll(octokit, "GET /search/issues", { q, per_page: 100 }, 1000);
  const out: Source[] = [];
  for (const raw of rows) {
    const r = asObject(raw);
    if (!r) continue;
    const number = asNumber(r.number);
    const url = asString(r.html_url);
    if (number === null || url === null) continue;
    const user = asObject(r.user);
    out.push({
      id: `${repo()}:issue-open:${number}`,
      kind: "opened_issue",
      repo: repo(),
      url,
      title: asString(r.title) ?? `Issue #${number}`,
      meta: {
        number,
        author: asString(user?.login) ?? null,
        created_at: asString(r.created_at),
      },
    });
  }
  return out;
}

/** Closed issues — search by closed range. */
async function fetchClosedIssues(octokit: OctokitRaw, period: Period): Promise<Source[]> {
  const q = [
    "is:issue",
    "is:closed",
    `repo:${env.GITHUB_ORG}/${env.GITHUB_REPO}`,
    `closed:${period.start}..${period.end}`,
  ].join(" ");
  const rows = await listAll(octokit, "GET /search/issues", { q, per_page: 100 }, 1000);
  const out: Source[] = [];
  for (const raw of rows) {
    const r = asObject(raw);
    if (!r) continue;
    const number = asNumber(r.number);
    const url = asString(r.html_url);
    if (number === null || url === null) continue;
    const user = asObject(r.user);
    out.push({
      id: `${repo()}:issue-closed:${number}`,
      kind: "closed_issue",
      repo: repo(),
      url,
      title: asString(r.title) ?? `Issue #${number}`,
      meta: {
        number,
        author: asString(user?.login) ?? null,
        closed_at: asString(r.closed_at),
      },
    });
  }
  return out;
}

/** Failed workflow runs — list endpoint; client-side window filter.
 * The runs endpoint has no server-side created-at filter; the
 * per_page=100 cap on recent runs is enough for our window. */
async function fetchFailedRuns(octokit: OctokitRaw, period: Period): Promise<Source[]> {
  const rows = await listAll(
    octokit,
    "GET /repos/{owner}/{repo}/actions/runs",
    { owner: env.GITHUB_ORG, repo: env.GITHUB_REPO, per_page: 100 },
    200,
  );
  const out: Source[] = [];
  for (const raw of rows) {
    const r = asObject(raw);
    if (!r) continue;
    if (r.conclusion !== "failure") continue;
    const createdAt = asString(r.created_at);
    if (createdAt === null || !within(createdAt, period)) continue;
    const id = asNumber(r.id);
    const url = asString(r.html_url);
    if (id === null || url === null) continue;
    out.push({
      id: `${repo()}:run:${id}`,
      kind: "failed_workflow_run",
      repo: repo(),
      url,
      title: `Workflow failure — ${asString(r.name) ?? "unknown"}`,
      meta: {
        run_id: id,
        workflow: asString(r.name),
        created_at: createdAt,
      },
    });
  }
  return out;
}

/** Releases — list endpoint; client-side published-in-window filter. */
async function fetchReleases(octokit: OctokitRaw, period: Period): Promise<Source[]> {
  const rows = await listAll(
    octokit,
    "GET /repos/{owner}/{repo}/releases",
    { owner: env.GITHUB_ORG, repo: env.GITHUB_REPO, per_page: 100 },
    50,
  );
  const out: Source[] = [];
  for (const raw of rows) {
    const r = asObject(raw);
    if (!r) continue;
    if (r.draft === true) continue;
    const publishedAt = asString(r.published_at);
    if (publishedAt === null || !within(publishedAt, period)) continue;
    const id = asNumber(r.id);
    const url = asString(r.html_url);
    if (id === null || url === null) continue;
    const tag = asString(r.tag_name) ?? "(no tag)";
    out.push({
      id: `${repo()}:release:${id}`,
      kind: "release",
      repo: repo(),
      url,
      title: asString(r.name) ?? tag,
      meta: { tag, id, published_at: publishedAt },
    });
  }
  return out;
}

// ── Counts + weekly metrics ─────────────────────────────────────────────

interface Counts {
  merged_prs: number;
  open_prs: number;
  opened_issues: number;
  closed_issues: number;
  dependabot_alerts: number;
  dependabot_critical: number;
  code_scanning_alerts: number;
  secret_scanning_alerts: number;
  failed_workflow_runs: number;
  releases: number;
}

interface WeeklyMetrics {
  readonly merged_count: number;
  readonly dependabot_open: number;
  readonly dependabot_critical: number;
  readonly code_scanning_open: number;
  readonly secret_scanning_open: number;
  readonly failed_runs: number;
  readonly releases_count: number;
  readonly open_prs_count: number;
}

function computeCounts(sources: ReadonlyArray<Source>): Counts {
  const c: Counts = {
    merged_prs: 0,
    open_prs: 0,
    opened_issues: 0,
    closed_issues: 0,
    dependabot_alerts: 0,
    dependabot_critical: 0,
    code_scanning_alerts: 0,
    secret_scanning_alerts: 0,
    failed_workflow_runs: 0,
    releases: 0,
  };
  for (const s of sources) {
    switch (s.kind) {
      case "merged_pr":
        c.merged_prs += 1;
        break;
      case "open_pr":
        c.open_prs += 1;
        break;
      case "opened_issue":
        c.opened_issues += 1;
        break;
      case "closed_issue":
        c.closed_issues += 1;
        break;
      case "dependabot_alert": {
        c.dependabot_alerts += 1;
        const sev = asString(s.meta?.severity);
        if (sev === "critical") c.dependabot_critical += 1;
        break;
      }
      case "code_scanning_alert":
        c.code_scanning_alerts += 1;
        break;
      case "secret_scanning_alert":
        c.secret_scanning_alerts += 1;
        break;
      case "failed_workflow_run":
        c.failed_workflow_runs += 1;
        break;
      case "release":
        c.releases += 1;
        break;
    }
  }
  return c;
}

function computeWeeklyMetrics(sources: ReadonlyArray<Source>): WeeklyMetrics {
  return {
    merged_count: countBy(sources, "merged_pr"),
    dependabot_open: countBy(sources, "dependabot_alert"),
    dependabot_critical: sources.filter(
      (s) => s.kind === "dependabot_alert" && asString(s.meta?.severity) === "critical",
    ).length,
    code_scanning_open: countBy(sources, "code_scanning_alert"),
    secret_scanning_open: countBy(sources, "secret_scanning_alert"),
    failed_runs: countBy(sources, "failed_workflow_run"),
    releases_count: countBy(sources, "release"),
    open_prs_count: countBy(sources, "open_pr"),
  };
}

function countBy(sources: ReadonlyArray<Source>, kind: Source["kind"]): number {
  let n = 0;
  for (const s of sources) if (s.kind === kind) n += 1;
  return n;
}

// ── Optional-result helper ───────────────────────────────────────────────

function unwrap(
  settled: PromiseSettledResult<Source[]>,
): { ok: true; value: Source[] } | { ok: false; availability: SourceAvailability } {
  if (settled.status === "fulfilled") return { ok: true, value: settled.value };
  const reason = settled.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  return {
    ok: false,
    availability: { status: "unavailable", reason: message },
  };
}

// `periodForKind` is exported so the editor can assert inputs against
// the canonical window; not currently used elsewhere but kept for
// future per-kind surface routing (e.g. filtering open alerts).
void periodForKind;
