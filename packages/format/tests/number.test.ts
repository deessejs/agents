import { describe, expect, it } from "vitest";
import { formatNumber } from "../src/number.ts";

describe("formatNumber", () => {
  it("returns integer for < 1000", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1)).toBe("1");
    expect(formatNumber(999)).toBe("999");
  });

  it("formats thousands with 1 decimal + K", () => {
    expect(formatNumber(1_000)).toBe("1.0K");
    expect(formatNumber(1_500)).toBe("1.5K");
    expect(formatNumber(13_200)).toBe("13.2K");
    expect(formatNumber(999_499)).toBe("999.5K");
  });

  it("formats millions with 1 decimal + M", () => {
    expect(formatNumber(1_000_000)).toBe("1.0M");
    expect(formatNumber(2_300_000)).toBe("2.3M");
    expect(formatNumber(750_500_000)).toBe("750.5M");
  });

  it("formats billions with 1 decimal + B", () => {
    expect(formatNumber(1_000_000_000)).toBe("1.0B");
    expect(formatNumber(1_500_000_000)).toBe("1.5B");
  });

  it("preserves sign for negative numbers", () => {
    expect(formatNumber(-500)).toBe("-500");
    expect(formatNumber(-1_500)).toBe("-1.5K");
    expect(formatNumber(-2_300_000)).toBe("-2.3M");
  });

  it("returns '0' for non-finite numbers", () => {
    expect(formatNumber(Number.NaN)).toBe("0");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("0");
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe("0");
  });

  it("promotes to the next unit at 1000 exactly (no off-by-one at the boundary)", () => {
    expect(formatNumber(1_000)).toBe("1.0K");
    expect(formatNumber(1_000_000)).toBe("1.0M");
    expect(formatNumber(1_000_000_000)).toBe("1.0B");
  });
});
