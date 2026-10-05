/**
 * Tests for the alert schemas (Dependabot, Code Scanning, Secret Scanning).
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { DependabotAlertSchema } from "../src/schemas/dependabot-alert.ts";
import { CodeScanningAlertSchema } from "../src/schemas/code-scanning-alert.ts";
import { SecretScanningAlertSchema } from "../src/schemas/secret-scanning-alert.ts";

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

  it("rejects an unknown ecosystem", () => {
    const data = { ...dependabotFixture[0], ecosystem: "made-up-ecosystem" };
    expect(() => DependabotAlertSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects an over-long vulnerable_version_range", () => {
    const data = {
      ...dependabotFixture[0],
      vulnerable_version_range: "<".padEnd(257, "x"),
    };
    expect(() => DependabotAlertSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects an empty payload (all required keys missing)", () => {
    expect(() => DependabotAlertSchema.parse({})).toThrow(ZodError);
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

  it("rejects an empty payload (all required keys missing)", () => {
    expect(() => CodeScanningAlertSchema.parse({})).toThrow(ZodError);
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

  it("rejects a secret_type with non-snake-case characters", () => {
    const data = { ...secretScanningFixture[0], secret_type: "Not_Snake_Case!" };
    expect(() => SecretScanningAlertSchema.parse(data)).toThrow(ZodError);
  });

  it("rejects an empty payload (all required keys missing)", () => {
    expect(() => SecretScanningAlertSchema.parse({})).toThrow(ZodError);
  });
});
