/**
 * Tests for path-based redaction — pino's built-in `redact` option covers
 * fixed key paths (headers, env vars). Value-pattern redaction lives in its
 * own test file.
 */

import { describe, expect, it } from "vitest";

import { makeCapturingLogger } from "./test-utils.ts";

describe("redact paths", () => {
  it("redacts the default paths at any depth (wildcard)", () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-test" });
    logger.info("auth header test", {
      headers: {
        authorization: "Bearer eyJhbGciOi...",
        cookie: "session=abc",
        "x-api-key": "key-123",
      },
    });
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured).toHaveLength(1);
    const headers = captured[0]?.headers as Record<string, unknown>;
    expect(headers.authorization).toBe("[REDACTED]");
    expect(headers.cookie).toBe("[REDACTED]");
    expect(headers["x-api-key"]).toBe("[REDACTED]");
  });

  it("redacts custom paths passed in via config.redactPaths", () => {
    const { logger, records } = makeCapturingLogger({
      agent: "agent-test",
      redactPaths: ["*.CUSTOM_SECRET"],
    });
    logger.info("custom secret", {
      body: { CUSTOM_SECRET: "shhh-its-a-secret" },
    });
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured).toHaveLength(1);
    const body = captured[0]?.body as Record<string, unknown>;
    expect(body.CUSTOM_SECRET).toBe("[REDACTED]");
  });

  it("leaves non-secret values untouched (no value redaction here)", () => {
    const { logger, records } = makeCapturingLogger({ agent: "agent-test" });
    logger.info("plain", {
      userId: "u-1",
      count: 7,
      headers: { "x-request-id": "req-9" },
    });
    const captured = records() as Array<Record<string, unknown>>;
    expect(captured).toHaveLength(1);
    expect(captured[0]?.userId).toBe("u-1");
    expect(captured[0]?.count).toBe(7);
    const headers = captured[0]?.headers as Record<string, unknown>;
    expect(headers["x-request-id"]).toBe("req-9");
  });
});
