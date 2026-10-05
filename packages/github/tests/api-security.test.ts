/**
 * Tests for the security API helpers (Dependabot, Code Scanning, Secret Scanning).
 */
import { describe, expect, it } from "vitest";
import type { Octokit } from "@octokit/core";

import {
  getDependabotAlerts,
  getCodeScanningAlerts,
  getSecretScanningAlerts,
} from "../src/api/security.js";

import dependabotFixture from "./fixtures/dependabot-alerts.json";
import codeScanningFixture from "./fixtures/code-scanning-alerts.json";
import secretScanningFixture from "./fixtures/secret-scanning-alerts.json";

function fakeOctokit(pages: unknown[][]): Octokit {
  const iterator = (async function* () {
    for (const page of pages) {
      yield { data: page } as never;
    }
  })();

  return {
    paginate: { iterator: () => iterator },
    request: () => Promise.resolve({ data: {} } as never),
  } as unknown as Octokit;
}

describe("getDependabotAlerts", () => {
  it("returns all alerts when no filters given", async () => {
    const octokit = fakeOctokit([dependabotFixture]);

    const alerts = await getDependabotAlerts(octokit, { org: "octocat" });
    expect(alerts).toHaveLength(3);
    expect(alerts[0]?.state).toBe("open");
    expect(alerts[0]?.severity).toBe("high");
  });

  it("filters by severity", async () => {
    const octokit = fakeOctokit([dependabotFixture]);

    const alerts = await getDependabotAlerts(octokit, {
      org: "octocat",
      severity: ["high", "critical"],
    });
    expect(alerts).toHaveLength(2);
    expect(alerts.every((a) => ["high", "critical"].includes(a.severity ?? ""))).toBe(true);
  });

  it("filters by state", async () => {
    const octokit = fakeOctokit([dependabotFixture]);

    const alerts = await getDependabotAlerts(octokit, {
      org: "octocat",
      state: ["open"],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.state).toBe("open");
  });

  it("returns [] for empty results", async () => {
    const octokit = fakeOctokit([[]]);
    const alerts = await getDependabotAlerts(octokit, { org: "octocat" });
    expect(alerts).toEqual([]);
  });
});

describe("getCodeScanningAlerts", () => {
  it("returns parsed alerts", async () => {
    const octokit = fakeOctokit([codeScanningFixture]);

    const alerts = await getCodeScanningAlerts(octokit, { org: "octocat" });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.rule_id).toBe("js/sql-injection");
    expect(alerts[0]?.tool?.name).toBe("CodeQL");
    expect(alerts[0]?.most_recent_instance?.location?.path).toBe("src/api/handlers.ts");
  });

  it("filters by state", async () => {
    const octokit = fakeOctokit([codeScanningFixture]);

    const alerts = await getCodeScanningAlerts(octokit, {
      org: "octocat",
      state: "open",
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.state).toBe("open");
  });
});

describe("getSecretScanningAlerts", () => {
  it("returns parsed alerts", async () => {
    const octokit = fakeOctokit([secretScanningFixture]);

    const alerts = await getSecretScanningAlerts(octokit, { org: "octocat" });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.secret_type).toBe("aws_access_key");
    expect(alerts[0]?.resolution).toBeNull();
  });

  it("filters by state", async () => {
    const octokit = fakeOctokit([secretScanningFixture]);

    const alerts = await getSecretScanningAlerts(octokit, {
      org: "octocat",
      state: "resolved",
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.state).toBe("resolved");
  });
});
