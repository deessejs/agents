import { describe, expect, it } from "vitest";
import { DailyDigestSchema, validateAndEscape, BANNED } from "../agent/lib/digest-schema.ts";

describe("DailyDigestSchema", () => {
  it("rejects unknown keys (strict mode)", () => {
    const result = DailyDigestSchema.safeParse({
      kind: "daily",
      date: "2026-10-06",
      window: { start: "2026-10-05T00:00:00Z", end: "2026-10-05T23:59:59Z" },
      sections: [{ kind: "tldr", text: "Quiet day." }],
      injectedKey: "xss", // strict — should reject
    });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed daily digest with all 4 sections", () => {
    const result = DailyDigestSchema.safeParse({
      kind: "daily",
      date: "2026-10-06",
      window: { start: "2026-10-05T00:00:00Z", end: "2026-10-05T23:59:59Z" },
      sections: [
        { kind: "tldr", text: "3 PRs merged, no incidents." },
        { kind: "shipped", text: "PR #142 — feat: auth." },
        { kind: "risks", text: "PR #1257 open for 18 days." },
        { kind: "watchlist", text: "PR #1258 likely to merge." },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 4 sections", () => {
    const result = DailyDigestSchema.safeParse({
      kind: "daily",
      date: "2026-10-06",
      window: { start: "2026-10-05T00:00:00Z", end: "2026-10-05T23:59:59Z" },
      sections: [
        { kind: "tldr", text: "1" },
        { kind: "shipped", text: "2" },
        { kind: "risks", text: "3" },
        { kind: "watchlist", text: "4" },
        { kind: "tldr", text: "5" }, // 5th section
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects section text > 2000 chars (per-section length cap)", () => {
    const longText = "x".repeat(2001);
    const result = DailyDigestSchema.safeParse({
      kind: "daily",
      date: "2026-10-06",
      window: { start: "2026-10-05T00:00:00Z", end: "2026-10-05T23:59:59Z" },
      sections: [{ kind: "tldr", text: longText }],
    });
    expect(result.success).toBe(false);
  });
});

describe("validateAndEscape", () => {
  it("passes through a clean digest", () => {
    const digest = {
      kind: "daily" as const,
      date: "2026-10-06",
      window: { start: "2026-10-05T00:00:00Z", end: "2026-10-05T23:59:59Z" },
      sections: [{ kind: "tldr" as const, text: "Quiet day." }],
    };
    const out = validateAndEscape(digest);
    expect(out).toBe(digest);
  });

  it("throws on a BANNED-matched section text", () => {
    const digest = {
      kind: "daily" as const,
      date: "2026-10-06",
      window: { start: "2026-10-05T00:00:00Z", end: "2026-10-05T23:59:59Z" },
      sections: [
        { kind: "tldr" as const, text: "Boring day, but <script>alert(1)</script> is here." },
      ],
    };
    expect(() => validateAndEscape(digest)).toThrow(/BANNED content/);
  });
});

describe("BANNED regex re-export", () => {
  it("matches the standard XSS payloads", () => {
    expect(BANNED.test("<script>x</script>")).toBe(true);
    expect(BANNED.test("javascript:alert(1)")).toBe(true);
    expect(BANNED.test("data:text/html,<b>x</b>")).toBe(true);
    expect(BANNED.test("[x](mailto:attacker@x)")).toBe(true);
  });

  it("does not match safe markdown / URLs", () => {
    expect(BANNED.test("## Hello")).toBe(false);
    expect(BANNED.test("[docs](https://example.com)")).toBe(false);
    expect(BANNED.test("plain text with no links")).toBe(false);
  });
});
