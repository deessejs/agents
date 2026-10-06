import { describe, expect, it } from "vitest";
import { relativeTime } from "../src/date.ts";

/**
 * Pin the reference time so the relative phrases are deterministic.
 * Every test passes `now` explicitly — no real-clock coupling.
 *
 * Note: date-fns v4 `formatDistance` uses "less than a minute" / "1 minute" /
 * "[2..44] minutes" / "about 1 hour" / "about [2..24] hours" / "1 day" /
 * "[2..30] days" with `addSuffix: true` adding " ago" / "in " prefix.
 * The test below is written to match those exact strings — a future
 * date-fns bump may shift boundaries; if so, update these expectations
 * to match the new format.
 */
const NOW = new Date("2026-10-06T12:00:00Z");

describe("relativeTime", () => {
  it("returns '1 minute ago' for ~30 seconds in the past", () => {
    // date-fns: 30s..1m30s lands in the "1 minute" bucket
    expect(relativeTime(new Date("2026-10-06T11:59:30Z"), NOW)).toBe("1 minute ago");
  });

  it("returns 'about 1 hour ago' for ~45 minutes in the past", () => {
    // date-fns: 44m30s..89m30s lands in the "about 1 hour" bucket
    expect(relativeTime(new Date("2026-10-06T11:15:00Z"), NOW)).toBe("about 1 hour ago");
  });

  it("returns 'about 3 hours ago' for sub-day past", () => {
    // date-fns: 89m30s..23h59m30s lands in the "about [2..24] hours" bucket
    expect(relativeTime(new Date("2026-10-06T09:00:00Z"), NOW)).toBe("about 3 hours ago");
  });

  it("returns '5 days ago' for sub-month past", () => {
    // date-fns: 41h59m30s..29d23h59m30s lands in the "[2..30] days" bucket
    expect(relativeTime(new Date("2026-10-01T12:00:00Z"), NOW)).toBe("5 days ago");
  });

  it("uses 'in X' suffix for future dates", () => {
    expect(relativeTime(new Date("2026-10-06T12:02:00Z"), NOW)).toBe("in 2 minutes");
    expect(relativeTime(new Date("2026-10-06T12:45:00Z"), NOW)).toBe("in about 1 hour");
    expect(relativeTime(new Date("2026-10-06T15:00:00Z"), NOW)).toBe("in about 3 hours");
    expect(relativeTime(new Date("2026-10-07T12:00:00Z"), NOW)).toBe("in 1 day");
  });

  it("always includes a suffix (ago/in/less than)", () => {
    expect(relativeTime(new Date("2026-10-06T11:59:30Z"), NOW)).toMatch(/(ago|in)/);
    expect(relativeTime(new Date("2026-10-06T12:02:00Z"), NOW)).toMatch(/(ago|in)/);
  });

  it("uses the actual Date.now() when `now` is omitted", () => {
    // Pass a date 1 second in the past — should produce a phrase that
    // includes the time, but we only assert it returns a non-empty string.
    const result = relativeTime(new Date(Date.now() - 1000));
    expect(result.length).toBeGreaterThan(0);
  });
});
