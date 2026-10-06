import { describe, expect, it } from "vitest";
import { formatPercent } from "../src/percent.ts";

describe("formatPercent", () => {
  it("formats 0 as '0%'", () => {
    expect(formatPercent(0)).toBe("0%");
  });

  it("formats 1 as '100%' (integer, no decimal)", () => {
    expect(formatPercent(1)).toBe("100%");
  });

  it("formats integer-valued percentages without a decimal", () => {
    expect(formatPercent(0.25)).toBe("25%");
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.75)).toBe("75%");
  });

  it("formats fractional percentages with 1 decimal place", () => {
    expect(formatPercent(0.125)).toBe("12.5%");
    expect(formatPercent(0.061)).toBe("6.1%");
    expect(formatPercent(0.999)).toBe("99.9%");
  });

  it("rounds to 1 decimal", () => {
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercent(0.5678)).toBe("56.8%");
  });

  it("throws on out-of-range fractions", () => {
    expect(() => formatPercent(-0.01)).toThrow(RangeError);
    expect(() => formatPercent(1.01)).toThrow(RangeError);
    expect(() => formatPercent(2)).toThrow(RangeError);
  });

  it("throws on non-finite numbers", () => {
    expect(() => formatPercent(Number.NaN)).toThrow(RangeError);
    expect(() => formatPercent(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
