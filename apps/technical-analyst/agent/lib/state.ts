/**
 * Shared session state for the Technical Analyst.
 *
 * Two `defineState` handles — the minimum required so submit_digest
 * can validate references without re-running collection:
 *
 *   - `edition`       — the canonical edition identity (kind, repo,
 *                       period, recipient, collectedAt). Read by
 *                       submit_digest to validate the report window.
 *   - `sourceCorpus`  — the source list the model cites. Read by
 *                       submit_digest to validate every reference id.
 *
 * No cross-session persistence: a v1 digest run does not need exactly-
 * once delivery. Retries of the same outgoing payload reuse Resend's
 * content-derived idempotency key (24h window); independently regen
 * runs may occasionally send a duplicate, which is acceptable.
 */
import { defineState } from "eve/context";

export type SourceKind =
  | "merged_pr"
  | "open_pr"
  | "opened_issue"
  | "closed_issue"
  | "dependabot_alert"
  | "code_scanning_alert"
  | "secret_scanning_alert"
  | "failed_workflow_run"
  | "release";

export interface Source {
  readonly id: string;
  readonly kind: SourceKind;
  readonly repo: string;
  readonly url: string;
  readonly title: string;
  readonly meta?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface Period {
  readonly kind: "daily" | "weekly";
  /** ISO 8601 UTC. Inclusive lower, exclusive upper. */
  readonly start: string;
  readonly end: string;
  /** YYYY-MM-DD in UTC. Used in the subject line. */
  readonly label: string;
}

export interface Edition {
  readonly id: string;
  readonly kind: "daily" | "weekly";
  readonly repo: string;
  readonly period: Period;
  readonly recipient: string;
  readonly collectedAt: string;
}

export interface Counts {
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

export interface WeeklyMetrics {
  readonly merged_count: number;
  readonly dependabot_open: number;
  readonly dependabot_critical: number;
  readonly code_scanning_open: number;
  readonly secret_scanning_open: number;
  readonly failed_runs: number;
  readonly releases_count: number;
  readonly open_prs_count: number;
}

export interface SourceAvailability {
  readonly status: "unavailable";
  readonly reason: string;
}

export interface SourceCorpus {
  readonly edition: Edition;
  readonly sources: ReadonlyArray<Source>;
  readonly counts: Counts;
  readonly weeklyMetrics: WeeklyMetrics | null;
  readonly availability: ReadonlyArray<SourceAvailability>;
}

const INITIAL_EDITION: Edition = {
  id: "",
  kind: "daily",
  repo: "",
  period: { kind: "daily", start: "", end: "", label: "" },
  recipient: "",
  collectedAt: "",
};

const INITIAL_COUNTS: Counts = {
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

export const edition = defineState<Edition>("technical-analyst.edition", () => INITIAL_EDITION);

export const sourceCorpus = defineState<SourceCorpus>("technical-analyst.source-corpus", () => ({
  edition: INITIAL_EDITION,
  sources: [],
  counts: INITIAL_COUNTS,
  weeklyMetrics: null,
  availability: [],
}));
