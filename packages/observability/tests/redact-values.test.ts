/**
 * Tests for value-pattern redaction. Pino cannot redact by value via its
 * `redact` option, so the `formatters.log` hook in `redact/values.ts` walks
 * every log object and replaces matches. These tests pin down each default
 * pattern and verify nested objects + arrays are walked recursively.
 */

import { describe, expect, it } from "vitest";

import { makeCapturingLogger } from "./test-utils.ts";

describe("redact values", () => {
  it("redacts Resend API keys (re_*) inside any string", () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-test" });
    logger.info("resend", {
      message: "sent using key re_abcdefghijklmnopqrstuv",
    });
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured[0]?.message).toBe("sent using key [REDACTED]");
  });

  it("redacts GitHub PATs (ghp_*, github_pat_*, etc.)", () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-test" });
    logger.info("github", {
      classic: "token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      finegrain: "github_pat_11AAAAAA0aaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured[0]?.classic).not.toContain("ghp_");
    expect(captured[0]?.classic).toContain("[REDACTED]");
    expect(captured[0]?.finegrain).not.toContain("github_pat_");
    expect(captured[0]?.finegrain).toContain("[REDACTED]");
  });

  it("redacts Bearer tokens in the value stream", () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-test" });
    logger.info("bearer", {
      header: "Authorization: Bearer abc123-_./=+",
    });
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured[0]?.header).toBe("Authorization: Bearer [REDACTED]");
  });

  it("redacts email addresses (PII)", () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-test" });
    logger.info("email", {
      contact: "Reach me at alice@example.com any time.",
    });
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured[0]?.contact).toBe("Reach me at [REDACTED] any time.");
  });

  it("walks nested objects and arrays recursively", () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-test" });
    logger.info("nested", {
      users: [
        { name: "alice", email: "alice@example.com" },
        { name: "bob", email: "bob@example.org" },
      ],
      meta: {
        notes: "ping alice@example.com if anything breaks",
      },
    });
    const captured = records() as Array<Record<string, unknown>>;
    const users = captured[0]?.users as Array<Record<string, unknown>>;
    expect(users[0]?.email).toBe("[REDACTED]");
    expect(users[1]?.email).toBe("[REDACTED]");
    expect(users[0]?.name).toBe("alice");
    const meta = captured[0]?.meta as Record<string, unknown>;
    expect(meta.notes).toBe("ping [REDACTED] if anything breaks");
  });

  it("leaves non-secret strings untouched and never leaks the original", () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-test" });
    const original = "hello world";
    logger.info("plain", { greeting: original, count: 5 });
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured[0]?.greeting).toBe(original);
    expect(captured[0]?.count).toBe(5);
    // Re-stringify the whole record — no secret leakage possible.
    const text = JSON.stringify(captured[0]);
    expect(text).toContain(original);
    expect(text).not.toContain("[REDACTED]");
  });
});
