/**
 * Security helpers — Dependabot, code scanning, and secret scanning alerts.
 *
 * Org-level endpoints require the fine-grained PAT scope
 * `dependabot_alerts:read` / `code_scanning_alerts:read` /
 * `secret_scanning_alerts:read` respectively.
 */
import type { Octokit } from "@octokit/core";

import { paginateAll } from "../pagination.js";
import { DependabotAlertSchema, type DependabotAlert } from "../schemas/dependabot-alert.js";
import { CodeScanningAlertSchema, type CodeScanningAlert } from "../schemas/code-scanning-alert.js";
import {
  SecretScanningAlertSchema,
  type SecretScanningAlert,
} from "../schemas/secret-scanning-alert.js";

export interface GetDependabotAlertsOpts {
  org: string;
  severity?: Array<"low" | "medium" | "high" | "critical">;
  state?: Array<"open" | "fixed" | "dismissed" | "auto_dismissed">;
  max?: number;
}

export async function getDependabotAlerts(
  octokit: Octokit,
  opts: GetDependabotAlertsOpts,
): Promise<DependabotAlert[]> {
  const rows = await paginateAll<unknown>(
    octokit,
    "GET /orgs/{org}/dependabot/alerts",
    { org: opts.org, per_page: 100 },
    { max: opts.max ?? 1000 },
  );

  return rows
    .filter((raw: unknown) => {
      if (!raw) return false;
      const row = raw as {
        severity?: string | null;
        state?: string;
      };
      if (
        opts.severity &&
        opts.severity.length > 0 &&
        (!row.severity || !opts.severity.includes(row.severity as "low"))
      ) {
        return false;
      }
      if (
        opts.state &&
        opts.state.length > 0 &&
        (!row.state || !opts.state.includes(row.state as "open"))
      ) {
        return false;
      }
      return true;
    })
    .map((raw) => DependabotAlertSchema.parse(raw));
}

export interface GetCodeScanningAlertsOpts {
  org: string;
  state?: "open" | "fixed" | "dismissed" | "closed";
  severity?: Array<"low" | "medium" | "high" | "critical">;
  max?: number;
}

export async function getCodeScanningAlerts(
  octokit: Octokit,
  opts: GetCodeScanningAlertsOpts,
): Promise<CodeScanningAlert[]> {
  const rows = await paginateAll<unknown>(
    octokit,
    "GET /orgs/{org}/code-scanning/alerts",
    { org: opts.org, per_page: 100 },
    { max: opts.max ?? 1000 },
  );

  return rows
    .filter((raw: unknown) => {
      if (!raw) return false;
      const row = raw as {
        severity?: string | null;
        state?: string;
      };
      if (opts.state && row.state !== opts.state) return false;
      if (
        opts.severity &&
        opts.severity.length > 0 &&
        (!row.severity || !opts.severity.includes(row.severity as "low"))
      ) {
        return false;
      }
      return true;
    })
    .map((raw) => CodeScanningAlertSchema.parse(raw));
}

export interface GetSecretScanningAlertsOpts {
  org: string;
  state?: "open" | "resolved" | "invalid" | "false_positive" | "used_in_tests";
  max?: number;
}

export async function getSecretScanningAlerts(
  octokit: Octokit,
  opts: GetSecretScanningAlertsOpts,
): Promise<SecretScanningAlert[]> {
  const rows = await paginateAll<unknown>(
    octokit,
    "GET /orgs/{org}/secret-scanning/alerts",
    { org: opts.org, per_page: 100 },
    { max: opts.max ?? 1000 },
  );

  return rows
    .filter((raw: unknown) => {
      if (!raw) return false;
      if (!opts.state) return true;
      const row = raw as { state?: string };
      return row.state === opts.state;
    })
    .map((raw) => SecretScanningAlertSchema.parse(raw));
}
