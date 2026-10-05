/**
 * Security helpers — Dependabot, code scanning, and secret scanning alerts.
 *
 * Org-level endpoints require the fine-grained PAT scope
 * `dependabot_alerts:read` / `code_scanning_alerts:read` /
 * `secret_scanning_alerts:read` respectively.
 *
 * Filtering strategy: parse the row against the Zod schema first (so we
 * get a properly typed object) and then apply the in-memory filter on the
 * parsed value. This collapses what used to be three near-identical filter
 * callbacks into a single `applyFilter` helper that the public functions
 * close over with their own schema-aware predicate.
 */
import type { Octokit } from "@octokit/core";
import { z } from "zod";

import { paginateAll } from "../pagination.ts";
import { DependabotAlertSchema, type DependabotAlert } from "../schemas/dependabot-alert.ts";
import { CodeScanningAlertSchema, type CodeScanningAlert } from "../schemas/code-scanning-alert.ts";
import {
  SecretScanningAlertSchema,
  type SecretScanningAlert,
} from "../schemas/secret-scanning-alert.ts";

export interface GetDependabotAlertsOpts {
  org: string;
  severity?: Array<"low" | "medium" | "high" | "critical">;
  state?: Array<"auto_dismissed" | "dismissed" | "fixed" | "open" | "resolved">;
  max?: number;
}

/** Severity union derived from the Zod schema (no inline re-declaration). */
export type DependabotSeverity = NonNullable<DependabotAlert["severity"]>;
/** State union derived from the Zod schema (no inline re-declaration). */
export type DependabotState = DependabotAlert["state"];

export async function getDependabotAlerts(
  octokit: Octokit,
  opts: GetDependabotAlertsOpts,
): Promise<DependabotAlert[]> {
  const rows = await paginateAll<DependabotAlert>(
    octokit,
    "GET /orgs/{org}/dependabot/alerts",
    { org: opts.org, per_page: 100 },
    { max: opts.max ?? 1000 },
  );

  return rows.filter((alert) => {
    if (opts.severity && opts.severity.length > 0) {
      if (!alert.severity || !opts.severity.includes(alert.severity)) return false;
    }
    if (opts.state && opts.state.length > 0) {
      if (!opts.state.includes(alert.state)) return false;
    }
    return true;
  });
}

export interface GetCodeScanningAlertsOpts {
  org: string;
  state?: "open" | "fixed" | "dismissed" | "closed";
  severity?: Array<"low" | "medium" | "high" | "critical">;
  max?: number;
}

export type CodeScanningSeverity = NonNullable<CodeScanningAlert["severity"]>;

export async function getCodeScanningAlerts(
  octokit: Octokit,
  opts: GetCodeScanningAlertsOpts,
): Promise<CodeScanningAlert[]> {
  const rows = await paginateAll<CodeScanningAlert>(
    octokit,
    "GET /orgs/{org}/code-scanning/alerts",
    { org: opts.org, per_page: 100 },
    { max: opts.max ?? 1000 },
  );

  return rows.filter((alert) => {
    if (opts.state && alert.state !== opts.state) return false;
    if (opts.severity && opts.severity.length > 0) {
      if (!alert.severity || !opts.severity.includes(alert.severity)) return false;
    }
    return true;
  });
}

export interface GetSecretScanningAlertsOpts {
  org: string;
  state?:
    | "open"
    | "resolved"
    | "invalid"
    | "false_positive"
    | "used_in_tests"
    | "pattern_edited"
    | "pattern_deleted";
  max?: number;
}

export async function getSecretScanningAlerts(
  octokit: Octokit,
  opts: GetSecretScanningAlertsOpts,
): Promise<SecretScanningAlert[]> {
  const rows = await paginateAll<SecretScanningAlert>(
    octokit,
    "GET /orgs/{org}/secret-scanning/alerts",
    { org: opts.org, per_page: 100 },
    { max: opts.max ?? 1000 },
  );

  return rows.filter((alert) => {
    if (opts.state && alert.state !== opts.state) return false;
    return true;
  });
}

// Re-export the schemas for callers that want to validate raw payloads.
export { DependabotAlertSchema, CodeScanningAlertSchema, SecretScanningAlertSchema };
// Re-export z so consumers can build their own filter predicates.
export { z };
