/**
 * Tests for the security API helpers (Dependabot, Code Scanning, Secret Scanning).
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  getDependabotAlerts,
  getCodeScanningAlerts,
  getSecretScanningAlerts,
} from "../src/api/security.ts";

import dependabotFixture from "./fixtures/dependabot-alerts.json";
import codeScanningFixture from "./fixtures/code-scanning-alerts.json";
import secretScanningFixture from "./fixtures/secret-scanning-alerts.json";
import { makeFakeOctokit } from "./helpers/fake-octokit.ts";

describe("getDependabotAlerts", () => {
  it("returns all alerts when no filters given", async () => {
    const { octokit } = makeFakeOctokit(dependabotFixture);

    const alerts = await getDependabotAlerts(octokit, { org: "octocat" });
    expect(alerts).toHaveLength(3);
    expect(alerts[0]?.state).toBe("open");
    expect(alerts[0]?.severity).toBe("high");
  });

  it("filters by severity", async () => {
    const { octokit } = makeFakeOctokit(dependabotFixture);

    const alerts = await getDependabotAlerts(octokit, {
      org: "octocat",
      severity: ["high", "critical"],
    });
    expect(alerts).toHaveLength(2);
    expect(alerts.every((a) => ["high", "critical"].includes(a.severity ?? ""))).toBe(true);
  });

  it("filters by state", async () => {
    const { octokit } = makeFakeOctokit(dependabotFixture);

    const alerts = await getDependabotAlerts(octokit, {
      org: "octocat",
      state: ["open"],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.state).toBe("open");
  });

  it("returns [] for empty results", async () => {
    const { octokit } = makeFakeOctokit([]);
    const alerts = await getDependabotAlerts(octokit, { org: "octocat" });
    expect(alerts).toEqual([]);
  });

  // CRITICAL-2 regression: the validator hook inside paginateAll must
  // surface a malformed row as a `ZodError` — never silently let a bad
  // row through to the caller. If this test starts failing, the
  // security helper has regressed to the bypass pattern.
  it("rejects a malformed row inside the validator hook with a ZodError", async () => {
    const good = dependabotFixture[0];
    // Drop a required field to force the schema to reject the second entry.
    const bad = { ...dependabotFixture[1] };
    delete (bad as Record<string, unknown>).state;
    const { octokit } = makeFakeOctokit([good, bad]);

    await expect(getDependabotAlerts(octokit, { org: "octocat" })).rejects.toThrow(ZodError);
  });
});

describe("getCodeScanningAlerts", () => {
  it("returns parsed alerts", async () => {
    const { octokit } = makeFakeOctokit(codeScanningFixture);

    const alerts = await getCodeScanningAlerts(octokit, { org: "octocat" });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.rule_id).toBe("js/sql-injection");
    expect(alerts[0]?.tool?.name).toBe("CodeQL");
    expect(alerts[0]?.most_recent_instance?.location?.path).toBe("src/api/handlers.ts");
  });

  it("filters by state", async () => {
    const { octokit } = makeFakeOctokit(codeScanningFixture);

    const alerts = await getCodeScanningAlerts(octokit, {
      org: "octocat",
      state: "open",
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.state).toBe("open");
  });

  // CRITICAL-2 regression: mirror of the getDependabotAlerts test above.
  // The validator hook inside paginateAll must surface a malformed row
  // as a `ZodError` for every security helper — not just Dependabot.
  it("rejects a malformed row inside the validator hook with a ZodError", async () => {
    const good = codeScanningFixture[0];
    // Drop the required `state` enum to force the schema to reject the second entry.
    const bad = { ...codeScanningFixture[1] };
    delete (bad as Record<string, unknown>).state;
    const { octokit } = makeFakeOctokit([good, bad]);

    await expect(getCodeScanningAlerts(octokit, { org: "octocat" })).rejects.toThrow(ZodError);
  });
});

describe("getSecretScanningAlerts", () => {
  it("returns parsed alerts", async () => {
    const { octokit } = makeFakeOctokit(secretScanningFixture);

    const alerts = await getSecretScanningAlerts(octokit, { org: "octocat" });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.secret_type).toBe("aws_access_key");
    expect(alerts[0]?.resolution).toBeNull();
  });

  it("filters by state", async () => {
    const { octokit } = makeFakeOctokit(secretScanningFixture);

    const alerts = await getSecretScanningAlerts(octokit, {
      org: "octocat",
      state: "resolved",
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.state).toBe("resolved");
  });

  // CRITICAL-2 regression: drop the required `secret_type` field to
  // verify the validator hook inside paginateAll refuses a malformed
  // secret-scanning row instead of silently passing it through.
  it("rejects a malformed row inside the validator hook with a ZodError", async () => {
    const good = secretScanningFixture[0];
    const bad = { ...secretScanningFixture[1] };
    delete (bad as Record<string, unknown>).secret_type;
    const { octokit } = makeFakeOctokit([good, bad]);

    await expect(getSecretScanningAlerts(octokit, { org: "octocat" })).rejects.toThrow(ZodError);
  });
});
