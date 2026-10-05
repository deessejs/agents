/**
 * Tests for the alert schemas (Dependabot, Code Scanning, Secret Scanning).
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { DependabotAlertSchema } from "../src/schemas/dependabot-alert.js";
import { CodeScanningAlertSchema } from "../src/schemas/code-scanning-alert.js";
import { SecretScanningAlertSchema } from "../src/schemas/secret-scanning-alert.js";

import dependabotFixture from "./fixtures/dependabot-alerts.json";
import codeScanningFixture from "./fixtures/code-scanning-alerts.json";
import secretScanningFixture from "./fixtures/secret-scanning-alerts.json";

describe("DependabotAlertSchema", () => {
  it("parses each fixture row", () => {
    for (const row of dependabotFixture) {
      expect(() => DependabotAlertSchema.parse(row)).not.toThrow();
    }
  });

  it("rejects unknown severity", () => {
    const data = { ...dependabotFixture[0], severity: "ultra" };
    expect(() => DependabotAlertSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects unknown state", () => {
    const data = { ...dependabotFixture[0], state: "weird" };
    expect(() => DependabotAlertSchema.parse(data)).toThrow(ZodError);
  });

  it("accepts null severity (older API versions)", () => {
    const data = { ...dependabotFixture[0], severity: null };
    expect(() => DependabotAlertSchema.parse(data)).not.toThrow();
  });
});

describe("CodeScanningAlertSchema", () => {
  it("parses each fixture row", () => {
    for (const row of codeScanningFixture) {
      expect(() => CodeScanningAlertSchema.parse(row)).not.toThrow();
    }
  });

  it("accepts missing optional rule_id (older alerts)", () => {
    const data = { ...codeScanningFixture[0], rule_id: undefined };
    expect(() => CodeScanningAlertSchema.parse(data)).not.toThrow();
  });

  it("rejects unknown state", () => {
    const data = { ...codeScanningFixture[0], state: "weird" };
    expect(() => CodeScanningAlertSchema.parse(data)).toThrow(ZodError);
  });
});

describe("SecretScanningAlertSchema", () => {
  it("parses each fixture row", () => {
    for (const row of secretScanningFixture) {
      expect(() => SecretScanningAlertSchema.parse(row)).not.toThrow();
    }
  });

  it("rejects invalid state", () => {
    const data = { ...secretScanningFixture[0], state: "weird" };
    expect(() => SecretScanningAlertSchema.parse(data)).toThrow(ZodError);
  });

  it("accepts null resolution (open alerts)", () => {
    const data = { ...secretScanningFixture[0], resolution: null };
    expect(() => SecretScanningAlertSchema.parse(data)).not.toThrow();
  });
});
