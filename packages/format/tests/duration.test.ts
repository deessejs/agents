import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/duration.ts";

describe("formatDuration", () => {
  it("formats 0 as '0s'", () => {
    expect(formatDuration(0)).toBe("0s");
  });

  it("formats sub-minute durations in seconds", () => {
    expect(formatDuration(1_000)).toBe("1s");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(59_500)).toBe("60s");
  });

  it("formats sub-hour durations in minutes (no trailing 0s)", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(30 * 60_000)).toBe("30m");
  });

  it("formats sub-day durations in hours (no trailing 0m)", () => {
    expect(formatDuration(60 * 60_000)).toBe("1h");
    expect(formatDuration(60 * 60_000 + 5 * 60_000)).toBe("1h 5m");
    expect(formatDuration(23 * 3600_000)).toBe("23h");
  });

  it("formats multi-day durations in days + hours", () => {
    expect(formatDuration(24 * 3600_000)).toBe("1d");
    expect(formatDuration(24 * 3600_000 + 3 * 3600_000)).toBe("1d 3h");
    expect(formatDuration(7 * 24 * 3600_000)).toBe("7d");
  });

  it("throws on negative numbers", () => {
    expect(() => formatDuration(-1)).toThrow(RangeError);
    expect(() => formatDuration(-3600_000)).toThrow(RangeError);
  });

  it("throws on non-finite numbers", () => {
    expect(() => formatDuration(Number.NaN)).toThrow(RangeError);
    expect(() => formatDuration(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
