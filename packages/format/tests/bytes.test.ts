import { describe, expect, it } from "vitest";
import { formatBytes } from "../src/bytes.ts";

describe("formatBytes", () => {
  it("formats 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats sub-KB values as integer B", () => {
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(999)).toBe("999 B");
  });

  it("formats KB with 1 decimal place", () => {
    expect(formatBytes(1_000)).toBe("1.0 KB");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(999_499)).toBe("999.5 KB");
  });

  it("formats MB / GB / TB with 1 decimal place", () => {
    expect(formatBytes(1_000_000)).toBe("1.0 MB");
    expect(formatBytes(12_500_000)).toBe("12.5 MB");
    expect(formatBytes(1_000_000_000)).toBe("1.0 GB");
    expect(formatBytes(2_500_000_000_000)).toBe("2.5 TB");
  });

  it("throws on negative numbers", () => {
    expect(() => formatBytes(-1)).toThrow(RangeError);
    expect(() => formatBytes(-1024)).toThrow(RangeError);
  });

  it("throws on non-finite numbers", () => {
    expect(() => formatBytes(Number.NaN)).toThrow(RangeError);
    expect(() => formatBytes(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
