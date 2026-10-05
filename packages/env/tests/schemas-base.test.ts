import { describe, expect, it } from "vitest";
import { baseSchema } from "../src/schemas/base.ts";

describe("baseSchema", () => {
  it("parses an object that supplies both NODE_ENV and LOG_LEVEL", () => {
    const result = baseSchema.safeParse({
      NODE_ENV: "production",
      LOG_LEVEL: "warn",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ NODE_ENV: "production", LOG_LEVEL: "warn" });
    }
  });

  it("falls back to defaults when the input is empty", () => {
    const result = baseSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        NODE_ENV: "development",
        LOG_LEVEL: "info",
      });
    }
  });

  it("rejects an unknown enum value", () => {
    const result = baseSchema.safeParse({ NODE_ENV: "wat", LOG_LEVEL: "info" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      baseSchema.parse({ NODE_ENV: "production", LOG_LEVEL: "info", EXTRA: "x" }),
    ).toThrow(/Unrecognized/);
  });
});
