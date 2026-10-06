/**
 * Shared session state for the Technical Analyst.
 *
 * `collect_activity` writes the source list it fetches; `submit_digest`
 * reads it to validate every reference the model puts in its report.
 * Both tools share the same module-scope handle, so the writes from
 * `collect_activity` are visible to `submit_digest` inside the same
 * scheduled session.
 *
 * The state is durable across step boundaries within a session; it
 * does not survive across scheduled runs (every cron tick is a fresh
 * session, so the model always re-collects before submitting).
 *
 * Imported via `eve/context`; `get()` / `update()` require an active
 * eve context, so this module has no side effects at import time.
 */
import { defineState } from "eve/context";

export type SourceKind =
  | "merged_pr"
  | "opened_issue"
  | "closed_issue"
  | "dependabot_alert"
  | "code_scanning_alert"
  | "secret_scanning_alert"
  | "failed_workflow_run"
  | "release";

export interface SourceEntry {
  /** Stable id; the model cites this id in its report. */
  readonly id: string;
  readonly kind: SourceKind;
  /** Authoritative URL the agent can link to. */
  readonly url: string;
  /** Short headline for the report. */
  readonly title: string;
  /** Optional metric context the agent can quote (counts, severity, etc.). */
  readonly meta?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface SourceCorpus {
  /** Schema edition the model is reporting against. */
  readonly kind: "daily" | "weekly";
  /** Window covered by the corpus (ISO 8601 UTC). */
  readonly windowStart: string;
  readonly windowEnd: string;
  /** The bounded list of references the model is allowed to cite. */
  readonly sources: ReadonlyArray<SourceEntry>;
}

export const sourceCorpus = defineState<SourceCorpus>("technical-analyst.source-corpus", () => ({
  kind: "daily",
  windowStart: "",
  windowEnd: "",
  sources: [],
}));
