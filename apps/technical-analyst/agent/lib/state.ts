/**
 * Shared session state for the Technical Analyst.
 *
 * Two `defineState` handles:
 *
 *   - `edition`     — the canonical edition identity (kind, repo,
 *                     period, recipient). Read by submit_digest to
 *                     validate the report window + recipient.
 *   - `sourceCorpus` — the bounded source list + computed metrics
 *                      the model cites. Read by submit_digest to
 *                      validate every reference id.
 *   - `deliveryLog`  — finalized outgoing payload + Resend idempotency
 *                      key. Persisted before send so a retry after
 *                      Resend acceptance reuses the same payload +
 *                      key. Read at session start.
 *
 * Cross-session persistence lives in Vercel KV (see `kv-edition.ts`).
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

export interface DeliveryRecord {
  readonly editionId: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly status: "delivered";
  readonly messageId: string;
  readonly sentAt: string;
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

export const deliveryLog = defineState<DeliveryRecord | null>(
  "technical-analyst.delivery-log",
  () => null,
);
