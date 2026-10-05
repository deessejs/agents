import { describe, expect, it } from "vitest";

import { withFallback } from "../src/fallback.ts";

describe("withFallback", () => {
  it("returns the primary result when the primary succeeds", async () => {
    const primary = async () => "primary";
    const fallback = async () => "fallback";
    const result = await withFallback(primary, fallback);
    expect(result).toBe("primary");
  });

  it("falls through to the next resolver on a retryable error", async () => {
    const primary = async () => {
      throw new Error("429 rate limit exceeded");
    };
    const fallback = async () => "fallback won";
    const result = await withFallback(primary, fallback);
    expect(result).toBe("fallback won");
  });

  it("rethrows immediately when the primary fails with a non-retryable error", async () => {
    const primary = async () => {
      throw new Error("invalid prompt");
    };
    const fallback = async () => "fallback";
    await expect(withFallback(primary, fallback)).rejects.toThrow("invalid prompt");
  });

  it("rethrows the last error when every resolver fails retryably", async () => {
    const primary = async () => {
      throw new Error("503 service unavailable (1)");
    };
    const middle = async () => {
      throw new Error("503 service unavailable (2)");
    };
    const last = async () => {
      throw new Error("503 service unavailable (3)");
    };
    await expect(withFallback(primary, middle, last)).rejects.toThrow("(3)");
  });
});
